// Sensoria — admin-alerts Edge Function: e-mails the admin about everything waiting in admin_alert_outbox
// (support tickets, verification requests, refunds, reports, materials on moderation, hidden «Спільнота» posts, new
// authors — see supabase/admin-alerts.sql). Woken by the database (pg_net) after each event.
//
// Safe to be called by anyone: the call carries no data. It only delivers lines already waiting in the outbox, to the
// admins' own addresses from the database, and each line once.
//
// Deploy: npx --yes supabase functions deploy admin-alerts --no-verify-jwt
// Secrets (already used by the other functions): RESEND_API_KEY, RESEND_FROM, SITE_URL. Optional: ADMIN_ALERT_EMAIL —
// an extra address to send to.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

type Alert = { id: number; kind: string; title: string; details: string | null; urgent: boolean; created_at: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) return json({ sent: 0, reason: "RESEND_API_KEY is not set" });

    // who receives: every admin with the owner role (support helpers get no mail), plus an optional extra address
    const { data: admins } = await admin.from("profiles").select("id, admin_role").eq("is_admin", true);
    const ids = (admins ?? []).filter((a) => (a as { admin_role?: string | null }).admin_role !== "support").map((a) => a.id as string);
    const to = new Set<string>();
    for (const id of ids) {
      const { data } = await admin.auth.admin.getUserById(id);
      if (data?.user?.email) to.add(data.user.email);
    }
    const extra = Deno.env.get("ADMIN_ALERT_EMAIL");
    if (extra) to.add(extra);
    if (to.size === 0) return json({ sent: 0, reason: "no admin e-mail" });

    // take the waiting lines (marks them sent, so two calls never send the same line twice)
    const { data: claimed, error } = await admin.rpc("admin_alerts_claim");
    if (error) return json({ error: error.message }, 500);
    const alerts = (claimed ?? []) as Alert[];
    if (alerts.length === 0) return json({ sent: 0 });

    const site = Deno.env.get("SITE_URL") ?? "https://sensoria.courses";
    const urgent = alerts.some((a) => a.urgent);
    const subject = alerts.length === 1
      ? `Sensoria: ${alerts[0].title}`
      : `${urgent ? "ТЕРМІНОВО · " : ""}Sensoria: ${alerts.length} нових подій для адміністратора`;
    const rows = alerts.map((a) => `
      <tr><td style="padding:14px 16px;border-bottom:1px solid #ece8fb">
        <div style="font-size:15px;font-weight:700;color:${a.urgent ? "#b91c1c" : "#12172b"}">${esc(a.title)}</div>
        ${a.details ? `<div style="margin-top:4px;font-size:14px;color:#4b4a66">${esc(a.details)}</div>` : ""}
        <div style="margin-top:4px;font-size:12px;color:#8a88a6">${new Date(a.created_at).toLocaleString("uk-UA", { timeZone: "Europe/Kyiv" })}</div>
      </td></tr>`).join("");
    const html = `
      <div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;background:#f6f4ff;padding:24px">
        <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:20px;overflow:hidden;border:1px solid #e4def9">
          <div style="background:linear-gradient(90deg,#3b6df0,#7c5cf0);color:#fff;padding:18px 20px;font-size:17px;font-weight:700">Sensoria · Адмін-панель</div>
          ${urgent ? `<div style="background:#fef2f2;color:#991b1b;padding:12px 20px;font-size:14px;font-weight:600">Є термінова подія: людині, можливо, зараз дуже важко. Перевірте розділ «Спільнота → На перевірці».</div>` : ""}
          <table style="width:100%;border-collapse:collapse">${rows}</table>
          <div style="padding:18px 20px"><a href="${site}" style="display:inline-block;background:#4338ca;color:#fff;text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:600">Відкрити Sensoria</a>
          <div style="margin-top:10px;font-size:12px;color:#8a88a6">Увійдіть і натисніть «Адмін-панель». Деталі — у вкладках «Черга», «Модерація», «Спільнота».</div></div>
        </div>
      </div>`;
    const text = alerts.map((a) => `• ${a.title}${a.details ? ` — ${a.details}` : ""}`).join("\n") + `\n\n${site}`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: Deno.env.get("RESEND_FROM") ?? "Sensoria <onboarding@resend.dev>", to: [...to], subject, html, text }),
    });
    if (!res.ok) {
      // put them back so the next ping tries again
      await admin.from("admin_alert_outbox").update({ sent_at: null }).in("id", alerts.map((a) => a.id));
      return json({ error: `resend ${res.status}` }, 502);
    }
    return json({ sent: alerts.length, to: to.size });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "error" }, 500);
  }
});
