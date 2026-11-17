// sha256 of each published legal text (the SECTIONS array of its page), for public.legal_documents.text_hash.
// Usage: node scripts/legal-hash.mjs  → prints one line per document: <document> <sha256>
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export const LEGAL_PAGES = {
  participant_agreement: "src/pages/ParticipantAgreementPage.tsx",
  author_agreement: "src/pages/AuthorAgreementPage.tsx",
  terms: "src/pages/TermsPage.tsx",
  privacy: "src/pages/PrivacyPage.tsx",
  refunds: "src/pages/RefundsPage.tsx",
};

export function sectionsHash(file) {
  const src = readFileSync(file, "utf8");
  const start = src.indexOf("const SECTIONS");
  const end = src.indexOf("\n];", start);
  if (start < 0 || end < 0) throw new Error(`SECTIONS not found in ${file}`);
  return createHash("sha256").update(src.slice(start, end + 3)).digest("hex");
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  for (const [doc, file] of Object.entries(LEGAL_PAGES)) console.log(doc, sectionsHash(file));
}
