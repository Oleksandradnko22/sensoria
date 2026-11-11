// Admin → Черга → Скарги: every complaint (people, content, comments,
// authors, posts, reviews) in one list. The text of private messages is
// never shown here.
import { useMemo, useState } from "react";
import type { AdminReport } from "../../lib/admin";
import ConfirmDialog from "../author/public/ConfirmDialog";
import { formatAbsoluteDate } from "../../utils/relativeTime";
import {
  ACT_TEXT,
  REPEAT_REPORTS_FLAG,
  actionFor,
  secondaryActionsFor,
  openReportsByOwner,
  type ReportActKind,
  REPORT_GROUP_LABELS,
  TARGET_TYPE_LABELS,
  countByGroup,
  filterReports,
  type ReportGroup,
} from "../../utils/reportsView";

const GROUPS = Object.keys(REPORT_GROUP_LABELS) as ReportGroup[];

export default function AdminReports({
  reports,
  error,
  busyId,
  onReviewed,
  onAct,
  onOpenUser,
}: {
  reports: AdminReport[] | null;
  error: string | null;
  busyId: string | null;
  onReviewed: (r: AdminReport) => void;
  onAct: (r: AdminReport, act: ReportActKind, reason?: string) => Promise<void>;
  onOpenUser: (email: string) => void;
}) {
  const [group, setGroup] = useState<ReportGroup>("all");
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [confirm, setConfirm] = useState<{ r: AdminReport; act: ReportActKind } | null>(null);
  const ownerOpen = useMemo(() => openReportsByOwner(reports ?? []), [reports]);
  const counts = useMemo(() => countByGroup(reports ?? [], onlyOpen), [reports, onlyOpen]);
  const shown = useMemo(() => filterReports(reports ?? [], group, onlyOpen), [reports, group, onlyOpen]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Скарги</h1>
      <p className="text-black/60 text-[14px] mb-5">
        Усе, на що скаржаться користувачі: люди в чаті, програми й гайди, коментарі, автори, їхні публікації та відгуки.
        Ви бачите, хто поскаржився і на кого. Тексту приватних повідомлень тут немає.
      </p>

      <div className="flex flex-wrap items-center gap-2 mb-5">
        {GROUPS.map((g) => (
          <button
            key={g}
            onClick={() => setGroup(g)}
            aria-pressed={group === g}
            className={`min-h-[44px] px-4 rounded-full text-[14px] font-medium border transition ${
              group === g ? "bg-[#eef0fd] text-[#4338ca] border-[#4338ca]/35" : "bg-white border-black/10 text-black/70 hover:bg-black/5"
            }`}
          >
            {REPORT_GROUP_LABELS[g]} · {counts[g]}
          </button>
        ))}
        <label className="inline-flex items-center gap-2 min-h-[44px] px-2 text-[14px] text-black/70 cursor-pointer">
          <input type="checkbox" className="accent-black w-4 h-4" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />
          Тільки нерозглянуті
        </label>
      </div>

      {error && <div className="text-red-600 text-[14px] mb-3">{error}</div>}
      {!reports && !error && <div className="text-black/60 text-[14px]">Завантаження…</div>}
      {reports && shown.length === 0 && (
        <div className="text-black/60 text-[14px]">{onlyOpen ? "Нерозглянутих скарг немає." : "Скарг поки немає."}</div>
      )}

      <div className="flex flex-col gap-3">
        {shown.map((r) => (
          <div key={`${r.source}:${r.id}`} className="rounded-2xl bg-white border border-black/5 p-5 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[12px] font-medium text-black/60 uppercase tracking-wide">
                  {TARGET_TYPE_LABELS[r.targetType] ?? r.targetType}
                </div>
                <div className="font-medium text-[16px] break-words">{r.targetLabel}</div>
              </div>
              <span
                className={`shrink-0 px-2.5 py-1 rounded-full text-[12px] font-medium ${
                  r.status === "open" ? "bg-amber-100 text-amber-800" : "bg-black/5 text-black/60"
                }`}
              >
                {r.status === "open" ? "Нове" : "Розглянуто"}
              </span>
            </div>

            {r.snippet && (
              <p className="text-[14px] text-black/80 leading-relaxed rounded-xl bg-black/[0.03] px-3.5 py-2.5 whitespace-pre-line break-words">
                {r.snippet}
              </p>
            )}

            <div className="text-[14px] text-black/80">
              <span className="font-medium">Причина:</span> {r.reason}
            </div>
            {r.details && <p className="text-[14px] text-black/70 leading-relaxed break-words">{r.details}</p>}

            <div className="text-[14px] text-black/60 flex flex-col gap-0.5">
              <div>
                Поскаржився: {r.reporterName ?? "—"}
                {r.reporterEmail ? ` · ${r.reporterEmail}` : ""}
              </div>
              {(r.ownerName || r.ownerEmail) && (
                <div>
                  На кого: {r.ownerName ?? "—"}
                  {r.ownerEmail ? ` · ${r.ownerEmail}` : ""}
                </div>
              )}
              <div>Подано {formatAbsoluteDate(r.createdAt)}</div>
            </div>

            {(() => {
              const n = ownerOpen.get(r.ownerId ?? r.ownerEmail ?? "") ?? 0;
              return n >= REPEAT_REPORTS_FLAG ? (
                <div className="rounded-xl bg-amber-50 text-amber-900 text-[14px] px-3.5 py-2.5">
                  На цю людину вже {n} нерозглянутих скарг — варто переглянути її акаунт.
                </div>
              ) : null;
            })()}

            <div className="flex flex-wrap items-center gap-2">
              {r.ownerEmail && (
                <button
                  onClick={() => onOpenUser(r.ownerEmail as string)}
                  className="min-h-[44px] px-4 rounded-lg border border-black/10 text-[14px] font-medium hover:bg-black/5 transition"
                >
                  До користувача →
                </button>
              )}
              {r.status === "open" &&
                (() => {
                  const act = actionFor(r);
                  return act ? (
                    <button
                      onClick={() => setConfirm({ r, act })}
                      disabled={busyId === r.id}
                      className="min-h-[44px] px-4 rounded-lg bg-rose-50 text-rose-700 text-[14px] font-medium hover:bg-rose-100 transition disabled:opacity-50"
                    >
                      {ACT_TEXT[act].button}
                    </button>
                  ) : null;
                })()}
              {r.status === "open" &&
                secondaryActionsFor(r).map((act) => (
                  <button
                    key={act}
                    onClick={() => setConfirm({ r, act })}
                    disabled={busyId === r.id}
                    className={`min-h-[44px] px-4 rounded-lg text-[14px] font-medium transition disabled:opacity-50 ${
                      act === "restore_sale"
                        ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        : "bg-amber-50 text-amber-800 hover:bg-amber-100"
                    }`}
                  >
                    {ACT_TEXT[act].button}
                  </button>
                ))}
              {r.status === "open" && (
                <button
                  onClick={() => onReviewed(r)}
                  disabled={busyId === r.id}
                  className="min-h-[44px] px-4 rounded-lg bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-white text-[14px] font-medium hover:opacity-90 transition disabled:opacity-50"
                >
                  Розглянуто
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {confirm && (
        <ConfirmDialog
          title={ACT_TEXT[confirm.act].title}
          text={ACT_TEXT[confirm.act].text}
          confirmLabel={ACT_TEXT[confirm.act].button}
          askReason={confirm.act === "unpublish_content" || confirm.act === "restore_sale" || confirm.act === "suspend_sale"}
          busy={busyId === confirm.r.id}
          onCancel={() => setConfirm(null)}
          onConfirm={async (reason) => {
            const c = confirm;
            await onAct(c.r, c.act, reason);
            setConfirm(null);
          }}
        />
      )}
    </div>
  );
}
