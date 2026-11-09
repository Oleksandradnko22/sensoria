// Profanity (мат) detector — Russian + Ukrainian, plus common Latin
// transliterations, abbreviations and masked spellings (х*й, б**дь,
// х у й, хуууй, xуй…). Pure and dependency-free.
//
// IMPORTANT: supabase/functions/send-message/index.ts carries a verbatim
// copy of everything between the "BEGIN PROFANITY" / "END PROFANITY"
// markers (a Dashboard-deployed Edge Function is a single file and can't
// import this). Keep both in sync by hand, same as contactFilter.ts.
//
// Design: word-level, anchored matching — a root only counts at the START
// of a word (after an optional known prefix), so "потребую", "скребти",
// "дерматолог", "Херсон", "підрядник", "педикюр", "похудеть" or "себорея"
// are NOT flagged.

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
export function detectProfanity(base: string): boolean {
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
