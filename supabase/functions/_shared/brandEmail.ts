// Sensoria's branded email: one layout for every letter the platform sends (order confirmations, sign-in and signing
// codes, notifications, digests). Table-based with inline styles — the only markup Gmail, Apple Mail and Outlook all
// render the same; no external CSS, no web fonts, no images except the logo (a letter still reads with images off).
// Every letter also gets a plain-text twin for clients that do not show HTML.

export type EmailDetail = { label: string; value: string };
export type EmailBlock =
  | { type: "text"; text: string }
  | { type: "details"; rows: EmailDetail[]; title?: string }
  | { type: "quote"; label?: string; text: string }
  | { type: "code"; code: string; note?: string }
  | { type: "button"; label: string; url: string }
  | { type: "note"; text: string }
  | { type: "badge"; text: string };

export type BrandEmail = {
  /** the grey line next to the subject in the inbox */
  preheader: string;
  heading: string;
  blocks: EmailBlock[];
  /** why this person gets the letter, at the very bottom */
  reason?: string;
};

const SITE = "https://sensoria.courses";
const C = {
  page: "#eef0fb",
  ink: "#12172b",
  text: "#3b3f5c",
  muted: "#6b6f86",
  faint: "#8a8ea3",
  line: "#ebe8ff",
  panel: "#f6f5ff",
  brandA: "#3b6df0",
  brandB: "#7c5cf0",
  brand: "#4338ca",
};
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";

export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Plain text → HTML: escaped, links clickable, line breaks kept. */
function rich(text: string): string {
  return escapeHtml(text)
    .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)»])/g, `<a href="$1" style="color:${C.brand};text-decoration:underline;">$1</a>`)
    .replace(/\n/g, "<br>");
}

function blockHtml(b: EmailBlock): string {
  switch (b.type) {
    case "text":
      return `<p style="margin:0 0 16px;font:400 15px/1.65 ${FONT};color:${C.text};">${rich(b.text)}</p>`;
    case "note":
      return `<p style="margin:0 0 14px;font:400 13px/1.6 ${FONT};color:${C.muted};">${rich(b.text)}</p>`;
    case "badge":
      return `<p style="margin:0 0 18px;"><span style="display:inline-block;padding:6px 12px;border-radius:999px;background:#fff4e5;color:#92400e;font:600 12px/1.4 ${FONT};">${escapeHtml(b.text)}</span></p>`;
    case "details": {
      const rows = b.rows.map((r, i) =>
        `<tr><td style="padding:${i ? "10px" : "0"} 0 0;font:400 13px/1.5 ${FONT};color:${C.muted};vertical-align:top;width:38%;">${escapeHtml(r.label)}</td>` +
        `<td style="padding:${i ? "10px" : "0"} 0 0 12px;font:600 14px/1.5 ${FONT};color:${C.ink};vertical-align:top;">${rich(r.value)}</td></tr>`).join("");
      const title = b.title ? `<p style="margin:0 0 12px;font:700 13px/1.4 ${FONT};letter-spacing:.06em;text-transform:uppercase;color:${C.brand};">${escapeHtml(b.title)}</p>` : "";
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;border-collapse:separate;background:${C.panel};border:1px solid ${C.line};border-radius:16px;"><tr><td style="padding:18px 20px;">${title}<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr></table>`;
    }
    case "quote":
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;"><tr><td style="padding:14px 18px;background:#f8f7ff;border-left:4px solid ${C.brandB};border-radius:4px 14px 14px 4px;">` +
        (b.label ? `<p style="margin:0 0 6px;font:600 12px/1.4 ${FONT};color:${C.muted};">${escapeHtml(b.label)}</p>` : "") +
        `<p style="margin:0;font:400 14px/1.6 ${FONT};color:${C.text};">${rich(b.text)}</p></td></tr></table>`;
    case "code":
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;"><tr><td align="center" style="padding:22px 16px;background:${C.panel};border:1px solid ${C.line};border-radius:18px;">` +
        `<p style="margin:0;font:700 34px/1.2 ${FONT};letter-spacing:10px;color:${C.ink};">${escapeHtml(b.code)}</p>` +
        (b.note ? `<p style="margin:10px 0 0;font:400 13px/1.5 ${FONT};color:${C.muted};">${escapeHtml(b.note)}</p>` : "") + `</td></tr></table>`;
    case "button":
      return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 22px;"><tr><td bgcolor="#5b5ef0" style="border-radius:14px;background:${C.brandA};background-image:linear-gradient(90deg,${C.brandA},${C.brandB});">` +
        `<a href="${escapeHtml(b.url)}" style="display:inline-block;padding:14px 26px;font:700 15px/1.2 ${FONT};color:#ffffff;text-decoration:none;border-radius:14px;">${escapeHtml(b.label)}&nbsp;&rarr;</a></td></tr></table>`;
  }
}

