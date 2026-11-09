// The one password rule for creating a password (signup, dashboard signup,
// setting a first password, changing it): 8+ characters, Latin letters /
// digits / allowed symbols only, and at least one special character.
const SPECIAL_CHAR = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~`]/;
const LATIN_ONLY = /^[A-Za-z0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~`]+$/;

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_HINT = "Мінімум 8 символів, латиницею, і спецсимвол (наприклад ./!)";

export function isPasswordValid(password: string): boolean {
  return password.length >= PASSWORD_MIN_LENGTH && SPECIAL_CHAR.test(password) && LATIN_ONLY.test(password);
}
