// One rule for an e-mail address across sign-up and sign-in: Latin letters, any domain (.com, .ua, .net, …).
// Earlier the forms accepted only «.com», which turned away @ukr.net, @i.ua, @meta.ua and every .ua address.
export const EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,}$/;
export const isValidEmail = (email: string): boolean => EMAIL_PATTERN.test(email.trim());
export const EMAIL_HINT = "Перевірте email: латиницею, наприклад name@example.com";