function blockText(b: EmailBlock): string {
  switch (b.type) {
    case "text": case "note": case "badge": return b.text;
    case "details": return [b.title ? b.title.toUpperCase() : null, ...b.rows.map((r) => `${r.label}: ${r.value}`)].filter(Boolean).join("\n");
    case "quote": return `${b.label ? `${b.label}\n` : ""}«${b.text}»`;
    case "code": return `${b.code}${b.note ? `\n${b.note}` : ""}`;
    case "button": return `${b.label}: ${b.url}`;
  }
}

export function renderBrandEmail(e: BrandEmail): { html: string; text: string } {
  const body = e.blocks.map(blockHtml).join("");
  const footer =
    `<p style="margin:0 0 8px;font:400 12px/1.6 ${FONT};color:${C.faint};">Sensoria — простір для розвитку, підтримки та глибоких змін.</p>` +
    `<p style="margin:0 0 8px;font:400 12px/1.6 ${FONT};color:${C.faint};">` +
    `<a href="${SITE}/contacts" style="color:${C.faint};text-decoration:underline;">Контакти</a> &nbsp;·&nbsp; ` +
    `<a href="${SITE}/privacy" style="color:${C.faint};text-decoration:underline;">Політика конфіденційності</a> &nbsp;·&nbsp; ` +
    `<a href="${SITE}/crisis-help" style="color:${C.faint};text-decoration:underline;">Допомога в кризі</a></p>` +
    (e.reason ? `<p style="margin:0;font:400 12px/1.6 ${FONT};color:${C.faint};">${escapeHtml(e.reason)}</p>` : "");
  const html = `<!doctype html><html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${escapeHtml(e.heading)}</title></head>` +
    `<body style="margin:0;padding:0;background:${C.page};">` +
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(e.preheader)}</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page};"><tr><td align="center" style="padding:28px 12px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">` +
    // header: the brand gradient with the wordmark
    `<tr><td bgcolor="#4f63ef" style="border-radius:22px 22px 0 0;background:${C.brandA};background-image:linear-gradient(120deg,${C.brandA},${C.brandB});padding:22px 28px;">` +
    `<a href="${SITE}" style="text-decoration:none;"><table role="presentation" cellpadding="0" cellspacing="0"><tr>` +
    `<td style="padding-right:10px;"><img src="${SITE}/apple-touch-icon.png" width="32" height="32" alt="" style="display:block;border-radius:9px;border:0;"></td>` +
    `<td style="font:800 15px/1 ${FONT};letter-spacing:4px;color:#ffffff;">SENSORIA</td></tr></table></a></td></tr>` +
    // the card
    `<tr><td style="background:#ffffff;border-radius:0 0 22px 22px;padding:30px 28px 26px;">` +
    `<h1 style="margin:0 0 16px;font:800 24px/1.3 ${FONT};color:${C.ink};">${escapeHtml(e.heading)}</h1>${body}</td></tr>` +
    `<tr><td style="padding:20px 28px 0;">${footer}</td></tr>` +
    `</table></td></tr></table></body></html>`;
  const text = [e.heading, "", ...e.blocks.map(blockText).flatMap((t) => [t, ""]),
    "—", "Sensoria — простір для розвитку, підтримки та глибоких змін.", `Контакти: ${SITE}/contacts`, e.reason ?? ""].join("\n").trim();
  return { html, text };
}

/** For letters composed as plain text elsewhere (notifications): the same layout, paragraphs and links kept. */
export function brandFromText(subject: string, text: string, reason?: string): { html: string; text: string } {
  const paras = text.split(/\n{2,}/).map((t) => t.trim()).filter(Boolean);
  // a short «Відкрити розмову: https://…» paragraph becomes the brand button
  const blocks: EmailBlock[] = paras.map((t) => {
    const m = /^([^:\n]{2,40}):\s*(https?:\/\/\S+)$/.exec(t);
    return m ? { type: "button" as const, label: m[1].trim(), url: m[2] } : { type: "text" as const, text: t };
  });
  return renderBrandEmail({ preheader: paras[0]?.slice(0, 120) ?? subject, heading: subject, blocks, reason });
}
