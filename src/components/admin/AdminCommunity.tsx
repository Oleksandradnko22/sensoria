// Admin panel → «Спільнота»: official announcements of «Команда Sensoria», and the posts waiting for a decision —
// hidden by crisis words, by 3 reports or by the server photo check. Return to the feed or delete.
import { useEffect, useState } from "react";
import { useSession } from "../../context/SessionContext";
import AdminAnnouncements from "./AdminAnnouncements";
import FeedCard from "../feed/FeedCard";
import { decideHiddenPost, fetchHiddenPosts, type HiddenPost } from "../../lib/feed";

const REASON: Record<string, string> = {
  crisis: "Кризові слова: людині показали контакти служб допомоги. Прочитайте уважно, за потреби напишіть їй.",
  reports: "Три скарги від різних людей",
  image_check: "Фото не пройшло перевірку на сервері",
};

export default function AdminCommunity() {
  const [view, setView] = useState<"announcements" | "hidden">("announcements");
  const [hidden, setHidden] = useState<HiddenPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const session = useSession();
  const load = () => fetchHiddenPosts().then((l) => { setHidden(l); setError(null); }).catch(() => setError("Не вдалося завантажити. Перевірте, що supabase/feeds.sql виконано і вхід — з двофакторною перевіркою."));
  useEffect(() => { void load(); }, []);

  const decide = async (h: HiddenPost, action: "restore" | "delete") => {
    if (action === "delete" && !window.confirm("Видалити публікацію назавжди?")) return;
    try { await decideHiddenPost(h.post.id, action); setHidden((l) => (l ?? []).filter((x) => x.post.id !== h.post.id)); }
    catch { setError("Не вдалося зберегти рішення."); }
  };

  const tab = (k: typeof view, label: string, count?: number) => (
    <button type="button" role="tab" aria-selected={view === k} onClick={() => setView(k)} className={`inline-flex min-h-[42px] items-center gap-2 rounded-xl px-4 text-[14px] font-semibold transition ${view === k ? "bg-[#eef0fd] text-[#4338ca] ring-1 ring-[#4338ca]/30" : "text-black/55 hover:bg-white"}`}>
      {label}
      {!!count && <span className="rounded-full bg-amber-400 px-1.5 text-[11px] font-bold text-black">{count}</span>}
    </button>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="inline-flex gap-1 self-start rounded-2xl bg-[#eceaf7] p-1" role="tablist" aria-label="Спільнота">
        {tab("announcements", "Оголошення")}
        {tab("hidden", "На перевірці", hidden?.length)}
      </div>
      {view === "announcements" ? <AdminAnnouncements /> : (
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-[26px] font-bold text-[#12172b]">На перевірці</h2>
            <p className="mt-1 max-w-[720px] text-[15px] text-black/55">Публікації, приховані автоматично. Їх бачить лише автор. Поверніть у стрічку, якщо все гаразд, або видаліть.</p>
          </div>
          {error && <p role="alert" className="rounded-2xl bg-amber-50 px-4 py-3 text-[14px] text-amber-900">{error}</p>}
          {hidden && hidden.length === 0 && <p className="rounded-2xl bg-white px-6 py-10 text-center text-[14px] text-black/55 ring-1 ring-[#efeafd]">Нічого не чекає рішення.</p>}
          {hidden?.map((h) => (
            <div key={h.post.id} className="flex flex-col gap-2">
              <p className={`rounded-xl px-4 py-2.5 text-[13px] ${h.reason === "crisis" ? "bg-rose-50 text-rose-900" : "bg-amber-50 text-amber-900"}`}>
                <b>Причина:</b> {REASON[h.reason ?? ""] ?? "Приховано"}{h.reports ? ` · скарг: ${h.reports}` : ""}{h.authorEmail ? ` · ${h.authorEmail}` : ""}
              </p>
              <FeedCard post={{ ...h.post, hiddenAt: null }} viewer={session?.profile ?? null} onOpenContent={() => {}} onChange={() => {}} />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => void decide(h, "restore")} className="rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] px-4 py-2 text-[13px] font-semibold text-white">Повернути в стрічку</button>
                <button type="button" onClick={() => void decide(h, "delete")} className="rounded-xl bg-white px-4 py-2 text-[13px] font-semibold text-rose-700 ring-1 ring-rose-100 hover:bg-rose-50">Видалити</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
