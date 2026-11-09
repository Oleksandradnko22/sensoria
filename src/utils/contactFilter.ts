// Sensoria messaging moderation — Phase 1 (client-side) detector pipeline.
// Full design: docs/messaging-moderation-architecture.md
//
// This is a UX-level filter, not a security boundary — anything running in
// the browser can be bypassed via devtools. Real enforcement needs a
// server to re-check every message on receipt (Phase 2 — no backend exists
// in this project yet, so that part is roadmap only).
//
// Pipeline: normalize → per-category detectors → risk score → action.
// Detectors are independent, small functions rather than one giant regex,
// so each can be tuned/tested on its own.

import { detectProfanity } from "./profanityFilter.ts";

export type ContactCategory =
  | "CONTACT_PHONE"
  | "CONTACT_EMAIL"
  | "CONTACT_SOCIAL"
  | "CONTACT_MESSENGER"
  | "CONTACT_WEBSITE"
  | "CONTACT_ADDRESS"
  | "EXTERNAL_PAYMENT"
  | "OFF_PLATFORM_COMMUNICATION"
  | "PROFANITY";

export type ModerationAction = "ALLOW" | "WARN" | "BLOCK";

export type ModerationResult = {
  action: ModerationAction;
  riskScore: number;
  categories: ContactCategory[];
  detectorsTriggered: string[];
  urlDetected: boolean;
  allowlisted: boolean;
};

// Configurable, not hard-coded — see docs/messaging-moderation-architecture.md §5.
const RISK_THRESHOLDS = { warn: 30, block: 60 };

type Hit = { category: ContactCategory; points: number; detector: string };

// ---------------------------------------------------------------------------
// Normalization (§3 of the design doc)
// ---------------------------------------------------------------------------

function collapseNoise(s: string): string {
  return s
    .replace(/\s+/g, " ")
    .replace(/([!?.,])\1{1,}/g, "$1")
    .trim();
}

// Merges letters that were deliberately spaced out to dodge keyword
// matching: "t e l e g r a m" -> "telegram", "і н с т а" -> "інста".
// Uses \p{L} (Unicode letter) with lookaround boundaries rather than
// \w/\b, because JS's \w and \b are ASCII-only and silently fail to see
// Cyrillic letters as "word" characters at all.
function despace(s: string): string {
  return s.replace(
    /(?<!\p{L})\p{L}(?:[\s.\-_]+\p{L}(?!\p{L})){2,}/gu,
    (m) => m.replace(/[\s.\-_]+/g, "")
  );
}

function baseNormalize(raw: string): string {
  return despace(collapseNoise(raw.normalize("NFKC").toLowerCase()));
}

// Cyrillic letters that are visually indistinguishable from Latin ones —
// used to spell an English platform name so a Latin-only regex misses it
// (e.g. Cyrillic "е" instead of Latin "e" in "tеlegram"). Folding these to
// their Latin lookalike gives a second candidate string to check Latin
// keywords against, without touching genuine Cyrillic words (a real
// Cyrillic word run through this fold no longer matches any Latin keyword
// either way, so it can't produce a false positive).
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

// ---------------------------------------------------------------------------
// Detectors (§2)
// ---------------------------------------------------------------------------

const PHONE_PATTERN = /(?:\+?\d[\d\-\s().\/]{6,}\d)/;
// Catches a request/offer to exchange a phone number even when no digits
// are actually present yet ("Скиньте свій номер", "Дайте ваш номер").
// \p{L}* (not \w*) because \w is ASCII-only and won't extend over Cyrillic
// verb endings like "скиньте", "дайте".
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

// Catches "мій email нижче" / "поділюсь поштою" style mentions that
// reference sharing an email without an actual address being present yet.
// Plain substring checks, not \b-bounded regex — \b is ASCII-only in JS
// and silently never matches around Cyrillic words like "пошта"/"мейл".
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
// No leading \b — it's ASCII-only in JS and never matches before the
// Cyrillic "нік" alternative, so it would silently be unreachable.
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
    return [
      {
        category: "EXTERNAL_PAYMENT",
        points: 75,
        detector: "PaymentDetector",
      },
    ];
  }
  return [];
}

const URL_PATTERN =
  /\bhttps?:\/\/\S+|\bwww\.\S+|\b[a-z0-9-]+\.(com|net|org|ua|io|me|app|co|gg)\b/i;
const URL_SHORTENERS = ["bit.ly", "tinyurl", "t.co", "goo.gl", "is.gd", "cutt.ly", "shorturl"];
// Placeholder allowlist — real domains go here once Sensoria has one. Checked
// once in the pipeline (§9) and applied to both URL and email hits, since
// "support@sensoria.app" is an email match, not a URL match.
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
    return [
      {
        category: "OFF_PLATFORM_COMMUNICATION",
        points: 60,
        detector: "OffPlatformDetector",
      },
    ];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Pipeline entry point
// ---------------------------------------------------------------------------

// Obscene language (RU + UK) — 70 points = BLOCK on its own, same as the
// strongest contact signals. See profanityFilter.ts.
function detectProfanityHit(base: string): Hit[] {
  return detectProfanity(base)
    ? [{ category: "PROFANITY", points: 70, detector: "ProfanityDetector" }]
    : [];
}

/** Shown (everywhere) when a text was blocked because of obscene language. */
export const PROFANITY_BLOCK_MESSAGE =
  "Це повідомлення не вдалося надіслати: у ньому є лексика, неприйнятна на Sensoria. Будь ласка, спілкуйтесь із повагою.";

/** True when the text was blocked specifically because of obscene language. */
export function containsProfanity(text: string): boolean {
  return moderateMessage(text).categories.includes("PROFANITY");
}

export function moderateMessage(text: string): ModerationResult {
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

  // Official Sensoria links/addresses short-circuit to allowed (§9) —
  // strip any email/website hit that's just our own domain.
  if (allowlisted) {
    hits = hits.filter((h) => h.category !== "CONTACT_EMAIL" && h.category !== "CONTACT_WEBSITE");
  }

  // Deliberately spacing letters out ("t e l e g r a m") is itself a
  // bypass signal (§9) — bump the score a bit further when normalization
  // actually had to collapse spaced-out text, but only on top of an
  // existing hit, so an innocuous spaced-out sentence with no keyword
  // match at all still isn't flagged.
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

  return {
    action,
    riskScore,
    categories,
    detectorsTriggered,
    urlDetected: url.urlDetected,
    allowlisted,
  };
}

// Thin boolean wrapper for call sites that only need a yes/no.
export function containsContactInfo(text: string): boolean {
  return moderateMessage(text).action === "BLOCK";
}

// ---------------------------------------------------------------------------
// Repeated-violation counter — session-scoped only (in-memory, resets on
// reload). A stand-in for the design doc's §21 escalation ladder, which for
// real cross-session/account-level enforcement needs a backend that
// doesn't exist in this prototype yet.
// ---------------------------------------------------------------------------

const violationCounts = new Map<string, number>();

export function recordViolation(conversationKey: string): number {
  const next = (violationCounts.get(conversationKey) ?? 0) + 1;
  violationCounts.set(conversationKey, next);
  return next;
}
