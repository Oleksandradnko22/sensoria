// Supabase Auth returns English messages; the profile page shows people
// Ukrainian ones. Unknown errors fall back to the caller's own text instead
// of leaking raw server wording.
const RULES: [RegExp, string][] = [
  [/same_password|should be different from the old password/i, "Новий пароль має відрізнятися від поточного."],
  [/weak_password|password should be at least|password is too weak/i, "Пароль занадто слабкий. Використайте щонайменше 8 символів зі спецсимволом."],
  [/email_exists|already been registered|already registered|already in use/i, "Ця адреса вже використовується іншим акаунтом."],
  [/rate limit|over_email_send_rate_limit|too many requests|after \d+ seconds/i, "Забагато спроб. Спробуйте трохи пізніше."],
  [/aal2|reauthentication|session.*(expired|not found)|jwt expired/i, "Для цієї дії потрібен повторний вхід. Вийдіть і увійдіть знову, потім повторіть."],
  [/invalid totp|invalid.*code|code.*invalid|mfa.*verif/i, "Невірний код. Перевірте код у застосунку й спробуйте ще раз."],
  [/invalid.*email|email.*invalid|unable to validate email/i, "Перевірте адресу електронної пошти."],
  [/missing sub claim|bad_jwt|auth session missing|invalid jwt/i, "Сеанс завершився. Увійдіть в акаунт знову й повторіть."],
  [/mfa.*(disabled|not enabled)|enroll.*disabled|mfa_(totp_)?enroll_not_enabled/i, "Двофакторна автентифікація вимкнена в налаштуваннях проєкту. Зверніться до підтримки."],
  [/friendly name.*already exists|already exists/i, "Попереднє налаштування не завершено. Спробуйте ще раз."],
  [/network|failed to fetch|load failed/i, "Немає з'єднання. Перевірте інтернет і спробуйте ще раз."],
];

export function friendlyAuthError(err: unknown, fallback: string): string {
  const msg =
    err instanceof Error
      ? err.message
      : err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string"
      ? (err as { message: string }).message
      : typeof err === "string"
      ? err
      : "";
  if (!msg) return fallback;
  for (const [re, text] of RULES) if (re.test(msg)) return text;
  // Our own Ukrainian messages pass through untouched.
  if (/[А-Яа-яІіЇїЄєҐґ]/.test(msg)) return msg;
  return fallback;
}
