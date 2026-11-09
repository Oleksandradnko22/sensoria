# Sensoria Messaging Moderation — Architecture

## 0. Reality check: what exists today

Before the target design: Sensoria's messaging surface today is `src/components/author/AuthorMessages.tsx` (author inbox replies + broadcasts) backed by `src/utils/contactFilter.ts`. The whole app is **client-only** — React/Vite/TS, no backend, no API, no database, no auth server, no file/image upload, no OCR or QR infrastructure. `containsContactInfo()` runs synchronously in the browser against outgoing text only, right before a mock "send."

That matters for this design: anything that runs purely in the browser is a **UX nicety, not a security boundary** — a user can open devtools and bypass any client-side check. Real enforcement of "no contact exchange" requires a server that re-checks every message on receipt, and that server doesn't exist yet.

So this document is split into:

- **Phase 1 — buildable now**, entirely client-side, no backend. This upgrades `contactFilter.ts` from a flat keyword list into the modular pipeline below, and ships this session once you approve it.
- **Phase 2 — needs a backend** (server-side re-validation, persistent logs, OCR/QR, escalation, admin-configurable thresholds). Documented as a roadmap so Phase 1 is built in a shape that drops into it later, not thrown away.

Every section below is tagged `[Phase 1]` or `[Phase 2]`.

---

## 1. Pipeline architecture

```
Raw message
  → Unicode normalize (NFKC)
  → Lowercase
  → Whitespace normalize
  → Obfuscation normalize (homoglyphs, spaced-out letters, "at/dot" verbal email, number-words)
  → URL extraction
  → Phone detector
  → Email detector
  → Social handle detector
  → Messenger/platform-name detector
  → Payment detector
  → Address/context detector
  → Intent classification (combine signals + surrounding verbs like "напишіть", "зв'яжіться")
  → Risk scoring
  → [Phase 2] OCR pass if message has an image attachment
  → [Phase 2] Server-side authoritative re-check
  → Final decision: ALLOW / WARN / REVIEW / BLOCK
```

Steps up to and including risk scoring are pure functions over a string — **[Phase 1]**, doable today. OCR, authoritative server re-check, persistent logging, and cross-session escalation need a backend — **[Phase 2]**.

Each detector is its own module with one job (`detectPhone(text)`, `detectEmail(text)`, …) returning `{ matched: boolean, category: ContactCategory, confidence: number }[]` rather than one giant regex — this is what section 18 of your spec asked for, and it's also just easier to test and tune independently.

## 2. Detector modules `[Phase 1]`

| Module | Detects |
|---|---|
| `PhoneDetector` | UA/EU/US/UK-shaped digit runs, including `+380`, `0XX`, spaced/dotted/dashed formats, and a small set of spelled-out digit words (RU/UA/EN) |
| `EmailDetector` | `user@domain.tld` plus verbal obfuscation (`at`, `dot`, `собака`, `крапка`, `точка`) and spaced-out variants |
| `SocialHandleDetector` | `@handle`, `platform: handle` patterns (`tg:`, `ig:`, `inst:`, `wa:`), and bare profile URLs (`instagram.com/...`, `t.me/...`, `wa.me/...`, etc.) |
| `MessengerKeywordDetector` | Platform/app names (Telegram, WhatsApp, Viber, Signal, Messenger, Discord, Skype, WeChat, LINE, Instagram, Threads, Facebook, TikTok, X/Twitter, LinkedIn, YouTube, Pinterest, Snapchat, Reddit) — scored low alone, scored high when paired with an imperative ("напишіть", "пишіть", "зв'яжіться", "message me") |
| `PaymentDetector` | Card/IBAN-shaped digit runs, bank names (monobank, ПриватБанк), payment services (PayPal, Wise, Revolut, Venmo), crypto terms (USDT, BTC, ETH, "крипта"), and phrases like "оплата на карту", "скину реквізити" |
| `UrlDetector` | Any `http(s)://`, `www.`, bare-domain, or "domain dot com" pattern; flags known shorteners (bit.ly, tinyurl, t.co, goo.gl, is.gd, cutt.ly) as higher-risk since the destination is hidden |
| `AddressContextDetector` | Best-effort keyword heuristic distinguishing "practice happens in Kyiv" (public, allowed) from "прийдіть до мене в студію, ось адреса" (personal, blocked). True context understanding is a **[Phase 2]** problem — see §11 — a keyword heuristic will misfire sometimes and that's an accepted tradeoff for Phase 1 |
| `ObfuscationNormalizer` | Not a detector itself — shared preprocessing all detectors run on top of |
| `IntentClassifier` | Combines raw detector hits into one of the categories in §4 |
| `RiskScorer` | Turns classified hits into the 0–100 score in §5 |

