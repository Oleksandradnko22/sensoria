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
import { renderBrandEmail } from "../_shared/brandEmail.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

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
    // the same branded layout as every Sensoria letter
    const kyiv = (iso: string) => new Date(iso).toLocaleString("uk-UA", { timeZone: "Europe/Kyiv" });
    const mail = renderBrandEmail({
      preheader: alerts.map((a) => a.title).join(" · ").slice(0, 140),
      heading: alerts.length === 1 ? alerts[0].title : `${alerts.length} нових подій для адміністратора`,
      blocks: [
        ...(urgent ? [{ type: "badge" as const, text: "Є термінова подія" }, { type: "text" as const, text: "Людині, можливо, зараз дуже важко. Перевірте розділ «Спільнота → На перевірці»." }] : []),
        { type: "details" as const, rows: alerts.map((a) => ({ label: kyiv(a.created_at), value: `${a.urgent ? "ТЕРМІНОВО · " : ""}${a.title}${a.details ? `\n${a.details}` : ""}` })) },
        { type: "button" as const, label: "Відкрити адмін-панель", url: site },
        { type: "note" as const, text: "Увійдіть і натисніть «Адмін-панель». Деталі — у вкладках «Черга», «Модерація», «Спільнота», «Фінанси»." },
      ],
      reason: "Ви отримали цей лист як адміністратор Sensoria.",
    });

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: Deno.env.get("RESEND_FROM") ?? "Sensoria <onboarding@resend.dev>", to: [...to], subject, ...mail }),
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
