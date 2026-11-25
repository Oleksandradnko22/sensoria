// Sensoria — legal-otp Edge Function: a 6-digit code by email to sign the author offer
// (one-time identifier, art. 12 of the Law «Про електронну комерцію»; docs/consent-legal-spec.md, 2.5).
// action "send":   new code to the account email; valid 10 minutes; at most once per 60 s.
// action "verify": checks the code (5 attempts); on success accept_legal('author', …) may run within 30 minutes.
// Only a hash of the code is stored.
import { createClient } from "npm:@supabase/supabase-js@2";
import { renderBrandEmail } from "../_shared/brandEmail.ts";
import { authorCommunityEmail } from "../_shared/authorCommunityEmail.ts";

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
      const { data: otpRow, error: insErr } = await admin.from("legal_otp").insert({
        user_id: user.id, purpose, code_hash: await sha256(`${user.id}:${code}`), sent_to: user.email,
        expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      }).select("id").single();
      if (insErr) throw insErr;
      const what = purpose === "author_paid_sales" ? "підтвердження умов платних продажів" : "підписання договору з автором";
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: Deno.env.get("RESEND_FROM") ?? "Sensoria <onboarding@resend.dev>",
          to: user.email,
          subject: `Код для ${what}: ${code}`,
          ...renderBrandEmail({
            preheader: `Код ${code} — дійсний 10 хвилин.`,
            heading: purpose === "author_paid_sales" ? "Підтвердження умов платних продажів" : "Підписання договору з автором",
            blocks: [
              { type: "text", text: `Введіть цей код на сторінці Sensoria, щоб завершити ${what}.` },
              { type: "code", code, note: "Код дійсний 10 хвилин" },
              { type: "text", text: "Введення коду є підписанням договору одноразовим ідентифікатором (стаття 12 Закону України «Про електронну комерцію»)." },
              { type: "note", text: "Якщо ви не запитували код, просто проігноруйте цей лист — без коду нічого не зміниться. Нікому не повідомляйте цей код." },
            ],
            reason: "Ви отримали цей лист, бо на Sensoria запросили код для вашого облікового запису автора.",
          }),
        }),
      });
      if (!res.ok) {
        // a failed send must not start the 60-second wait
        await admin.from("legal_otp").delete().eq("id", otpRow.id);
        const detail = await res.text().catch(() => "");
        console.error("legal-otp: Resend failed", res.status, detail);
        return json({ error: "mail_failed", message: "Не вдалося надіслати лист. Спробуйте ще раз.", detail: `${res.status} ${detail.slice(0, 300)}` }, 502);
      }
      return json({ sent: true, to: user.email });
    }

    if (payload?.action === "verify") {
      const code = String(payload?.code ?? "").replace(/\D/g, "");
      if (code.length !== 6) return json({ error: "bad_code", message: "Введіть 6 цифр." }, 400);
      // any still-valid code of the last 10 minutes counts, not only the newest: with «Надіслати ще раз» or a slow
      // letter people type the code from the email they opened first (20.11.2026, a new author got «Невірний код»)
      const { data: rows } = await admin.from("legal_otp").select("id, code_hash, expires_at, attempts, verified_at")
        .eq("user_id", user.id).eq("purpose", purpose).is("consumed_at", null)
        .order("sent_at", { ascending: false }).limit(5);
      const list = rows ?? [];
      if (!list.length) return json({ error: "no_code", message: "Спершу надішліть код." }, 400);
      // already confirmed and still usable by accept_legal (it takes a confirmation of the last 30 minutes)
      if (list.some((r) => r.verified_at && Date.now() - Date.parse(r.verified_at) < 25 * 60_000)) return json({ verified: true });
      const live = list.filter((r) => Date.parse(r.expires_at) >= Date.now() && r.attempts < 5);
      if (!live.length) {
        const expired = list.every((r) => Date.parse(r.expires_at) < Date.now());
        return json(expired ? { error: "expired", message: "Строк дії коду минув. Надішліть новий." } : { error: "too_many", message: "Забагато спроб. Надішліть новий код." }, 400);
      }
      const hash = await sha256(`${user.id}:${code}`);
      const match = live.find((r) => r.code_hash === hash);
      if (!match) {
        const latest = live[0];
        await admin.from("legal_otp").update({ attempts: latest.attempts + 1 }).eq("id", latest.id);
        return json({ error: "wrong_code", message: `Невірний код. Введіть код з найновішого листа. Залишилось спроб: ${4 - latest.attempts}.` }, 400);
      }
      // the first signed author agreement of a not-yet-approved author: invite to the authors' Telegram community
      const { count: signedBefore } = await admin.from("legal_otp").select("id", { count: "exact", head: true })
        .eq("user_id", user.id).eq("purpose", "author_agreement").not("verified_at", "is", null);
      await admin.from("legal_otp").update({ verified_at: new Date().toISOString() }).eq("id", match.id);
      if (purpose === "author_agreement" && !signedBefore && user.email) {
        const { data: prof } = await admin.from("profiles").select("name, role, author_approved_at").eq("id", user.id).maybeSingle();
        const key = Deno.env.get("RESEND_API_KEY");
        if (key && prof?.role === "author" && !prof.author_approved_at) {
          const mail = authorCommunityEmail(prof.name);
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify({ from: Deno.env.get("RESEND_FROM") ?? "Sensoria <onboarding@resend.dev>", to: user.email, ...mail }),
          }).catch((e) => console.error("legal-otp: community letter failed", e));
        }
      }
      return json({ verified: true });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    return json({ error: "server_error", message: e instanceof Error ? e.message : "Помилка сервера." }, 500);
  }
});
