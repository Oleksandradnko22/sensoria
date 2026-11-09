// Asks the server for this download's (or this screen session's) mark
// (2026-10-06; see protected-pdf-exports-migration.sql). The server picks
// the random `token`, derives the secret-keyed `seed` the invisible pattern
// is built from, and records who it was issued to — so a mark found later
// maps back to a person, and nobody can invent a mark for someone else
// because the key that derives seeds never leaves the database.
//
// Any failure OTHER than "the journal is not set up yet" is "no file": a copy
// must not be handed out when the server could not record it.

import { supabase } from "./supabaseClient.ts";

export type PdfMarkKind = "guide_pdf" | "uploaded_pdf" | "program_material";

export type IssuedMark = {
  token: number;
  seed: number;
  // false when the server journal does not exist yet (migration not run): the
  // file still gets a full set of marks, but nobody can look the owner up.
  recorded: boolean;
};

export const JOURNAL_MISSING_NOTICE =
  "Файл завантажено, але журнал видач ще не створено — виконайте protected-pdf-exports-migration.sql у Supabase, щоб мітку можна було зв'язати з читачем.";

function randomU32(): number {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0] || 1;
}

export async function issuePdfMark(kind: PdfMarkKind, contentId: string): Promise<IssuedMark> {
  if (!supabase) throw new Error("Supabase не налаштований — захищений PDF не можна створити без журналу видач.");
  const { data, error } = await supabase.rpc("issue_pdf_mark", { p_kind: kind, p_content_id: contentId });
  if (error) {
    // 42883 / PGRST202 = the function is not there yet (migration not run).
    const missing = error.code === "42883" || error.code === "PGRST202" || error.code === "42P01";
    if (missing) {
      // The journal is not set up yet. Don't strand the reader: the file
      // still carries every mark, with a locally random token/seed. It just
      // cannot be traced back to a person until the migration is run.
      // eslint-disable-next-line no-console
      console.warn("issue_pdf_mark недоступна — завантаження без запису в журнал видач.");
      return { token: randomU32(), seed: randomU32(), recorded: false };
    }
    throw new Error(`Не вдалося зареєструвати видачу: ${error.message}`);
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || row.token == null || row.seed == null) throw new Error("Сервер не повернув мітку видачі.");
  return { token: Number(row.token), seed: Number(row.seed), recorded: true };
}
