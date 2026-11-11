// Sensoria — send-message Edge Function (Phase 2 server-side moderation).
// Full design: docs/messaging-moderation-architecture.md
//
// This is now the ONLY way a row can land in public.messages — the direct
// client INSERT policy was removed from schema.sql specifically so a
// devtools-savvy user can't bypass moderation by writing to the table
// directly. The client (src/lib/messages.ts) calls this function instead;
// this function verifies who's really calling (via their auth JWT, never a
// client-supplied id), re-runs the same moderation pipeline that used to be
// client-only, logs every decision, and — using the service-role key, which
// bypasses RLS — inserts the message itself if it isn't BLOCKed.
//
// DEPLOY (no CLI needed): Supabase Dashboard -> Edge Functions -> "Deploy a
// new function" -> "Via Editor" -> name it exactly "send-message" -> paste
// this whole file -> Deploy. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are
// provided automatically to every Edge Function by Supabase — no secret to
// configure by hand for this one.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Moderation pipeline — a verbatim port of src/utils/contactFilter.ts.
// Kept in sync by hand (Deno Edge Functions deployed via the Dashboard
// editor are a single file, so this can't just import the app's copy). See
// that file's comments and docs/messaging-moderation-architecture.md for
// the full design rationale — nothing here is new logic, only new
// container.
// ---------------------------------------------------------------------------

type ContactCategory =
  | "CONTACT_PHONE"
  | "CONTACT_EMAIL"
  | "CONTACT_SOCIAL"
  | "CONTACT_MESSENGER"
  | "CONTACT_WEBSITE"
  | "CONTACT_ADDRESS"
  | "EXTERNAL_PAYMENT"
  | "OFF_PLATFORM_COMMUNICATION"
  | "PROFANITY";

type ModerationAction = "ALLOW" | "WARN" | "BLOCK";

// A person who collects this many NEW BLOCK decisions gets a chat ban
// (profiles.chat_banned_until / chat_ban_permanent), escalating each time:
// 3 → 7 → 14 → 30 days → forever (nextChatBan below). The account itself
// is never banned automatically. An admin can lift a ban in the panel.
const CHAT_BAN_BLOCK_LIMIT = 3;

type ModerationResult = {
  action: ModerationAction;
  riskScore: number;
  categories: ContactCategory[];
  detectorsTriggered: string[];
  urlDetected: boolean;
  allowlisted: boolean;
};

const RISK_THRESHOLDS = { warn: 30, block: 60 };

type Hit = { category: ContactCategory; points: number; detector: string };

function collapseNoise(s: string): string {
  return s
    .replace(/\s+/g, " ")
    .replace(/([!?.,])\1{1,}/g, "$1")
    .trim();
}

function despace(s: string): string {
  return s.replace(
    /(?<!\p{L})\p{L}(?:[\s.\-_]+\p{L}(?!\p{L})){2,}/gu,
    (m) => m.replace(/[\s.\-_]+/g, "")
  );
}

function baseNormalize(raw: string): string {
  return despace(collapseNoise(raw.normalize("NFKC").toLowerCase()));
}

const HOMOGLYPHS: Record<string, string> = {
  а: "a",
  е: "e",
  о: "o",
  р: "p",
  с: "c",
  х: "x",
  у: "y",
  і: "i",
};

function foldHomoglyphs(s: string): string {
  return s.replace(/[аеорсхуі]/g, (ch) => HOMOGLYPHS[ch] ?? ch);
}

const NUMBER_WORDS: Record<string, string> = {
  нуль: "0",
  ноль: "0",
  zero: "0",
  один: "1",
  одна: "1",
  one: "1",
  два: "2",
  дві: "2",
  две: "2",
  two: "2",
  три: "3",
  three: "3",
  чотири: "4",
  четыре: "4",
  four: "4",
  "п'ять": "5",
  пять: "5",
  five: "5",
  шість: "6",
  шесть: "6",
  six: "6",
  сім: "7",
  семь: "7",
  seven: "7",
  вісім: "8",
  восемь: "8",
  eight: "8",
  "дев'ять": "9",
  девять: "9",
  nine: "9",
};

