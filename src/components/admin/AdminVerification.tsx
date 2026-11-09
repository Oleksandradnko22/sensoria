// Admin → Черга → Верифікація: authors who sent a document for the "галочка".
// Documents open via short-lived private links and are deleted on decision.
import { useState } from "react";
import type { VerificationRequest } from "../../lib/admin";
import { formatAbsoluteDate } from "../../utils/relativeTime";

export default function AdminVerification({
  requests,
  error,
  busyId,
  onDecide,
  onOpenUser,
}: {
  requests: VerificationRequest[] | null;
  error: string | null;
  busyId: string | null;
  onDecide: (r: VerificationRequest, approve: boolean, reason?: string) => Promise<void>;
  onOpenUser: (email: string) => void;
}) {
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const pending = (requests ?? []).filter((r) => r.status === "pending");
  const done = (requests ?? []).filter((r) => r.status !== "pending");

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Верифікація авторів</h1>
      <p className="text-black/60 text-[14px] mb-5">
        Дві окремі заявки. «Особа»: достатньо переконатися, що це реальна людина з тим самим ім'ям. «Освіта»: перегляньте
        диплом чи сертифікат — ім'я збігається, документ схожий на справжній. Це не гарантія кваліфікації, а лише
        перегляд документів; досвід ви не перевіряєте. Після рішення файли видаляються автоматично.
      </p>

      {error && <div className="text-red-600 text-[14px] mb-3">{error}</div>}
      {!requests && !error && <div className="text-black/60 text-[14px]">Завантаження…</div>}
      {requests && pending.length === 0 && <div className="text-black/60 text-[14px] mb-4">Нових заявок немає.</div>}

      <div className="flex flex-col gap-3">
        {pending.map((r) => {
          const checks = [
            { ok: !!r.profile.title.trim(), label: "Спеціалізація" },
            { ok: !!r.profile.bio.trim(), label: "Про себе" },
            { ok: !!r.profile.credentials.trim(), label: "Освіта / дипломи" },
            { ok: r.profile.hasAvatar, label: "Фото профілю" },
          ];
          return (
            <div key={r.id} className="rounded-2xl bg-white border border-black/5 p-5 flex flex-col gap-3">
              <div>
                <span className={`inline-block mb-1 px-2.5 py-0.5 rounded-full text-[12px] font-medium ${r.kind === "education" ? "bg-indigo-50 text-indigo-800" : "bg-black/5 text-black/70"}`}>
                  {r.kind === "education" ? "Заявка: освіта (статус «Фахівець»)" : "Заявка: особа («галочка»)"}
                </span>
                <div className="font-medium text-[16px] break-words">{r.authorName}</div>
                <div className="text-[14px] text-black/60 break-words">{r.authorEmail}</div>
                <div className="text-[14px] text-black/60">Подано {formatAbsoluteDate(r.createdAt)}</div>
              </div>

              <div className="flex flex-wrap gap-2">
                {checks.map((c) => (
                  <span
                    key={c.label}
                    className={`px-2.5 py-1 rounded-full text-[12px] font-medium ${c.ok ? "bg-emerald-50 text-emerald-800" : "bg-black/5 text-black/60"}`}
                  >
                    {c.ok ? "✓" : "—"} {c.label}
                  </span>
                ))}
              </div>
              {r.profile.title && <div className="text-[14px] text-black/80 break-words">{r.profile.title}</div>}
              {r.profile.bio && <p className="text-[14px] text-black/70 leading-relaxed break-words line-clamp-4">{r.profile.bio}</p>}
              {r.note && <p className="text-[14px] rounded-xl bg-black/[0.03] px-3.5 py-2.5 break-words">Коментар автора: {r.note}</p>}

              <div className="flex flex-wrap gap-2">
                {r.documents.length === 0 && <span className="text-[14px] text-rose-700">Файли недоступні.</span>}
                {r.documents.map((d, i) => (
                  <a
                    key={d.url}
                    href={d.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[44px] inline-flex items-center px-4 rounded-lg border border-black/10 text-[14px] font-medium hover:bg-black/5 transition"
                  >
                    Відкрити файл {i + 1}
                  </a>
                ))}
              </div>
              <div className="text-[12px] text-black/60">Посилання діє 1 годину. Оновіть сторінку, якщо воно застаріло.</div>

              {rejecting === r.id ? (
                <div className="flex flex-col gap-2">
                  <label htmlFor={`rej-${r.id}`} className="text-[14px] font-medium">
                    Причина відмови (її побачить автор)
                  </label>
                  <textarea
                    id={`rej-${r.id}`}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={2}
                    maxLength={500}
                    className="rounded-xl border border-black/10 p-3 text-[16px] sm:text-[14px] resize-none focus:outline-none focus:border-black/30"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setRejecting(null);
                        setReason("");
                      }}
                      className="min-h-[44px] px-4 rounded-lg border border-black/10 text-[14px] hover:bg-black/5"
                    >
                      Скасувати
                    </button>
                    <button
                      disabled={!reason.trim() || busyId === r.id}
                      onClick={async () => {
                        await onDecide(r, false, reason.trim());
                        setRejecting(null);
                        setReason("");
                      }}
                      className="min-h-[44px] px-4 rounded-lg bg-rose-600 text-white text-[14px] font-medium disabled:opacity-40"
                    >
                      Відхилити
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => onDecide(r, true)}
                    disabled={busyId === r.id}
                    className="min-h-[44px] px-5 rounded-lg bg-black text-white text-[14px] font-medium hover:opacity-90 transition disabled:opacity-50"
                  >
                    {r.kind === "education" ? "Документи переглянуто — надати «Фахівець»" : "Верифікувати"}
                  </button>
                  <button
                    onClick={() => setRejecting(r.id)}
                    className="min-h-[44px] px-4 rounded-lg border border-black/10 text-[14px] font-medium hover:bg-black/5 transition"
                  >
                    Відхилити…
                  </button>
                  <button
                    onClick={() => onOpenUser(r.authorEmail)}
                    className="min-h-[44px] px-4 rounded-lg border border-black/10 text-[14px] font-medium hover:bg-black/5 transition"
                  >
                    До користувача →
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {done.length > 0 && (
        <div className="mt-8">
          <h2 className="text-[16px] font-semibold mb-2">Нещодавно розглянуті</h2>
          <ul className="flex flex-col gap-1 text-[14px] text-black/80">
            {done.map((r) => (
              <li key={r.id}>
                {r.authorName} ({r.kind === "education" ? "освіта" : "особа"}) — {r.status === "approved" ? (r.kind === "education" ? "документи переглянуто" : "особу перевірено") : `відхилено${r.rejectReason ? ` («${r.rejectReason}»)` : ""}`}
                {r.reviewedAt ? `, ${formatAbsoluteDate(r.reviewedAt)}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