## 3. Normalization strategy `[Phase 1]`

Run before any detector sees the text:

1. Unicode NFKC normalize, strip zero-width characters.
2. Lowercase.
3. Collapse repeated whitespace and punctuation runs (`t....e...l.e.gram` → `telegram`).
4. Collapse "spaced-out" text: a regex pass merging single letters separated only by spaces (`t e l e g r a m` → `telegram`, `i n s t a` → `insta`).
5. Homoglyph map: common Cyrillic/Latin lookalikes normalized to one alphabet before matching (а/a, е/e, о/o, р/p, с/c, х/x, у/y, і/i).
6. Verbal email obfuscation: `at`/`(at)`/`[at]`/`собака` → `@`, `dot`/`крапка`/`точка` → `.`, then re-run the email regex.
7. Number-word expansion for RU/UA/EN ("нуль п'ять нуль…", "zero five zero…") before phone detection.

This is the single highest-leverage piece of work here — most bypass attempts in your spec (§9) are defeated by steps 3–6 alone, before any keyword list even runs.

## 4. Contact categories `[Phase 1]`

```ts
type ContactCategory =
  | "CONTACT_PHONE"
  | "CONTACT_EMAIL"
  | "CONTACT_SOCIAL"
  | "CONTACT_MESSENGER"
  | "CONTACT_WEBSITE"
  | "CONTACT_ADDRESS"
  | "EXTERNAL_PAYMENT"
  | "EXTERNAL_BOOKING"
  | "OFF_PLATFORM_COMMUNICATION"
  | "OFF_PLATFORM_TRANSACTION"
  | "OBFUSCATED_CONTACT"
  | "QR_CONTACT"     // Phase 2 only, needs image pipeline
  | "IMAGE_CONTACT";  // Phase 2 only, needs image pipeline
```

## 5. Risk scoring model `[Phase 1]`

Each detector contributes points; the sum is the message's risk score (0–100). Thresholds are a config object, not hard-coded, so they can be tuned without touching detector logic:

```ts
const RISK_THRESHOLDS = { allow: 30, review: 60, block: 80 }; // configurable
```

| Signal | Points |
|---|---|
| Explicit phone number match | 70 |
| Explicit email match (incl. obfuscated) | 70 |
| Social handle / messenger username shared | 65 |
| Platform name + imperative verb nearby ("напишіть у Telegram") | 60 |
| Platform name alone, no imperative ("соцмережі можуть посилювати тривогу") | 15 |
| Payment keyword + card/IBAN-shaped number | 75 |
| Known messenger/social domain URL | 80 |
| URL shortener (destination hidden) | 50 |
| Off-platform meeting/consultation phrasing ("поговорити поза платформою") | 55 |
| Personal address phrasing (heuristic) | 45 |

`0–29 → ALLOW`, `30–59 → REVIEW / soft warning`, `60–79 → BLOCK`, `80–100 → BLOCK + flag for moderation`. Same bands and weights apply symmetrically to author and participant messages — one detector, two callers.

## 6. Block / Warn / Review rules `[Phase 1 logic, Phase 2 for real REVIEW queue]`

- **ALLOW** — message sends normally.
- **WARN** — message sends, but shows a small inline note (e.g., ambiguous address mention) — no queue needed, just a client-side notice.
- **BLOCK** — message is not sent; user sees the calm copy in §7 and can edit.
- **REVIEW** — client-side, this can only be treated as BLOCK-with-softer-copy today, since there's no moderation queue or manager view to route it to. A true REVIEW state is **[Phase 2]**.

## 7. UX copy for blocked messages `[Phase 1]`

Matches your §13 exactly — calm, no keyword disclosure, an edit affordance:

> "Це повідомлення містить контактні дані або посилання для спілкування поза Sensoria. Щоб захистити вас і зберегти спілкування в межах платформи, ми не можемо його надіслати."

