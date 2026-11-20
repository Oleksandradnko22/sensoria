// Emotional-state data saved BEFORE the separate consent existed (supabase/health-data-retention.sql): kept 30 days so the
// person can give the consent, download a copy or delete it; then deleted automatically. Shown on the participant's
// «Огляд» while such data exists; the last 7 days it is the warning the spec asks for (docs/consent-legal-spec.md, 4).
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { HEALTH_CONSENT_NEEDED, onHealthConsent } from "../../lib/healthConsent";
import { downloadAsJson, exportMyData } from "../../lib/dataExport";
import { Icon } from "../ui/Icon";

export default function HealthDataNotice({ profileId }: { profileId: string }) {
  const [deadline, setDeadline] = useState<string | null>(null);
  const [busy, setBusy] = useState<"copy" | "delete" | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    if (!supabase) return;
    void supabase.rpc("my_health_data_status").then(({ data, error: e }) => {
      if (e || !data) return; // not migrated yet: nothing to show
      setDeadline((data as { deadline: string | null }).deadline ?? null);
    });
  };
  useEffect(load, []);
  // the consent given in the window → the data is kept, the notice goes
  useEffect(() => onHealthConsent((v) => { if (v === "yes") setDeadline(null); }), []);

  if (!deadline) return null;
  const until = new Date(deadline);
  const daysLeft = Math.max(0, Math.ceil((until.getTime() - Date.now()) / 86_400_000));
  const soon = daysLeft <= 7;
  const date = until.toLocaleDateString("uk-UA", { day: "numeric", month: "long", year: "numeric" });

  const copy = async () => {
    setBusy("copy");
    setError(null);
    try {
      downloadAsJson(`sensoria-moi-dani-${new Date().toISOString().slice(0, 10)}.json`, await exportMyData(profileId));
    } catch {
      setError("Не вдалося підготувати копію. Спробуйте ще раз.");
    } finally {
      setBusy(null);
    }
  };
  const purge = async () => {
    if (!supabase) return;
    setBusy("delete");
    setError(null);
    const { error: e } = await supabase.rpc("purge_my_health_data");
    setBusy(null);
    if (e) return setError("Не вдалося видалити. Спробуйте ще раз.");
    setDeadline(null);
  };

  const btn = "inline-flex min-h-[44px] items-center justify-center rounded-xl px-4 text-[14px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4338ca] disabled:opacity-60";
  return (
    <section aria-labelledby="health-data-notice" className={`rounded-[26px] p-5 ring-1 sm:p-6 ${soon ? "bg-amber-50 ring-amber-200" : "bg-white ring-[#ebe8ff] shadow-[0_10px_30px_-14px_rgba(60,60,140,0.28)]"}`}>
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${soon ? "bg-white text-amber-700" : "bg-[#eef0fd] text-[#4338ca]"}`}><Icon name="shield" size={20} /></span>
        <div className="min-w-0">
          <h2 id="health-data-notice" className="text-[17px] font-bold text-[#12172b]">Ваші збережені відповіді без згоди</h2>
          <p className="mt-1 text-[14px] leading-relaxed text-black/65">
            У кабінеті є результати тесту, відмітки настрою, нотатки чи відповіді у вправах, а згоди на зберігання даних про емоційний стан у вас немає.
            Без згоди ми зберігаємо їх до <b className="text-[#12172b]">{date}</b>{soon ? ` (залишилось ${daysLeft} ${daysLeft === 1 ? "день" : daysLeft >= 2 && daysLeft <= 4 ? "дні" : "днів"})` : ""}, а потім видаляємо.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => window.dispatchEvent(new Event(HEALTH_CONSENT_NEEDED))} className={`${btn} bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-white hover:opacity-95`}>Дати згоду й зберегти</button>
            <button type="button" onClick={() => void copy()} disabled={busy !== null} className={`${btn} bg-white text-[#3b27a8] ring-1 ring-[#d9d4f7] hover:bg-[#f3f4ff]`}>{busy === "copy" ? "Готуємо…" : "Завантажити копію"}</button>
            {!confirm ? (
              <button type="button" onClick={() => setConfirm(true)} disabled={busy !== null} className={`${btn} text-black/60 hover:bg-black/[0.04]`}>Видалити зараз</button>
            ) : (
              <span className="inline-flex flex-wrap items-center gap-2 rounded-xl bg-rose-50 px-3 py-1.5 text-[13px] text-rose-800">
                Видалити безповоротно?
                <button type="button" onClick={() => void purge()} disabled={busy !== null} className="min-h-[36px] rounded-lg bg-rose-600 px-3 font-semibold text-white disabled:opacity-60">{busy === "delete" ? "Видаляємо…" : "Так, видалити"}</button>
                <button type="button" onClick={() => setConfirm(false)} className="min-h-[36px] rounded-lg px-2 font-semibold text-rose-800/80">Скасувати</button>
              </span>
            )}
          </div>
          {error && <p role="alert" className="mt-2 text-[13px] text-rose-700">{error}</p>}
        </div>
      </div>
    </section>
  );
}
