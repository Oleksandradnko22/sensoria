// Sensoria — legal-otp Edge Function: a 6-digit code by email to sign the author offer
// (one-time identifier, art. 12 of the Law «Про електронну комерцію»; docs/consent-legal-spec.md, 2.5).
// action "send":   new code to the account email; valid 10 minutes; at most once per 60 s.
// action "verify": checks the code (5 attempts); on success accept_legal('author', …) may run within 30 minutes.
// Only a hash of the code is stored.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function newCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return String(n).padStart(6, "0");
}

const PURPOSES = ["author_agreement", "author_paid_sales"] as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "not_authenticated" }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const authClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: u, error: ue } = await authClient.auth.getUser();
    if (ue || !u.user) return json({ error: "not_authenticated" }, 401);
    const user = u.user;
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const payload = await req.json().catch(() => ({}));
    const purpose = PURPOSES.includes(payload?.purpose) ? payload.purpose : "author_agreement";

    if (payload?.action === "send") {
      if (!user.email) return json({ error: "no_email", message: "В акаунті немає електронної пошти." }, 400);
      const { data: last } = await admin.from("legal_otp").select("sent_at").eq("user_id", user.id).eq("purpose", purpose)
        .order("sent_at", { ascending: false }).limit(1).maybeSingle();
      if (last && Date.now() - Date.parse(last.sent_at) < 60_000) {
        return json({ error: "too_soon", message: "Новий код можна надіслати через хвилину." }, 429);
      }
      const resendKey = Deno.env.get("RESEND_API_KEY");
      if (!resendKey) return json({ error: "mail_not_configured", message: "Пошта не налаштована." }, 500);
      const code = newCode();
      const { error: insErr } = await admin.from("legal_otp").insert({
        user_id: user.id, purpose, code_hash: await sha256(`${user.id}:${code}`), sent_to: user.email,
        expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      });
      if (insErr) throw insErr;
      const what = purpose === "author_paid_sales" ? "підтвердження умов платних продажів" : "підписання договору з автором";
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: Deno.env.get("RESEND_FROM") ?? "Sensoria <onboarding@resend.dev>",
          to: user.email,
          subject: `Код для ${what}: ${code}`,
          text: `Ваш код для ${what} на Sensoria: ${code}\n\nКод дійсний 10 хвилин. Введення коду є підписанням договору одноразовим ідентифікатором.\nЯкщо ви не запитували код, просто проігноруйте цей лист.`,
        }),
      });
      if (!res.ok) return json({ error: "mail_failed", message: "Не вдалося надіслати лист. Спробуйте ще раз." }, 502);
      return json({ sent: true, to: user.email });
    }

    if (payload?.action === "verify") {
      const code = String(payload?.code ?? "").replace(/\D/g, "");
      if (code.length !== 6) return json({ error: "bad_code", message: "Введіть 6 цифр." }, 400);
      const { data: row } = await admin.from("legal_otp").select("id, code_hash, expires_at, attempts, verified_at")
        .eq("user_id", user.id).eq("purpose", purpose).is("consumed_at", null)
        .order("sent_at", { ascending: false }).limit(1).maybeSingle();
      if (!row) return json({ error: "no_code", message: "Спершу надішліть код." }, 400);
      if (row.verified_at) return json({ verified: true });
      if (Date.parse(row.expires_at) < Date.now()) return json({ error: "expired", message: "Строк дії коду минув. Надішліть новий." }, 400);
      if (row.attempts >= 5) return json({ error: "too_many", message: "Забагато спроб. Надішліть новий код." }, 400);
      const ok = (await sha256(`${user.id}:${code}`)) === row.code_hash;
      await admin.from("legal_otp").update(ok ? { verified_at: new Date().toISOString() } : { attempts: row.attempts + 1 }).eq("id", row.id);
      if (!ok) return json({ error: "wrong_code", message: `Невірний код. Залишилось спроб: ${4 - row.attempts}.` }, 400);
      return json({ verified: true });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    return json({ error: "server_error", message: e instanceof Error ? e.message : "Помилка сервера." }, 500);
  }
});
