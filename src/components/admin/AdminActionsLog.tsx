import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../ui/Icon";
import { fetchAdminActions, type AdminActionRow } from "../../lib/admin";

export const ACTION_LABELS: Record<string, string> = {
  lift_chat_ban: "Знято блокування чату",
  ban_account: "Заблоковано акаунт",
  unban_account: "Розблоковано акаунт",
  verify_author: "Верифіковано автора",
  unverify_author: "Знято верифікацію автора",
  ticket_resolved: "Розглянуто звернення",
  refund_reviewed: "Розглянуто запит на повернення",
  content_report_reviewed: "Розглянуто скаргу на контент",
  report_reviewed: "Розглянуто скаргу",
  delete_comment: "Видалено коментар за скаргою",
  delete_post: "Видалено публікацію за скаргою",
  delete_review: "Видалено відгук за скаргою",
  unpublish_content: "Матеріал остаточно знято з продажу",
  suspend_sale: "Продаж матеріалу призупинено",
  restrict_access: "Доступ до матеріалу обмежено для всіх покупців",
  restore_access: "Доступ до матеріалу відновлено",
  delete_material: "Матеріал видалено",
  education_confirmed: "Надано статус «Фахівець» (документи про освіту переглянуто)",
  education_revoked: "Статус «Фахівець» знято",
  approve_material: "Перший матеріал автора схвалено",
  send_back_material: "Матеріал повернуто автору в чернетки",
  restore_purchases: "Доступ до покупок відновлено в новому акаунті",
  restore_sale: "Продаж матеріалу відновлено",
  verification_approved: "Верифікацію автора схвалено",
  verification_rejected: "Верифікацію автора відхилено",
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("uk-UA", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// Read-only trail of what admins did and when — for disputes ("who
// unblocked this person?"). Newest first, last 100 actions.
export default function AdminActionsLog() {
  const [rows, setRows] = useState<AdminActionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const inFlight = useRef(false);

  const load = useCallback(() => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    fetchAdminActions()
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : "Не вдалося завантажити журнал дій."))
      .finally(() => {
        inFlight.current = false;
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <h1 className="text-2xl font-bold">Журнал дій</h1>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-xl bg-white border border-black/10 text-[14px] font-medium hover:border-black/20 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]"
        >
          <Icon name="refresh" size={16} className={loading ? "animate-spin" : ""} />
          Оновити
        </button>
      </div>
      <p className="text-black/60 text-[14px] mb-5">
        Що, коли й чому робили адміни: блокування, зняття з продажу, обмеження доступу, верифікація, розгляд звернень. Останні 100 дій. Журнал не редагується.
      </p>

      {error && (
        <div role="alert" className="mb-4 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-[14px] text-red-700">
          {/Невідома дія|admin_actions/.test(error)
            ? "Журнал дій ще не налаштований: виконайте admin-actions-migration.sql і розгорніть admin-data."
            : error}
        </div>
      )}
      {!rows && !error && <div className="h-24 rounded-2xl bg-black/[0.06] animate-pulse" aria-busy />}
      {rows && (
        <div className="rounded-2xl bg-white border border-black/5 overflow-hidden">
          {rows.length === 0 ? (
            <p className="px-5 py-10 text-center text-[14px] text-black/60">Дій адміністраторів поки не було.</p>
          ) : (
            <ul className="divide-y divide-black/5">
              {rows.map((r) => (
                <li key={r.id} className="px-5 py-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <div className="min-w-0">
                    <div className="text-[14px] font-medium">{ACTION_LABELS[r.action] ?? r.action}</div>
                    <div className="text-[13px] text-black/60 truncate">
                      {r.targetName ? `${r.targetName}${r.targetEmail ? ` · ${r.targetEmail}` : ""} — ` : ""}
                      {r.materialTitle ? `«${r.materialTitle}» — ` : ""}
                      виконав(ла): {r.actorName}
                    </div>
                    {r.reason && <div className="text-[13px] text-black/70">Причина: {r.reason}</div>}
                  </div>
                  <div className="text-[13px] text-black/60 whitespace-nowrap">{formatWhen(r.createdAt)}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
