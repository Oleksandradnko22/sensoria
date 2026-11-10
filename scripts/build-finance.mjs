// Builds supabase/functions/finance/index.ts from the tested engine + the handler.
// Usage: node scripts/build-finance.mjs   (add --check to only verify it is up to date)
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export function buildFinance() {
  const engine = readFileSync(join(root, "src/utils/financeEngine.ts"), "utf8");
  const mono = readFileSync(join(root, "src/utils/monoAcquiring.ts"), "utf8");
  const handler = readFileSync(join(root, "scripts/finance-handler.ts"), "utf8");
  if (!handler.includes("// @@ENGINE@@") || !handler.includes("// @@MONO@@")) throw new Error("marker missing in finance-handler.ts");
  return handler
    .replace("// @@ENGINE@@", `// ── engine (src/utils/financeEngine.ts) ───────────────────────────────────\n${engine}\n// ── /engine ───────────────────────────────────────────────────────────────`)
    .replace("// @@MONO@@", `// ── monobank core (src/utils/monoAcquiring.ts) ────────────────────────────\n${mono}\n// ── /monobank core ────────────────────────────────────────────────────────`);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = join(root, "supabase/functions/finance/index.ts");
  const built = buildFinance();
  if (process.argv.includes("--check")) {
    const cur = (() => { try { return readFileSync(out, "utf8"); } catch { return ""; } })();
    if (cur !== built) { console.error("finance/index.ts is out of date: run `npm run build:finance`"); process.exit(1); }
  } else {
    writeFileSync(out, built);
    console.log("written", out);
  }
}
