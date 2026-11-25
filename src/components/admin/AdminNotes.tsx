import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

// The owner's own notes on «Головна»: what to do, whom to answer, ideas. Table admin_notes (supabase/admin-notes.sql):
// only admins who signed in with the phone code can read or change it.
type Note = { id: string; text: string; done: boolean; created_at: string };

export default function AdminNotes() {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");

  const load = async () => {
    if (!supabase) { setNotes([]); return; }
    const { data, error: e } = await supabase.from("admin_notes").select("id, text, done, created_at").order("done").order("created_at", { ascending: false });
    if (e) { setError("Нотатки не завантажилися. Якщо це перший раз — запустіть supabase/admin-notes.sql."); setNotes([]); return; }
    setNotes((data ?? []) as Note[]);
  };
  useEffect(() => { void load(); }, []);

  const add = async () => {
    const t = text.trim();
    if (!t || !supabase) return;
    const { error: e } = await supabase.from("admin_notes").insert({ text: t });
    if (e) { setError("Не вдалося зберегти нотатку."); return; }
    setText(""); setError(null); void load();
  };
  const toggle = async (n: Note) => { await supabase?.from("admin_notes").update({ done: !n.done }).eq("id", n.id); void load(); };
  const remove = async (n: Note) => { await supabase?.from("admin_notes").delete().eq("id", n.id); void load(); };

  return (
    <section aria-labelledby="home-notes">
      <h2 id="home-notes" className="text-[18px] font-semibold text-[#12172b]">Мої нотатки</h2>
      <p className="mt-1 text-[14px] text-[#5a6080]">Що не забути: кому відповісти, що перевірити, ідеї. Бачите лише ви.</p>
      <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); void add(); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} placeholder="Наприклад: написати Ірині щодо першого гайду" aria-label="Нова нотатка"
          className="min-h-[48px] flex-1 rounded-xl border border-[#e3e1f5] bg-white px-4 text-[15px] outline-none focus:border-[#6d5cf0]" />
        <button type="submit" disabled={!text.trim()} className="min-h-[48px] rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] px-5 text-[14px] font-semibold text-white disabled:opacity-50">Додати</button>
      </form>
      {error && <p role="alert" className="mt-2 text-[14px] text-[#c0262d]">{error}</p>}
      <ul className="mt-3 grid gap-2">
        {(notes ?? []).map((n) => (
          <li key={n.id} className="flex items-start gap-3 rounded-xl bg-white px-4 py-3 ring-1 ring-[#e6e3fb]">
            <input type="checkbox" checked={n.done} onChange={() => void toggle(n)} aria-label="Зроблено" className="mt-1 h-5 w-5 accent-[#5b5cf0]" />
            <div className="min-w-0 flex-1">
              <p className={`whitespace-pre-wrap break-words text-[15px] ${n.done ? "text-black/40 line-through" : "text-[#12172b]"}`}>{n.text}</p>
              <p className="mt-0.5 text-[12px] text-black/40">{new Date(n.created_at).toLocaleString("uk-UA", { timeZone: "Europe/Kyiv", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</p>
            </div>
            <button type="button" onClick={() => void remove(n)} className="min-h-[36px] rounded-lg px-2 text-[13px] text-black/45 hover:text-[#c0262d]">Видалити</button>
          </li>
        ))}
        {notes && notes.length === 0 && !error && <li className="text-[14px] text-black/45">Нотаток поки немає.</li>}
      </ul>
    </section>
  );
}
