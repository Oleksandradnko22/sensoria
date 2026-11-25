// Admin → «Заявки авторів» (/for-authors): read the application, send the invitation (an e-mail with the author sign-up
// link) or decline. Owner only (admin-data refuses support).
import { useEffect, useState } from "react";
import { approveAuthor, declineAuthor, decideAuthorApplication, fetchAuthorApplications, fetchPendingAuthors, type AuthorApplication, type PendingAuthor } from "../../lib/admin";

const STATUS: Record<AuthorApplication["status"], [string, string]> = {
  new: ["Нова", "bg-amber-100 text-amber-800"],
  invited: ["Запрошено", "bg-emerald-100 text-emerald-800"],
  declined: ["Відхилено", "bg-black/5 text-black/55"],
};

export default function AdminAuthorApplications() {
  const [rows, setRows] = useState<AuthorApplication[] | null>(null);
  const [pending, setPending] = useState<PendingAuthor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = () =>
    Promise.all([fetchAuthorApplications().then(setRows), fetchPendingAuthors().then(setPending).catch(() => setPending([]))])
      .catch((e) => setError(e instanceof Error ? e.message : "Не вдалося завантажити."));
  const approve = async (a: PendingAuthor) => {
    if (!window.confirm(`Відкрити кабінет автора для ${a.name} (${a.email})?`)) return;
    setBusy(a.id);
    setError(null);
    try {
      await approveAuthor(a.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося.");
    } finally {
      setBusy(null);
    }
  };
  // decline a registered author: an optional reason goes into the letter to the author
  const decline = async (a: PendingAuthor) => {
    const reason = window.prompt(`Відхилити анкету ${a.name}? Автор отримає лист.\n\nЯкщо хочете, напишіть причину — її буде в листі (можна лишити порожнім):`, "");
    if (reason === null) return;
    setBusy(a.id);
    setError(null);
    try {
      await declineAuthor(a.id, reason);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося.");
    } finally {
      setBusy(null);
    }
  };
  useEffect(() => { void load(); }, []);

  const decide = async (a: AuthorApplication, d: "invited" | "declined") => {
    if (d === "invited" && !window.confirm(`Надіслати запрошення на ${a.email}?`)) return;
    setBusy(a.id);
    setError(null);
    try {
      await decideAuthorApplication(a.id, d);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося.");
    } finally {
      setBusy(null);
    }
  };

  if (error && !rows) return <p className="text-[14px] text-rose-700">{error}</p>;
  if (!rows) return <p className="text-[14px] text-black/50">Завантажуємо…</p>;
  const fresh = rows.filter((r) => r.status === "new").length;

  return (
    <section>
      {/* registered by the link and signed the documents — waiting for approval */}
      <h3 className="mb-2 text-[16px] font-semibold">Чекають схвалення ({pending.length})</h3>
      <p className="mb-3 text-[14px] text-black/60">Зареєструвалися за посиланням. Одразу після підписання договору автор отримує лист із запрошенням до Telegram-спільноти авторів. «Схвалити» відкриває кабінет автора й надсилає лист.</p>
      {pending.length === 0 && <p className="mb-6 text-[14px] text-black/50">Нікого немає.</p>}
      <div className="mb-8 flex flex-col gap-2">
        {pending.map((a) => (
          <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-black/5 bg-white px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{a.name}</div>
              <div className="break-words text-[13px] text-black/55">{a.email} · {new Date(a.member_since).toLocaleDateString("uk-UA")} · {a.signed ? "оферту підписано" : "оферту ще не підписано"}</div>
              {a.application ? (
                <details className="mt-2 text-[14px]">
                  <summary className="cursor-pointer font-semibold text-[#4338ca]">Анкета</summary>
                  <div className="mt-2 space-y-1 text-black/75">
                    {a.application.phone && <p><b className="text-black">Телефон:</b> {a.application.phone}</p>}
                    <p><b className="text-black">Фах:</b> {a.application.profession}</p>
                    {a.application.education && <p className="whitespace-pre-line"><b className="text-black">Освіта:</b> {a.application.education}</p>}
                    {a.application.experience && <p><b className="text-black">Досвід:</b> {a.application.experience}</p>}
                    {a.application.formats && a.application.formats.length > 0 && <p><b className="text-black">Формати:</b> {a.application.formats.map((x) => ({ program: "програма", guide: "гайд", meditation: "медитація" } as Record<string, string>)[x] ?? x).join(", ")}</p>}
                    {a.application.topics.length > 0 && <p><b className="text-black">Напрями:</b> {a.application.topics.join(", ")}</p>}
                    <p className="whitespace-pre-line"><b className="text-black">Планує:</b> {a.application.plan}</p>
                    {a.application.ready && <p><b className="text-black">Готові матеріали:</b> {({ yes: "так", partly: "частково", no: "ні" } as Record<string, string>)[a.application.ready] ?? a.application.ready}</p>}
                    {a.application.links && <p className="break-words"><b className="text-black">Посилання:</b> {a.application.links}</p>}
                  </div>
                </details>
              ) : (
                <p className="mt-1 text-[13px] text-black/45">Анкети немає (зареєструвався без неї).</p>
              )}
            </div>
            <button type="button" disabled={busy === a.id || !a.signed} onClick={() => void approve(a)} title={a.signed ? undefined : "Спершу автор має підписати оферту"} className="min-h-[44px] rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] px-4 text-[14px] font-semibold text-white disabled:opacity-40">Схвалити</button>
            <button type="button" disabled={busy === a.id} onClick={() => void decline(a)} className="min-h-[44px] rounded-xl border border-black/10 bg-white px-4 text-[14px] font-semibold text-[#b42318] disabled:opacity-40">Відхилити</button>
          </div>
        ))}
      </div>

      <h3 className="mb-2 text-[16px] font-semibold">Заявки з анкети</h3>
      <p className="mb-4 text-[14px] text-black/60">Заявки зі сторінки «Для авторів» · нових: {fresh}. «Запросити» надсилає автору лист із посиланням на реєстрацію автора.</p>
      {error && <p role="alert" className="mb-3 text-[14px] text-rose-700">{error}</p>}
      {rows.length === 0 && <p className="text-[14px] text-black/50">Заявок поки немає.</p>}
      <div className="flex flex-col gap-3">
        {rows.map((a) => {
          const [label, cls] = STATUS[a.status];
          return (
            <article key={a.id} className="rounded-2xl border border-black/5 bg-white p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[16px] font-semibold">{a.name}</div>
                  <div className="text-[13px] text-black/55 break-words">{a.email}{a.phone ? ` · ${a.phone}` : ""} · {new Date(a.created_at).toLocaleDateString("uk-UA")}</div>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold ${cls}`}>{label}</span>
              </div>
              <p className="mt-3 text-[14px]"><b>Фах:</b> {a.profession}</p>
              {a.topics.length > 0 && <p className="mt-1 text-[14px]"><b>Напрями:</b> {a.topics.join(", ")}</p>}
              <p className="mt-1 whitespace-pre-line text-[14px] text-black/75"><b className="text-black">Планує:</b> {a.plan}</p>
              {a.links && <p className="mt-1 break-words text-[14px]"><b>Посилання:</b> {a.links}</p>}
              {a.status === "new" && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" disabled={busy === a.id} onClick={() => void decide(a, "invited")} className="min-h-[44px] rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] px-4 text-[14px] font-semibold text-white disabled:opacity-50">Запросити</button>
                  <button type="button" disabled={busy === a.id} onClick={() => void decide(a, "declined")} className="min-h-[44px] rounded-xl border border-black/10 px-4 text-[14px] font-medium disabled:opacity-50">Відхилити</button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

