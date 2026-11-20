import assert from "node:assert/strict";
import test from "node:test";
import { brandFromText, escapeHtml, renderBrandEmail } from "../../supabase/functions/_shared/brandEmail.ts";

test("branded letter: escaped text, the brand header, a plain-text twin", () => {
  const { html, text } = renderBrandEmail({
    preheader: "p", heading: "Оплату <отримано>",
    blocks: [{ type: "details", rows: [{ label: "Сплачено", value: "1 800,00 грн" }] }, { type: "code", code: "137362" }],
  });
  assert.ok(html.includes("Оплату &lt;отримано&gt;"));
  assert.ok(!html.includes("<отримано>"));
  assert.ok(html.includes("SENSORIA") && html.includes("linear-gradient"));
  assert.ok(text.includes("Сплачено: 1 800,00 грн") && text.includes("137362"));
});

test("plain-text notifications: a short «label: link» paragraph becomes a button, links stay clickable", () => {
  const { html } = brandFromText("Нове повідомлення", "Автор відповів.\n\nВідкрити розмову: https://sensoria.courses/account");
  assert.ok(html.includes('href="https://sensoria.courses/account"'));
  assert.ok(html.includes("Відкрити розмову&nbsp;&rarr;"));
});

test("Supabase template placeholders survive escaping", () => {
  assert.equal(escapeHtml("{{ .ConfirmationURL }}"), "{{ .ConfirmationURL }}");
});

test("the operator's details in letters match the site's legal pages", async () => {
  const { OPERATOR } = await import("../../supabase/functions/_shared/operator.ts");
  const { LEGAL } = await import("../data/legalOperator.ts");
  for (const k of ["operatorName", "registration", "address", "mailingAddress", "email", "edition", "effectiveDate"] as const) {
    assert.equal(OPERATOR[k], LEGAL[k], k);
  }
});
