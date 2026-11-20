// Supabase Auth letters (Dashboard → Authentication → Email Templates) in the same branded layout as every Sensoria
// letter. Usage: node --experimental-strip-types scripts/build-email-templates.mjs → supabase/email-templates/*.html
// Paste each file into the matching template; {{ .ConfirmationURL }} / {{ .Token }} are filled in by Supabase.
import { writeFileSync } from "node:fs";
import { renderBrandEmail } from "../supabase/functions/_shared/brandEmail.ts";

const out = new URL("../supabase/email-templates/", import.meta.url);
const T = {
  "confirm-signup": {
    subject: "Підтвердіть пошту для Sensoria",
    heading: "Вітаємо на Sensoria!",
    blocks: [
      { type: "text", text: "Залишився один крок: підтвердіть, що це ваша електронна пошта." },
      { type: "button", label: "Підтвердити пошту", url: "{{ .ConfirmationURL }}" },
      { type: "note", text: "Якщо ви не реєструвалися на Sensoria, просто проігноруйте цей лист." },
    ],
    reason: "Ви отримали цей лист, бо на Sensoria створили обліковий запис з цією адресою.",
  },
  "magic-link": {
    subject: "Вхід у Sensoria",
    heading: "Вхід у ваш кабінет",
    blocks: [
      { type: "text", text: "Натисніть кнопку, щоб увійти в Sensoria. Посилання одноразове." },
      { type: "button", label: "Увійти", url: "{{ .ConfirmationURL }}" },
      { type: "note", text: "Якщо ви не намагалися увійти, проігноруйте цей лист — ваш обліковий запис у безпеці." },
    ],
    reason: "Ви отримали цей лист, бо на Sensoria запросили вхід для цієї адреси.",
  },
  "change-email": {
    subject: "Підтвердіть нову пошту для Sensoria",
    heading: "Зміна електронної пошти",
    blocks: [
      { type: "text", text: "Ви змінюєте пошту облікового запису Sensoria на цю адресу. Підтвердіть зміну:" },
      { type: "button", label: "Підтвердити нову пошту", url: "{{ .ConfirmationURL }}" },
      { type: "note", text: "Якщо ви цього не робили, не натискайте кнопку й напишіть нам: https://sensoria.courses/contacts" },
    ],
    reason: "Ви отримали цей лист, бо цю адресу вказали як нову пошту облікового запису Sensoria.",
  },
  "reset-password": {
    subject: "Новий пароль для Sensoria",
    heading: "Відновлення пароля",
    blocks: [
      { type: "text", text: "Ми отримали запит на зміну пароля до вашого облікового запису Sensoria." },
      { type: "button", label: "Задати новий пароль", url: "{{ .ConfirmationURL }}" },
      { type: "note", text: "Якщо ви не просили змінити пароль, проігноруйте цей лист — пароль лишиться тим самим." },
    ],
    reason: "Ви отримали цей лист, бо для облікового запису Sensoria з цією адресою запросили новий пароль.",
  },
  "reauthentication": {
    subject: "Код підтвердження Sensoria",
    heading: "Підтвердіть дію",
    blocks: [
      { type: "text", text: "Введіть цей код на сторінці Sensoria, щоб підтвердити дію:" },
      { type: "code", code: "{{ .Token }}" },
      { type: "note", text: "Якщо ви нічого не підтверджували, проігноруйте цей лист і нікому не повідомляйте код." },
    ],
    reason: "Ви отримали цей лист, бо на Sensoria запросили код підтвердження для вашого облікового запису.",
  },
};
for (const [name, t] of Object.entries(T)) {
  const { html } = renderBrandEmail({ preheader: t.subject, heading: t.heading, blocks: t.blocks, reason: t.reason });
  // the placeholders must stay as Supabase writes them (the layout escapes only &<>"')
  writeFileSync(new URL(`${name}.html`, out), html);
  console.log(name, "—", t.subject);
}
