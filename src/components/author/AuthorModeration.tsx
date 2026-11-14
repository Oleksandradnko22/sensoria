// «Модерація» in the author's cabinet: what is wrong right now (materials paused / unlisted / restricted by
// moderation, «Спільнота» posts hidden for review), how moderation works at Sensoria, the «Фахівець» status, a
// checklist before publishing, and the two verifications (identity, education).
import { useEffect, useState } from "react";
import { useSession } from "../../context/SessionContext";
import { Icon, type IconName } from "../ui/Icon";
import AuthorVerification from "./AuthorVerification";
import { supabase } from "../../lib/supabaseClient";

const RULES: [IconName, string][] = [
  ["sparkle", "Публікуєте самостійно — і відповідаєте за зміст"],
  ["lock", "Чутливі теми — лише зі статусом «Фахівець»"],
  ["shield", "На скарги реагує людина, а не алгоритм"],
];
const CHECKLIST = [
  "Назва й опис відповідають змісту",
  "Немає обіцянок «вилікувати» чи гарантованого результату",
  "Є примітка, що матеріал не замінює консультацію фахівця",
  "Є контакти допомоги в кризі: 7333, 112",
  "Без контактів, посилань і оплати поза Sensoria",
];
const SALE: Record<string, string> = {
  complaint_pending: "Продаж призупинено після скарги",
  unlisted: "Знято з продажу модератором",
  suspended_debt: "Продаж призупинено: борг на балансі",
};

type Issue = { title: string; text: string; reason?: string | null };

export default function AuthorModeration(_props: { content?: unknown }) {
  const me = useSession()?.profile;
  const [issues, setIssues] = useState<Issue[] | null>(null);

  // what moderation changed in the author's own materials and posts (the author reads only their own rows)
  useEffect(() => {
    if (!me || !supabase) return;
    void (async () => {
      const out: Issue[] = [];
      const { data: mats } = await supabase.from("content").select("title, sale_status, access_restricted_at, access_restricted_reason").eq("author_id", me.id);
      (mats ?? []).forEach((m) => {
        if (m.access_restricted_at) out.push({ title: m.title as string, text: "Доступ покупцям обмежено", reason: m.access_restricted_reason as string | null });
        else if (SALE[m.sale_status as string]) out.push({ title: m.title as string, text: SALE[m.sale_status as string] });
      });
      const { count } = await supabase.from("author_posts").select("id", { count: "exact", head: true }).eq("author_id", me.id).not("hidden_at", "is", null);
      if (count) out.push({ title: "«Спільнота»", text: `${count} ${count === 1 ? "допис приховано" : "дописи приховано"} до перевірки модератором` });
      setIssues(out);
    })().catch(() => setIssues([]));
  }, [me]);

  const bad = !!issues && issues.length > 0;
  return (
    <div className="flex w-full flex-col gap-5">
      <div>
        <h1 className="text-[32px] font-bold leading-tight text-[#12172b]">Модерація</h1>
        <p className="mt-1 text-[15px] text-black/55">Чи все гаразд із вашими матеріалами — і як отримати галочку та статус «Фахівець».</p>
      </div>

      {/* 1. status right now */}
      <section className={`rounded-[26px] p-6 ring-1 ${bad ? "bg-amber-50/70 ring-amber-100" : "bg-gradient-to-br from-[#eef0fd] via-white to-[#f6f1ff] ring-[#e4def9]"}`}>
        <div className="flex items-center gap-4">
          <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${bad ? "bg-amber-100 text-amber-800" : "bg-white text-[#5b3df5] shadow-[0_10px_24px_-14px_rgba(91,61,245,0.6)]"}`}><Icon name={bad ? "warning" : "check"} size={26} /></span>
          <div>
            <h2 className="text-[20px] font-bold text-[#12172b]">{issues === null ? "Перевіряємо…" : bad ? "Потребує уваги" : "Усе гаразд"}</h2>
            <p className="text-[14px] text-black/55">{issues === null ? "" : bad ? "Модератор змінив стан вашого матеріалу чи допису." : "Ваші матеріали й дописи доступні людям."}</p>
          </div>
        </div>
        {bad && (
          <ul className="mt-4 flex flex-col gap-2">
            {issues!.map((x, i) => (
              <li key={i} className="rounded-2xl bg-white px-4 py-3 ring-1 ring-amber-100">
                <div className="text-[15px] font-semibold text-[#12172b]">{x.title}</div>
                <div className="text-[14px] text-amber-900">{x.text}{x.reason ? ` · ${x.reason}` : ""}</div>
              </li>
            ))}
            <li className="px-1 text-[13px] text-black/55">Питання щодо рішення — напишіть у «Допомогу».</li>
          </ul>
        )}
      </section>

      {/* 2. statuses */}
      <h2 className="mt-2 text-[13px] font-bold uppercase tracking-[0.14em] text-black/40">Ваші статуси</h2>
      <AuthorVerification />
      <AuthorVerification kind="education" />

      {/* 3. rules, short */}
      <h2 className="mt-2 text-[13px] font-bold uppercase tracking-[0.14em] text-black/40">Коротко про правила</h2>
      <section className="grid gap-3 sm:grid-cols-3">
        {RULES.map(([icon, text]) => (
          <div key={text} className="rounded-[22px] bg-white p-4 ring-1 ring-[#ece8fb]">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f1eeff] text-[#5b3df5]"><Icon name={icon} size={18} /></span>
            <p className="mt-3 text-[14px] font-semibold leading-snug text-[#12172b]">{text}</p>
          </div>
        ))}
      </section>
      <details className="group rounded-[22px] bg-white p-4 ring-1 ring-[#ece8fb] sm:p-5">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[15px] font-semibold text-[#12172b]">
          Пам’ятка перед публікацією
          <Icon name="chevron" size={18} className="text-black/40 transition-transform group-open:rotate-180" />
        </summary>
        <ul className="mt-3 flex flex-col gap-2.5">
          {CHECKLIST.map((g) => (
            <li key={g} className="flex gap-3 text-[14px] leading-snug text-[#2d2a5c]">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#eef0fd] text-[#4338ca]"><Icon name="check" size={12} /></span>
              {g}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