function expandNumberWords(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => NUMBER_WORDS[w.replace(/[^\wа-яіїєґ']/gi, "")] ?? w)
    .join(" ");
}

function emailNormalize(s: string): string {
  return s
    .replace(/\s*\(at\)\s*|\s*\[at\]\s*|\s+at\s+|собака/g, "@")
    .replace(/\s*\(dot\)\s*|\s*\[dot\]\s*|\s+dot\s+|крапка|точка/g, ".");
}

const PHONE_PATTERN = /(?:\+?\d[\d\-\s().\/]{6,}\d)/;
const PHONE_REQUEST_PATTERN =
  /(скинь|дай|залиш|напиш|поділ)\p{L}*\s+(свій\s+|ваш\s+|твій\s+)?(номер|телефон)/u;

function detectPhone(base: string): Hit[] {
  const expanded = expandNumberWords(base);
  if (
    PHONE_PATTERN.test(base) ||
    PHONE_PATTERN.test(expanded) ||
    PHONE_REQUEST_PATTERN.test(base)
  ) {
    return [{ category: "CONTACT_PHONE", points: 70, detector: "PhoneDetector" }];
  }
  return [];
}

const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/;
const EMAIL_PROVIDERS = [
  "gmail",
  "outlook",
  "hotmail",
  "icloud",
  "yahoo",
  "protonmail",
  "proton",
  "mail.ru",
  "ukr.net",
  "meta.ua",
  "i.ua",
];
const EMAIL_PROVIDER_PROXIMITY = new RegExp(
  `\\b[a-z0-9._-]{2,}\\s+(${EMAIL_PROVIDERS.map((p) => p.replace(".", "\\.")).join("|")})\\b`
);

const EMAIL_WORDS = ["email", "e-mail", "імейл", "имейл", "пошта", "мейл"];
const EMAIL_SHARE_MARKERS = ["мій", "моя", "нижче", "ось", "поділ"];

function detectEmail(base: string, folded: string): Hit[] {
  const normalized = emailNormalize(base);
  const foldedNormalized = emailNormalize(folded);
  if (
    EMAIL_PATTERN.test(base) ||
    EMAIL_PATTERN.test(normalized) ||
    EMAIL_PATTERN.test(foldedNormalized) ||
    EMAIL_PROVIDER_PROXIMITY.test(base)
  ) {
    return [{ category: "CONTACT_EMAIL", points: 70, detector: "EmailDetector" }];
  }
  if (
    EMAIL_WORDS.some((w) => base.includes(w)) &&
    EMAIL_SHARE_MARKERS.some((m) => base.includes(m))
  ) {
    return [{ category: "CONTACT_EMAIL", points: 60, detector: "EmailDetector" }];
  }
  return [];
}

const HANDLE_PATTERN = /(?:^|[\s(])@[a-zA-Z0-9_.]{3,}/;
const PREFIXED_HANDLE_PATTERN = /(tg|ig|inst|wa|нік)\s*[:\-]\s*[a-zA-Z0-9_.]{3,}/;
const PROFILE_URL_PATTERN =
  /\b(instagram\.com|t\.me|wa\.me|signal\.me|discord\.gg|facebook\.com|linkedin\.com\/in|x\.com|twitter\.com|threads\.net|tiktok\.com)\/[a-zA-Z0-9_.]+/;

function detectSocialHandle(base: string, folded: string): Hit[] {
  if (
    HANDLE_PATTERN.test(base) ||
    PREFIXED_HANDLE_PATTERN.test(base) ||
    PROFILE_URL_PATTERN.test(base) ||
    PROFILE_URL_PATTERN.test(folded)
  ) {
    return [{ category: "CONTACT_SOCIAL", points: 65, detector: "SocialHandleDetector" }];
  }
  return [];
}

const MESSENGER_KEYWORDS = [
  "telegram",
  "телеграм",
  "тєлєграм",
  "тг",
  "whatsapp",
  "вотсап",
  "ватсап",
  "viber",
  "вайбер",
  "signal",
  "сигнал",
  "messenger",
  "мессенджер",
  "месенджер",
  "discord",
  "дискорд",
  "skype",
  "скайп",
  "wechat",
  "line",
  "instagram",
  "інстаграм",
  "инстаграм",
  "insta",
  "інст",
  "инст",
  "threads",
  "facebook",
  "фейсбук",
  "tiktok",
  "тікток",
  "тикток",
  "twitter",
  "твіттер",
  "x.com",
  "linkedin",
  "лінкедін",
  "линкедин",
  "youtube",
  "pinterest",
  "snapchat",
  "снепчат",
  "reddit",
];

const IMPERATIVE_MARKERS = [
  "напишіть",
  "напиши",
  "пишіть",
  "пиши",
  "зв'яжіться",
  "зв'яжись",
  "зателефонуйте",
  "подзвони",
  "подзвоніть",
  "message me",
  "call me",
  "contact me",
  "dm me",
  "дайте",
  "дай",
  "знайдіть мене",
  "шукайте мене",
  "мій",
  "моя",
  "давайте",
  "перейдемо",
  "переходьте",
  "продовжимо",
  "можна ваш",
  "можна твій",
  "можна твоя",
  "можна вашу",
  "можна ваша",
];

function detectMessenger(base: string, folded: string): Hit[] {
  const mentioned = MESSENGER_KEYWORDS.some(
    (kw) => base.includes(kw) || folded.includes(kw)
  );
  if (!mentioned) return [];

  const hasImperative = IMPERATIVE_MARKERS.some((m) => base.includes(m));
  return [
    {
      category: "CONTACT_MESSENGER",
      points: hasImperative ? 60 : 15,
      detector: "MessengerKeywordDetector",
    },
  ];
}

const PAYMENT_KEYWORDS = [
  "оплатіть напряму",
  "дешевше без платформи",
  "скину реквізити",
  "оплата на карту",
  "paypal",
  "venmo",
  "wise",
  "revolut",
  "monobank",
  "приватбанк",
  "iban",
  "номер картки",
  "банківські реквізити",
  "крипта",
  "usdt",
  "btc",
  "eth",
  "донат",
  "переказ",
];
const CARD_PATTERN = /\b(?:\d[ -]?){13,19}\b/;

function detectPayment(base: string): Hit[] {
  const keywordHit = PAYMENT_KEYWORDS.some((kw) => base.includes(kw));
  const cardHit = CARD_PATTERN.test(base);
  if (keywordHit || cardHit) {
    return [{ category: "EXTERNAL_PAYMENT", points: 75, detector: "PaymentDetector" }];
  }
  return [];
}

const URL_PATTERN =
  /\bhttps?:\/\/\S+|\bwww\.\S+|\b[a-z0-9-]+\.(com|net|org|ua|io|me|app|co|gg)\b/i;
const URL_SHORTENERS = ["bit.ly", "tinyurl", "t.co", "goo.gl", "is.gd", "cutt.ly", "shorturl"];
const SENSORIA_ALLOWLIST = ["sensoria.app", "sensoria.ua", "sensoria.courses", "support@sensoria.app"];

function isSensoriaAllowlisted(base: string): boolean {
  return SENSORIA_ALLOWLIST.some((entry) => base.includes(entry));
}

function detectUrl(base: string): { hits: Hit[]; urlDetected: boolean } {
  const match = URL_PATTERN.exec(base);
  if (!match) return { hits: [], urlDetected: false };

  const isShortener = URL_SHORTENERS.some((s) => base.includes(s));
  return {
    hits: [
      {
        category: "CONTACT_WEBSITE",
        points: isShortener ? 50 : 80,
        detector: "UrlDetector",
      },
    ],
    urlDetected: true,
  };
}

const ADDRESS_KEYWORDS = ["адреса", "вулиця", "вул.", "буд.", "кв.", "студія", "офіс", "кабінет"];
const PERSONAL_DIRECT_MARKERS = ["до мене", "ось адреса", "приходьте до мене", "приходь до мене"];

function detectAddress(base: string): Hit[] {
  const hasAddressWord = ADDRESS_KEYWORDS.some((kw) => base.includes(kw));
  const hasPersonalMarker = PERSONAL_DIRECT_MARKERS.some((m) => base.includes(m));
  if (hasAddressWord && hasPersonalMarker) {
    return [{ category: "CONTACT_ADDRESS", points: 45, detector: "AddressContextDetector" }];
  }
  return [];
}

const OFF_PLATFORM_KEYWORDS = [
  "поза платформою",
  "поза сайтом",
  "консультація",
  "консультації",
  "консультацію",
  "консультацией",
  "консультация",
  "особиста зустріч",
  "особистій зустрічі",
  "приватний урок",
  "приватного уроку",
  "зв'яжіться зі мною",
  "зв'яжись зі мною",
  "напишіть мені особисто",
  "напиши мені особисто",
];

function detectOffPlatform(base: string): Hit[] {
  if (OFF_PLATFORM_KEYWORDS.some((kw) => base.includes(kw))) {
    return [{ category: "OFF_PLATFORM_COMMUNICATION", points: 60, detector: "OffPlatformDetector" }];
  }
  return [];
}

// ---- BEGIN PROFANITY ----
// Prefixes that can precede an obscene root ("на-хуй", "по-ебать", "вы-ебал").
// (written in the normalized alphabet: «вы» → «ви»)
const PF_PRE = "(?:на|по|за|ви|до|от|об|обо|под|при|про|раз|рас|с|у|пере|недо|вс|в|ис|из|о|а|ни)?";

// Roots are written in a normalized alphabet: і → и, ї → е (їбати = ебать),
// є → е, ё → е, ы → и, ґ → г; ъ and apostrophes removed. ь is kept (so "дерьмо" ≠ "дерматолог").
const PROFANITY_ROOTS: RegExp[] = [
  new RegExp(`^${PF_PRE}ху[йяею]`), // хуй, хуя, хуе(вый), хую, нахуй, похуй, охуеть
  /^хуи/, // хуї / хуі → хуи
  /^хул[ие]$/, // хули / хуле
  new RegExp(`^${PF_PRE}пизд`), // пизда, пиздец, спиздил
  new RegExp(`^${PF_PRE}е(?:бат|бал|бав|бан|бок|буч|бл|бн|бош|бу$|бут|буть|бусь|буся)`), // ебать, ебал, ебаный, ебло, уебок…
  /^бл(?:яд|ят)/, // блядь, блять, блядина
  /^бля$/,
  /^(?:с?сука|суки|суку|суке|сукой|сукою|сукам|сучка|сучки|сучку|сучкой|сучара|сучары|сучий|сучье|сучонок)$/,
  /^(?:мудак|мудил|мудозвон|мудень|мудло|мудаш)/,
  /^(?:пидор|пидар|пидрила|пидорас|педераст|педрил)/,
  /^педик(?:$|и|а|у|ом|ов|ам)$/, // педик, но не «педикюр»
  /^(?:за|по)?залуп/,
  /^г[ао]ндон/,
  /^шлюх/,
  /^шалав/,
  /^курв/,
  new RegExp(`^${PF_PRE}дроч`),
  new RegExp(`^${PF_PRE}(?:говн|гивн)`), // говно, гівно
  /^дерьм/,
  /^жоп/,
  new RegExp(`^${PF_PRE}срат`), // срать, насрать
  /^(?:с?срак|сран(?:ий|ая|ое|ие|ь|а)$)/,
  /^ублюд/,
  // Short forms / abbreviations / euphemisms — exact words only.
  /^(?:хер|нахер|похер|нах|пох|пздц|ппц|пзд|хуйня)$/,
];

// Latin transliteration (checked on tokens written ONLY in Latin letters).
const PROFANITY_LATIN: RegExp[] = [
  /^(?:nah|na|po)?(?:xuy|huy|xui|xuj|huj)/,
  /^(?:nah|po)?hui$/,
  /^(?:s|na|po|ras)?pizd/,
  /^(?:blya|blyat|blyad|bliat|bliad)/,
  /^(?:suka|syka|suchka)$/,
  /^(?:za|vy|po|na|do|ot|ob|pod|pri|raz|u|s)?(?:ebat|ebal|eban|ebuch|yebat|yebal|yeban)/,
  /^(?:mudak|mudila|mudozvon)/,
  /^(?:pidor|pidar|pidoras|pidaras)/,
  /^(?:zalupa|zalupy)/,
  /^(?:gandon|gondon)/,
  /^(?:shlyuh|shluh|shlyukh)/,
  /^(?:dolboeb|dolbaeb|dolboyob)/,
  /^(?:zhopa|jopa)$/,
  /^(?:ahuel|ohuel|ahuenn|ohuenn)/,
];

// Canonical spellings used to match masked words (х*й, бл***ь, с*ка…).
const PF_MASK_CANON = [
  "хуй", "хуя", "хуе", "хую", "нахуй", "похуй", "пизда", "пизду", "пиздец", "пизды",
  "блядь", "блять", "бляди", "ебать", "ебал", "ебан", "ебаный", "сука", "суки", "сучка",
  "мудак", "пидор", "пидар", "залупа", "гандон", "шлюха", "жопа", "говно", "дерьмо",
];

// Latin look-alikes and leetspeak folded into Cyrillic (only inside words
// that already contain at least one Cyrillic letter).
const CYR_LOOKALIKE: Record<string, string> = {
  a: "а", e: "е", o: "о", p: "р", c: "с", x: "х", y: "у", k: "к", m: "м", t: "т", i: "и", h: "н",
  "0": "о", "@": "а",
};

function pfNormalizeCyr(t: string): string {
  return t
    .replace(/ё/g, "е")
    .replace(/ї/g, "е")
    .replace(/і/g, "и")
    .replace(/є/g, "е")
    .replace(/ы/g, "и")
    .replace(/ґ/g, "г")
    .replace(/[ъ'’`ʼ]/g, "");
}

// "хуууй" → "хуй", "ссука" → "сука".
const pfCollapse = (t: string) => t.replace(/(.)\1+/g, "$1");

function pfCyrWordHit(w: string): boolean {
  return w.length > 0 && PROFANITY_ROOTS.some((r) => r.test(w));
}

function pfMaskedHit(token: string): boolean {
  // Mask only inside / at the end of the word, and at least 2 real letters.
  if (token.replace(/\*/g, "").length < 2 || token.startsWith("*")) return false;
  const rx = new RegExp("^" + token.replace(/\*+/g, ".{1,3}") + "$");
  return PF_MASK_CANON.some((c) => rx.test(pfNormalizeCyr(c)));
}

/**
 * True if the text contains Russian/Ukrainian obscene language, in plain,
 * obfuscated, abbreviated, transliterated or masked form. `base` is
 * expected pre-normalized (lowercase, NFKC, spaced-out letters merged) —
 * pass the same string the other detectors use.
 */
function detectProfanity(base: string): boolean {
  // Apostrophes join a word ("пох'ід", "хер'сон") — they must not split it.
  const tokens = base.replace(/['’ʼ`]/g, "").split(/[^\p{L}\p{N}*@]+/u).filter(Boolean);
  for (const raw of tokens) {
    const hasCyr = /[а-яіїєґё]/.test(raw);
    const hasLat = /[a-z]/.test(raw);

    if (hasCyr) {
      const folded = raw.replace(/[a-z0@]/g, (ch) => CYR_LOOKALIKE[ch] ?? ch);
      const norm = pfNormalizeCyr(folded);
      if (raw.includes("*")) {
        if (pfMaskedHit(norm) || pfMaskedHit(pfCollapse(norm))) return true;
      } else if (pfCyrWordHit(norm) || pfCyrWordHit(pfCollapse(norm))) {
        return true;
      }
    } else if (hasLat && !raw.includes("*")) {
      const lat = raw.replace(/0/g, "o");
      if (PROFANITY_LATIN.some((r) => r.test(lat) || r.test(pfCollapse(lat)))) return true;
    }
  }
  return false;
}
// ---- END PROFANITY ----

function detectProfanityHit(base: string): Hit[] {
  return detectProfanity(base)
    ? [{ category: "PROFANITY", points: 70, detector: "ProfanityDetector" }]
    : [];
}

function moderateMessage(text: string): ModerationResult {
  if (!text.trim()) {
    return {
      action: "ALLOW",
      riskScore: 0,
      categories: [],
      detectorsTriggered: [],
      urlDetected: false,
      allowlisted: false,
    };
  }

  const collapsed = collapseNoise(text.normalize("NFKC").toLowerCase());
  const base = baseNormalize(text);
  const folded = foldHomoglyphs(base);
  const url = detectUrl(base);
  const allowlisted = isSensoriaAllowlisted(base);

  let hits: Hit[] = [
    ...detectPhone(base),
    ...detectEmail(base, folded),
    ...detectSocialHandle(base, folded),
    ...detectMessenger(base, folded),
    ...detectPayment(base),
    ...url.hits,
    ...detectAddress(base),
    ...detectOffPlatform(base),
    ...detectProfanityHit(base),
  ];

  if (allowlisted) {
    hits = hits.filter((h) => h.category !== "CONTACT_EMAIL" && h.category !== "CONTACT_WEBSITE");
  }

  const wasObfuscated = hits.length > 0 && despace(collapsed) !== collapsed;
  if (wasObfuscated) {
    hits = [...hits, { category: hits[0].category, points: 20, detector: "ObfuscationBonus" }];
  }

  const riskScore = Math.min(100, hits.reduce((sum, h) => sum + h.points, 0));
  const categories = Array.from(new Set(hits.map((h) => h.category)));
  const detectorsTriggered = Array.from(new Set(hits.map((h) => h.detector)));

  const action: ModerationAction =
    riskScore >= RISK_THRESHOLDS.block
      ? "BLOCK"
      : riskScore >= RISK_THRESHOLDS.warn
      ? "WARN"
      : "ALLOW";

  return { action, riskScore, categories, detectorsTriggered, urlDetected: url.urlDetected, allowlisted };
}

// ---- BEGIN CHATBAN ----
const CHAT_BAN_DAYS = [3, 7, 14, 30];

type NextChatBan = { count: number; permanent: boolean; untilIso: string | null };

/** The ban that follows `priorBans` earlier bans (0 → the first one). */
function nextChatBan(priorBans: number, nowMs: number): NextChatBan {
  const count = priorBans + 1;
  const days = CHAT_BAN_DAYS[count - 1];
  if (days === undefined) return { count, permanent: true, untilIso: null };
  return { count, permanent: false, untilIso: new Date(nowMs + days * 86_400_000).toISOString() };
}
// ---- END CHATBAN ----

// ---------------------------------------------------------------------------
// HTTP handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Не авторизовано." }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify who's really calling — a client-supplied "senderId" is never
    // trusted, only the identity baked into their own auth token is.
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await authClient.auth.getUser();
    if (userError || !userData.user) {
      return json({ error: "Не авторизовано." }, 401);
    }
    const senderId = userData.user.id;

    const payload = await req.json().catch(() => null);

    // ── BROADCAST: one message from an author to their participants (supabase/messages-scale.sql) ──
    // Delivered as ordinary messages (each person sees it in their own inbox), moderated like any message,
    // at most one per 24 hours, at most 1500 characters and 5000 people; no e-mails (in-app only, no mass mail).
    if (payload?.action === "broadcast") {
      const admin = createClient(supabaseUrl, serviceKey);
      const bText = typeof payload?.text === "string" ? payload.text.trim() : "";
      const bContent = typeof payload?.contentId === "string" && /^[0-9a-f-]{36}$/i.test(payload.contentId) ? payload.contentId : null;
      if (bText.length < 10 || bText.length > 1500) return json({ error: "Текст розсилки — від 10 до 1500 символів." }, 400);
      const { data: me } = await admin.from("profiles").select("role, is_admin, chat_banned_until, chat_ban_permanent").eq("id", senderId).maybeSingle();
      if (!me || me.role !== "author") return json({ error: "Розсилка доступна лише авторам." }, 403);
      const banUntil = me.chat_banned_until ? Date.parse(me.chat_banned_until) : NaN;
      if (!me.is_admin && (me.chat_ban_permanent || (Number.isFinite(banUntil) && banUntil > Date.now()))) {
        return json({ error: "Чат для вашого акаунта заблоковано, тому розсилка зараз недоступна." }, 403);
      }
      const mod = moderateMessage(bText);
      if (mod.action === "BLOCK") {
        return json({ error: "Розсилка містить контакти, посилання для спілкування поза Sensoria або грубі слова, тому її не можна надіслати." }, 400);
      }
      const day = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: recent } = await admin.from("author_broadcasts").select("created_at").eq("author_id", senderId).gte("created_at", day).order("created_at", { ascending: false }).limit(1);
      if (recent && recent.length > 0) {
        const next = new Date(Date.parse(recent[0].created_at) + 24 * 60 * 60 * 1000);
        return json({ error: `Розсилку можна надсилати раз на добу. Наступна — після ${next.toLocaleString("uk-UA", { timeZone: "Europe/Kyiv", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}.` }, 429);
      }
      if (bContent) {
        const { data: own } = await admin.from("content").select("id").eq("id", bContent).eq("author_id", senderId).maybeSingle();
        if (!own) return json({ error: "Матеріал не знайдено." }, 404);
      }
      const { data: rec, error: recError } = await admin.rpc("author_broadcast_recipients", { p_author: senderId, p_content: bContent });
      if (recError) return json({ error: "Розсилка ще не підключена в базі (supabase/messages-scale.sql)." }, 500);
      const ids = Array.from(new Set(((rec ?? []) as { user_id: string }[]).map((r) => r.user_id))).slice(0, 5000);
      if (ids.length === 0) return json({ error: "Поки немає учасників, яким можна надіслати розсилку." }, 400);
      for (let i = 0; i < ids.length; i += 500) {
        const rows = ids.slice(i, i + 500).map((rid) => ({ sender_id: senderId, recipient_id: rid, content_id: bContent, body: bText, moderation_action: mod.action }));
        const { error: insErr } = await admin.from("messages").insert(rows);
        if (insErr) return json({ error: insErr.message }, 500);
      }
      await admin.from("author_broadcasts").insert({ author_id: senderId, content_id: bContent, body: bText, recipients: ids.length });
      return json({ ok: true, sent: ids.length, warned: mod.action === "WARN" });
    }

    const recipientId = payload?.recipientId as string | undefined;
    const contentId = (payload?.contentId as string | null | undefined) ?? null;
    const text = payload?.text as string | undefined;

    if (!recipientId || typeof text !== "string" || !text.trim()) {
      return json({ error: "Некоректний запит." }, 400);
    }

    // An author who has left the platform can no longer be written to
    // (buyers keep access to what they bought, but the chat is closed).
    // Select error / missing column -> treated as "still here".
    {
      const guard = createClient(supabaseUrl, serviceKey);
      const { data: recipientProfile } = await guard
        .from("profiles")
        .select("left_platform_at")
        .eq("id", recipientId)
        .maybeSingle();
      if (recipientProfile?.left_platform_at) {
        return json({ error: "Автор завершив співпрацю з платформою, тому нові повідомлення йому недоступні. Придбані матеріали залишаються у вашому доступі." }, 403);
      }
    }

    const result = moderateMessage(text);

    // Service-role client — bypasses RLS. This is the only place in the
    // whole app that writes to `messages` or `message_moderation_log`.
    const admin = createClient(supabaseUrl, serviceKey);

    // Chat-banned senders are stopped before any moderation or insert, and
    // nothing is logged for them (so a ban can't snowball into the next one).
    // (select errors → columns missing → treated as "not banned".)
    const { data: senderProfile } = await admin
      .from("profiles")
      .select("is_admin, chat_banned_until, chat_ban_permanent, chat_ban_count, chat_ban_since")
      .eq("id", senderId)
      .maybeSingle();
    if (senderProfile && !senderProfile.is_admin) {
      const untilMs = senderProfile.chat_banned_until ? Date.parse(senderProfile.chat_banned_until) : NaN;
      const active = senderProfile.chat_ban_permanent || (Number.isFinite(untilMs) && untilMs > Date.now());
      if (active) {
        return json({
          delivered: false,
          action: "BLOCK",
          escalated: true,
          chatBanned: true,
          chatBanPermanent: !!senderProfile.chat_ban_permanent,
          chatBanUntil: senderProfile.chat_ban_permanent ? null : senderProfile.chat_banned_until,
        });
      }
    }

    // Cross-session, account-level escalation (design doc §21) — reads
    // the persistent log instead of a client-side counter that used to
    // reset on reload/logout/new device.
    let escalated = false;
    if (result.action === "BLOCK") {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { count } = await admin
        .from("message_moderation_log")
        .select("id", { count: "exact", head: true })
        .eq("sender_id", senderId)
        .eq("action", "BLOCK")
        .gte("created_at", since);
      escalated = (count ?? 0) >= 2; // this attempt would be the 3rd within 30 days
    }

    // Log every decision, ALLOW included — never the raw message body,
    // only the redacted signal (design doc's logging requirements).
    await admin.from("message_moderation_log").insert({
      sender_id: senderId,
      recipient_id: recipientId,
      content_id: contentId,
      action: result.action,
      risk_score: result.riskScore,
      categories: result.categories,
      detectors_triggered: result.detectorsTriggered,
      url_detected: result.urlDetected,
      allowlisted: result.allowlisted,
    });

    // Chat ban: 3 BLOCKs since the last ban (or since an admin lifted one)
    // ban this person's CHAT — they can still use the rest of the platform.
    // Admins are never chat-banned. Length escalates: see nextChatBan().
    if (result.action === "BLOCK" && senderProfile && !senderProfile.is_admin) {
      let q = admin
        .from("message_moderation_log")
        .select("id", { count: "exact", head: true })
        .eq("sender_id", senderId)
        .eq("action", "BLOCK");
      if (senderProfile.chat_ban_since) q = q.gte("created_at", senderProfile.chat_ban_since);
      const { count: blockTotal } = await q;
      if ((blockTotal ?? 0) >= CHAT_BAN_BLOCK_LIMIT) {
        const ban = nextChatBan(senderProfile.chat_ban_count ?? 0, Date.now());
        await admin
          .from("profiles")
          .update({
            chat_banned_until: ban.untilIso,
            chat_ban_permanent: ban.permanent,
            chat_ban_count: ban.count,
            chat_ban_since: new Date().toISOString(),
          })
          .eq("id", senderId);
        // Best-effort email so the person learns about the ban right away
        // (needs the RESEND_API_KEY secret; silently skipped without it).
        const resendKey = Deno.env.get("RESEND_API_KEY");
        if (resendKey) {
          const { data: who } = await admin.from("profiles").select("email").eq("id", senderId).maybeSingle();
          if (who?.email) {
            const lengthText = ban.permanent
              ? "назавжди"
              : `до ${new Date(ban.untilIso!).toLocaleDateString("uk-UA", { day: "numeric", month: "long", year: "numeric" })}`;
            await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                from: Deno.env.get("RESEND_FROM") ?? "Sensoria <onboarding@resend.dev>",
                to: who.email,
                subject: "Чат на Sensoria тимчасово заблоковано",
                text: `Через повторні порушення правил спілкування ваш чат на Sensoria заблоковано ${lengthText}. Решта можливостей платформи працює як раніше. Якщо це помилка — напишіть у підтримку на сайті.`,
              }),
            }).catch(() => {});
          }
        }
        return json({
          delivered: false,
          action: "BLOCK",
          escalated: true,
          chatBanned: true,
          chatBanPermanent: ban.permanent,
          chatBanUntil: ban.untilIso,
          profanity: result.categories.includes("PROFANITY"),
        });
      }
    }

    if (result.action === "BLOCK") {
      return json({
        delivered: false,
        action: "BLOCK",
        escalated,
        profanity: result.categories.includes("PROFANITY"),
      });
    }

    const { error: insertError } = await admin.from("messages").insert({
      sender_id: senderId,
      recipient_id: recipientId,
      content_id: contentId,
      body: text,
      moderation_action: result.action,
    });
    if (insertError) {
      return json({ error: insertError.message }, 500);
    }

    return json({ delivered: true, action: result.action, escalated: false });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Помилка сервера." }, 500);
  }
});