Action: keep the text in the input (don't clear it) so the user can edit and resend — this already happens today, since blocked replies aren't cleared from the draft state. No mention of which specific word or pattern triggered it.

## 8. OCR & QR strategy `[Phase 2]`

No image/attachment upload exists in messaging today — text only. If/when it ships, images can't be trusted to a client-side check (too heavy, and trivially bypassable). The target flow: upload → server-side OCR → same text detector pipeline on the extracted text → QR decode (e.g. via a server-side zxing-style library) → resolve the QR payload → same URL/contact detectors → decision, before the image is ever shown to the recipient. This is pure roadmap until there's a backend to run it on.

## 9. Sensoria allowlist strategy `[Phase 1 for the list, Phase 2 to manage it centrally]`

A short-circuit allowlist checked before any BLOCK decision: Sensoria's own domain(s), `support@sensoria.*`, internal course/program/profile links. If a URL or email matches the allowlist, it's ALLOW regardless of other signals. For now this is a small constant array in code; centrally managing it (admin-editable) is Phase 2.

## 10. Logging requirements `[Phase 2 — needs a database]`

No DB exists in this project today, so nothing is persisted — but the Phase 1 detector should return a fully-structured result object shaped exactly like the future log row, so wiring to a real backend later is a drop-in, not a rewrite:

```ts
type ModerationResult = {
  action: "ALLOW" | "WARN" | "BLOCK" | "REVIEW";
  riskScore: number;
  categories: ContactCategory[];
  detectorsTriggered: string[];
  ocrUsed: boolean;   // always false until Phase 2
  urlDetected: boolean;
  allowlisted: boolean;
};
```

Future table sketch: `message_moderation_log(id, sender_id, recipient_id, conversation_id, timestamp, risk_score, categories[], detectors_triggered[], action, ocr_used, url_detected, allowlisted)`. Per your minimization note, never store the raw contact payload itself — a redacted flag is enough.

## 11. Edge cases `[Phase 1 mitigations, some inherently Phase 2]`

- "Соціальні мережі можуть посилювати тривожність." → ALLOW (platform name, no imperative, no handle).
- "Напишіть мені в Instagram @username." → BLOCK (platform + imperative + handle).
- "Практика проходить у Києві." → ALLOW (public location, no direct-contact intent).
- "Приходьте до мене в студію, ось адреса…" → REVIEW/BLOCK (personal contact intent) — this pair is the clearest case where a keyword heuristic will sometimes get it wrong in either direction; true disambiguation needs contextual understanding beyond regex, which realistically means an LLM-assisted classification call server-side, not a browser-side heuristic. Flagging honestly rather than overselling the naive version.
- Spaced-out / homoglyph obfuscation ("t e l e g r a m", "insta gram") → caught by normalization in §3.
- Legitimate external reading-list link (non-contact, non-payment) → shouldn't hard-block; allowlist known-safe domains, REVIEW unknown shorteners rather than auto-block everything with `http`.
- `support@sensoria.*` and internal links → always ALLOW via allowlist in §9.

## 12. Testing strategy `[Phase 1]`

A `contactFilter.test.ts` table-driven test, roughly:

**Should BLOCK** (subset, UA/RU/EN mixed): "Напишіть мені в Instagram", "Давайте продовжимо в Telegram", "Скиньте свій номер", "Ось мій WhatsApp", "Мій email нижче", "Зв'яжіться зі мною напряму", "Можемо поговорити поза платформою", "tg: username", "instagram.com/username", "name [at] gmail.com", "t e l e g r a m", "+380 67 123 45 67", "067.123.45.67", "скину реквізити", "оплата на карту".

**Should ALLOW**: "Соціальні мережі можуть посилювати тривожність.", "Практика проходить у Києві.", "Дякую за курс, дуже допомогло!", "support@sensoria.app", a Sensoria internal course link.

No test runner is currently set up in this project (no `vitest`/`jest` in `package.json`) — adding one is a small prerequisite if you want this enforced by CI rather than only manually verified.

## 13. Implementation plan

**Phase 1 — this session, once you approve this doc:**

1. Rewrite `src/utils/contactFilter.ts` from a flat keyword array into the modular pipeline above (normalizer + detectors + scorer), keeping `containsContactInfo(text): boolean` as a thin wrapper around the new `moderateMessage(text): ModerationResult` so `AuthorMessages.tsx` doesn't need to change its call sites.
2. Wire the richer `ModerationResult` through `AuthorMessages.tsx` so WARN-band messages can show the softer inline note from §6, not just hard ALLOW/BLOCK.
3. Add a lightweight, session-scoped repeated-violation counter as an approximation of §21's escalation (clearly commented as a prototype stand-in — real escalation needs account-linked persistence, which is Phase 2).
4. Keep the detector module generic enough to reuse for a future participant-side reply box, even though that UI doesn't exist yet — same function, both callers, symmetric enforcement as required.

**Phase 2 — roadmap, needs a backend:**

- Server-side authoritative re-check on every message (the client check becomes UX-only, not the security boundary).
- Persistent `message_moderation_log` + moderation queue for REVIEW-band messages.
- OCR/QR pipeline for image attachments once attachments exist.
- Cross-session, account-level escalation and enforcement per your §21 ladder.
- Admin-configurable risk thresholds and allowlist, instead of constants in code.
- LLM-assisted contextual classification for the address/intent edge cases regex can't reliably resolve.

---

Waiting on your go-ahead before touching `contactFilter.ts` / `AuthorMessages.tsx` — per your note, code changes only start after this is approved.
