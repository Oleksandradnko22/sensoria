// «Просування» in the author's cabinet: the author's referral link (a purchase through it keeps 85% instead of 70% for
// the author — decided on the server, see utils/referral.ts and the finance function), sharing to Facebook, Telegram,
// Instagram and TikTok, links to each published material, and how many people came through the link.
import { useEffect, useRef, useState } from "react";
import { useSession } from "../../context/SessionContext";
import { Icon } from "../ui/Icon";
import { buildReferralLink } from "../../utils/referral";
import { fetchAuthorContent } from "../../lib/authorPublic";
import { supabase } from "../../lib/supabaseClient";
import type { AuthorContentItem } from "../../utils/authorProfileView";

const KIND: Record<string, string> = { program: "Програма", guide: "Гайд", meditation: "Медитація" };

type Net = "facebook" | "telegram" | "instagram" | "tiktok";
const NETS: { id: Net; label: string; bg: string; glyph: React.ReactNode }[] = [
  { id: "facebook", label: "Facebook", bg: "#1877f2", glyph: <path d="M14 8h2V5h-2.5C11.6 5 10.5 6.3 10.5 8.3V10H8.5v3h2v6h3v-6h2.2l.4-3h-2.6V8.6c0-.4.2-.6.5-.6z" fill="currentColor" /> },
  { id: "telegram", label: "Telegram", bg: "#2aabee", glyph: <path d="M20 5.5 3.8 11.7c-.9.4-.9 1.1 0 1.4l4 1.3 1.6 4.8c.2.5.4.6.8.6.3 0 .5-.1.7-.3l2.2-2.1 4.3 3.2c.8.4 1.3.2 1.5-.7l2.7-12.9c.3-1.1-.4-1.6-1.6-1.5zM9 14.2l8.5-5.4-6.7 6.3-.3 3-1.5-3.9z" fill="currentColor" /> },
  { id: "instagram", label: "Instagram", bg: "linear-gradient(45deg,#f9a03f,#e1306c 50%,#833ab4)", glyph: <><rect x="5" y="5" width="14" height="14" rx="4" fill="none" stroke="currentColor" strokeWidth="1.8" /><circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.8" /><circle cx="16.3" cy="7.7" r="1" fill="currentColor" /></> },
  { id: "tiktok", label: "TikTok", bg: "#111", glyph: <path d="M15.5 4c.3 1.9 1.4 3.1 3.3 3.3v2.6c-1.2 0-2.3-.3-3.3-.9v5.6a4.8 4.8 0 1 1-4.8-4.8c.3 0 .5 0 .8.1v2.7a2.2 2.2 0 1 0 1.5 2.1V4h2.5z" fill="currentColor" /> },
];

function shareUrl(net: Net, link: string, text: string): string | null {
  if (net === "facebook") return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`;
  if (net === "telegram") return `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
  return null; // Instagram and TikTok have no web share: the link is copied for the bio / description
}

export default function AuthorPromotion() {
  const session = useSession();
  const me = session?.profile;
  const link = me ? buildReferralLink(window.location.origin, me.id) : "";
  const [notice, setNotice] = useState<string | null>(null);
  const [materials, setMaterials] = useState<AuthorContentItem[]>([]);
  const [stats, setStats] = useState<{ last_30_days: number; all_time: number } | null>(null);

  useEffect(() => {
    if (!me) return;
    fetchAuthorContent(me.id).then(setMaterials).catch(() => setMaterials([]));
    // before supabase/promotion.sql the numbers just stay «—»
    supabase?.rpc("my_referral_stats").then(({ data }) => { if (data) setStats(data as { last_30_days: number; all_time: number }); }, () => {});
  }, [me]);

  const timer = useRef<number | undefined>(undefined);
  const flash = (text: string) => { setNotice(text); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setNotice(null), 3500); };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const copy = async (value: string, text = "Посилання скопійовано") => {
    try { await navigator.clipboard.writeText(value); flash(text); } catch { flash("Не вдалося скопіювати — виділіть посилання й скопіюйте вручну"); }
  };
  const share = (net: Net, value: string, text: string) => {
    const url = shareUrl(net, value, text);
    if (url) window.open(url, "_blank", "noopener,noreferrer,width=640,height=560");
    else void copy(value, net === "instagram" ? "Скопійовано: вставте посилання в біо Instagram або в сторіз (наліпка «Посилання»)" : "Скопійовано: вставте посилання в біо TikTok або в опис відео");
  };
  // a program has its own page; guides and meditations open from the author's page
  const materialLink = (m: AuthorContentItem) =>
    m.kind === "program" && me ? `${window.location.origin}/programs/${encodeURIComponent(m.id)}?ref=${encodeURIComponent(me.id)}` : link;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[32px] font-bold leading-tight text-[#12172b]">Просування</h1>
        <p className="mt-1 text-[15px] text-black/55">Ваше посилання, поширення в соцмережах і посилання на кожен матеріал.</p>
      </div>

      {/* the link */}
      <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#eef0fd] via-white to-[#f6f1ff] p-6 ring-1 ring-[#e4def9] sm:p-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0">
            <div className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#6d5bd0]">Реферальне посилання</div>
            <h2 className="mt-1.5 text-[22px] font-bold leading-snug text-[#12172b]">Діліться — і отримуйте більше з кожної покупки</h2>
            <p className="mt-2 max-w-[620px] text-[15px] leading-relaxed text-black/60">Людина, яка прийшла за вашим посиланням і купила ваш матеріал протягом 30 днів, приносить вам <b className="text-[#12172b]">85%</b> замість звичних <b className="text-[#12172b]">70%</b>. Посилання веде на вашу сторінку автора.</p>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 basis-[280px] truncate rounded-2xl bg-white px-4 py-3 text-[14px] text-[#2d2a5c] ring-1 ring-[#e3def9]">{link}</code>
              <button type="button" onClick={() => void copy(link)} className="min-h-[48px] rounded-2xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] px-5 text-[14px] font-semibold text-white shadow-[0_14px_30px_-16px_rgba(91,61,245,0.8)] hover:opacity-95">Копіювати</button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {NETS.map((n) => (
                <button key={n.id} type="button" onClick={() => share(n.id, link, "Мої матеріали на Sensoria")} className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-white px-3 text-[14px] font-semibold text-[#12172b] ring-1 ring-[#e3def9] transition hover:ring-[#c9bff7]">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl text-white" style={{ background: n.bg }}><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">{n.glyph}</svg></span>
                  {n.label}
                </button>
              ))}
            </div>
            {notice && <p role="status" className="mt-3 rounded-xl bg-emerald-50 px-3.5 py-2.5 text-[13px] text-emerald-900 ring-1 ring-emerald-100">{notice}</p>}
          </div>

          {/* results */}
          <div className="grid content-start gap-3">
            <Stat label="Прийшли за посиланням · 30 днів" value={stats ? String(stats.last_30_days) : "—"} />
            <Stat label="Усього за весь час" value={stats ? String(stats.all_time) : "—"} />
            <div className="rounded-2xl bg-white p-4 ring-1 ring-[#ece8fb]">
              <div className="flex items-baseline justify-between text-[13px] text-black/55"><span>Ваша частка за посиланням</span><b className="text-[18px] text-[#4338ca]">85%</b></div>
              <div className="mt-1 flex items-baseline justify-between text-[13px] text-black/55"><span>Покупка з каталогу Sensoria</span><b className="text-[18px] text-black/60">70%</b></div>
            </div>
          </div>
        </div>
      </section>

      {/* each material */}
      <section className="rounded-[26px] bg-white p-5 ring-1 ring-[#ece8fb] sm:p-6">
        <h2 className="text-[18px] font-bold text-[#12172b]">Посилання на матеріали</h2>
        <p className="mt-1 text-[14px] text-black/55">З вашою позначкою: покупка за ним теж приносить 85%. Програма відкривається одразу, гайди й медитації — на вашій сторінці.</p>
        {materials.length === 0 ? (
          <p className="mt-4 rounded-2xl bg-[#faf9ff] px-4 py-6 text-center text-[14px] text-black/55">Тут з’являться ваші опубліковані програми, гайди й медитації.</p>
        ) : (
          <ul className="mt-4 flex flex-col divide-y divide-[#f1eefb]">
            {materials.map((m) => (
              <li key={`${m.kind}:${m.id}`} className="flex flex-wrap items-center gap-3 py-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f1eeff] text-[#5b3df5]"><Icon name={m.kind} size={20} /></span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-semibold text-[#12172b]">{m.title}</div>
                  <div className="text-[12px] text-black/45">{KIND[m.kind] ?? ""}</div>
                </div>
                <div className="flex gap-1.5">
                  <button type="button" onClick={() => void copy(materialLink(m))} className="min-h-[40px] rounded-xl bg-[#f1eeff] px-3.5 text-[13px] font-semibold text-[#4338ca] hover:bg-[#e7e1ff]">Копіювати</button>
                  {NETS.slice(0, 2).map((n) => (
                    <button key={n.id} type="button" onClick={() => share(n.id, materialLink(m), m.title)} aria-label={`Поділитися в ${n.label}`} className="flex h-10 w-10 items-center justify-center rounded-xl text-white" style={{ background: n.bg }}>
                      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">{n.glyph}</svg>
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* how to share well */}
      <section className="grid gap-3 sm:grid-cols-3">
        {[
          ["idcard", "Посилання в біо", "Instagram, TikTok, Telegram-канал: одне постійне посилання на вашу сторінку автора."],
          ["megaphone", "Після ефіру чи посту", "Згадали практику — дайте посилання на конкретну програму, а не на загальний профіль."],
          ["heart", "Без тиску", "Розкажіть, кому матеріал допоможе. Чесний опис працює краще за знижки."],
        ].map(([icon, title, text]) => (
          <div key={title} className="rounded-[22px] bg-white p-5 ring-1 ring-[#ece8fb]">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f1eeff] text-[#5b3df5]"><Icon name={icon as "heart"} size={18} /></span>
            <div className="mt-3 text-[15px] font-semibold text-[#12172b]">{title}</div>
            <p className="mt-1 text-[13px] leading-relaxed text-black/55">{text}</p>
          </div>
        ))}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-[#ece8fb]">
      <div className="text-[13px] text-black/55">{label}</div>
      <div className="mt-1 text-[26px] font-bold tabular-nums text-[#12172b]">{value}</div>
    </div>
  );
}
