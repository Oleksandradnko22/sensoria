// Admin → Користувачі: give a person back what they bought after they deleted
// their account. Purchases of a closed account are moved to the new account.
// Only the owner role can do this (enforced by admin-data).
import { useState } from "react";
import { restorePurchases } from "../../lib/admin";

export default function AdminRestoreAccess() {
  const [oldEmail, setOldEmail] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await restorePurchases(oldEmail, newEmail, reason);
      setMsg({ ok: true, text: r.moved > 0 ? `Готово: перенесено покупок — ${r.moved}.` : "Закритий акаунт знайдено, але покупок для переносу немає." });
      setOldEmail("");
      setNewEmail("");
      setReason("");
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Не вдалося виконати." });
    } finally {
      setBusy(false);
    }
  };

  const input = "min-h-[44px] w-full rounded-xl border border-black/10 bg-white px-3 text-[14px] focus:outline-none focus:border-black/30";
  return (
    <details className="mb-6 rounded-2xl bg-white border border-black/5 p-5">
      <summary className="cursor-pointer text-[15px] font-medium">Відновлення доступу до покупок після видалення акаунта</summary>
      <p className="mt-3 text-[13px] leading-relaxed text-black/60">
        Якщо людина видалила акаунт і хоче повернути придбане: вона реєструє новий акаунт, а ви вводите стару й нову пошту.
        Спершу надійно переконайтеся, що це та сама людина і вона має право на вихідний акаунт: найпростіше листом зі старої пошти. Якщо доступу до неї немає, зіставте інші відомості: ім'я, дату й суму покупки, назви придбаних матеріалів, платіжні дані (без повних номерів). Як ви переконалися, вкажіть у причині: її буде записано в журнал.
        Стару пошту система не зберігає, а лише її контрольний код.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-[13px] text-black/70">
          Стара пошта (видаленого акаунта)
          <input type="email" value={oldEmail} onChange={(e) => setOldEmail(e.target.value)} className={`mt-1 ${input}`} />
        </label>
        <label className="text-[13px] text-black/70">
          Нова пошта (новий акаунт учасника)
          <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className={`mt-1 ${input}`} />
        </label>
      </div>
      <label className="mt-3 block text-[13px] text-black/70">
        Причина / як підтверджено особу
        <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className={`mt-1 ${input}`} />
      </label>
      {msg && (
        <div role={msg.ok ? "status" : "alert"} className={`mt-3 text-[14px] ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>
          {msg.text}
        </div>
      )}
      <button
        onClick={submit}
        disabled={busy || !oldEmail.trim() || !newEmail.trim() || reason.trim().length < 3}
        className="mt-4 min-h-[44px] px-5 rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-white text-[14px] font-medium disabled:opacity-40"
      >
        {busy ? "Зачекайте…" : "Перенести покупки"}
      </button>
    </details>
  );
}
