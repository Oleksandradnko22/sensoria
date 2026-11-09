// One person at a glance: complaints against them, chat signals, bans,
// what admins did with this account, verification history.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fetchUserDetail, type AdminUserRow, type UserDetail } from "../../lib/admin";
import { useModal } from "../author/public/useModal";
import { formatAbsoluteDate } from "../../utils/relativeTime";
import { chatBanState } from "../../utils/chatBan";
import { TARGET_TYPE_LABELS } from "../../utils/reportsView";
import { ACTION_LABELS } from "./AdminActionsLog";

const VERIFY_LABELS: Record<string, string> = { pending: "На розгляді", approved: "Схвалено", rejected: "Відхилено" };

export default function AdminUserDetail({ user, onClose }: { user: AdminUserRow; onClose: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  useModal(root, onClose);
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchUserDetail(user.id)
      .then((d) => !cancelled && setDetail(d))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Не вдалося завантажити."));
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  const ban = chatBanState(user.chatBan ? { permanent: user.chatBan.permanent, untilIso: user.chatBan.until } : null, Date.now());
  const openReports = detail?.reports.filter((r) => r.status === "open").length ?? 0;

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        ref={root}
        role="dialog"
        aria-modal="true"
        aria-label={`Деталі: ${user.name}`}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[560px] max-h-[90vh] overflow-y-auto rounded-2xl bg-white text-black p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[20px] font-bold break-words">{user.name}</h2>
            <div className="text-[14px] text-black/60 break-words">
              {user.email} · {user.role === "author" ? "Автор" : "Учасник"}
            </div>
            <div className="text-[14px] text-black/60">Реєстрація: {formatAbsoluteDate(user.createdAt)}</div>
          </div>
          <button data-autofocus onClick={onClose} className="min-h-[44px] px-4 rounded-xl border border-black/10 text-[14px] hover:bg-black/5">
            Закрити
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-[14px]">
          {user.isBanned && <span className="px-3 py-1 rounded-full bg-red-50 text-red-700">Акаунт заблоковано</span>}
          {ban.active && <span className="px-3 py-1 rounded-full bg-amber-50 text-amber-800">Чат заблоковано</span>}
          {user.role === "author" && (
            <span className={`px-3 py-1 rounded-full ${user.verified ? "bg-emerald-50 text-emerald-800" : "bg-black/5 text-black/70"}`}>
              {user.verified ? "Верифіковано" : "Не верифіковано"}
            </span>
          )}
        </div>

        {error && <div className="mt-4 text-[14px] text-red-600">{error}</div>}
        {!detail && !error && <div className="mt-4 text-[14px] text-black/60">Завантаження…</div>}

        {detail && (
          <div className="mt-5 flex flex-col gap-5 text-[14px]">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { l: "Скарг на людину", v: detail.reports.length, hint: `${openReports} нових` },
                { l: "Блокувань у чаті", v: detail.blockCount, hint: "BLOCK" },
                { l: "Попереджень", v: detail.warnCount, hint: "WARN" },
                { l: "Банів чату", v: user.chatBan?.count ?? 0, hint: "всього" },
              ].map((c) => (
                <div key={c.l} className="rounded-xl bg-[#f6f8ff] p-3">
                  <div className="text-[24px] font-semibold tabular-nums leading-none">{c.v}</div>
                  <div className="mt-1 text-black/70">{c.l}</div>
                  <div className="text-[12px] text-black/60">{c.hint}</div>
                </div>
              ))}
            </div>
            {user.role === "author" && <div className="text-black/70">Матеріалів у базі: {detail.contentCount}</div>}

            <section>
              <h3 className="font-semibold mb-2">Скарги на цю людину</h3>
              {detail.reports.length === 0 ? (
                <div className="text-black/60">Немає.</div>
              ) : (
                <ul className="flex flex-col gap-2">
                  {detail.reports.slice(0, 15).map((r) => (
                    <li key={`${r.source}:${r.id}`} className="rounded-xl border border-black/10 p-3">
                      <div className="text-black/60 text-[12px]">
                        {TARGET_TYPE_LABELS[r.targetType] ?? r.targetType} · {formatAbsoluteDate(r.createdAt)} ·{" "}
                        {r.status === "open" ? "нова" : "розглянуто"}
                      </div>
                      <div className="font-medium break-words">{r.reason}</div>
                      {r.snippet && <div className="text-black/70 break-words">{r.snippet}</div>}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {detail.verificationRequests.length > 0 && (
              <section>
                <h3 className="font-semibold mb-2">Заявки на верифікацію</h3>
                <ul className="flex flex-col gap-1">
                  {detail.verificationRequests.map((v) => (
                    <li key={v.id} className="text-black/80">
                      {formatAbsoluteDate(v.createdAt)} — {VERIFY_LABELS[v.status] ?? v.status}
                      {v.rejectReason ? ` («${v.rejectReason}»)` : ""}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <h3 className="font-semibold mb-2">Дії адміністраторів з цим акаунтом</h3>
              {detail.actions.length === 0 ? (
                <div className="text-black/60">Немає.</div>
              ) : (
                <ul className="flex flex-col gap-1">
                  {detail.actions.map((a) => (
                    <li key={a.id} className="text-black/80">
                      {formatAbsoluteDate(a.createdAt)} — {ACTION_LABELS[a.action] ?? a.action}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
