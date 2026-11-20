// «Мої скарги»: the participant's own filed reports and their real status
// (open → «На розгляді», reviewed → «Розглянуто»). The moderation outcome
// itself stays team-internal, so none is shown. A report can be withdrawn
// only while it is still open (RLS enforces it too).
import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "../ui/Icon";
import { useSession } from "../../context/SessionContext";
import { myReportsDemo } from "../../data/participantDashboard";
import { fetchMyReports, deleteReport, REPORT_REASON_LABELS, type MyReport, type ReportReason } from "../../lib/reports";
import { formatAbsoluteDate } from "../../utils/relativeTime";
import {
  filterReports,
  reportCounts,
  sortNewest,
  REPORT_STATUS_LABEL,
  type ReportFilter,
} from "../../utils/myActivityView";
import FilterPills from "./FilterPills";
import ConfirmDialog from "../author/public/ConfirmDialog";

const REASON_ICON: Record<ReportReason, { icon: IconName; tint: string }> = {
  requests_contact_info: { icon: "mail", tint: "bg-amber-50 text-amber-700" },
  offers_off_platform_payment: { icon: "card", tint: "bg-amber-50 text-amber-700" },
  inappropriate_content: { icon: "warning", tint: "bg-rose-50 text-rose-700" },
  inappropriate_behavior: { icon: "shield", tint: "bg-rose-50 text-rose-700" },
  danger: { icon: "warning", tint: "bg-rose-50 text-rose-700" },
  needs_help: { icon: "lifebuoy", tint: "bg-rose-50 text-rose-700" },
  other: { icon: "help", tint: "bg-[#eef0fd] text-[#4338ca]" },
};

const STATUS_STYLE = {
  open: "bg-amber-50 text-amber-800",
  reviewed: "bg-emerald-50 text-emerald-800",
} as const;

export default function ParticipantReports({ active = true }: { active?: boolean }) {
  const session = useSession();
  const myId = session?.profile.id;
  const [reports, setReports] = useState<MyReport[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [filter, setFilter] = useState<ReportFilter>("all");
  const [hiddenDemo, setHiddenDemo] = useState<Set<string>>(new Set());
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // quiet=true: refresh without flashing the skeleton (the section stays
  // mounted while hidden, so reopening it must pick up newly filed reports)
  const load = (quiet = false) => {
    if (!myId) return;
    if (!quiet) setState("loading");
    fetchMyReports(myId)
      .then((r) => {
        setReports(r);
        setState("ready");
      })
      .catch(() => !quiet && setState("error"));
  };
  const firstLoad = useRef(true);
  useEffect(() => {
    if (!active) return;
    load(!firstLoad.current);
    firstLoad.current = false;
  }, [myId, active]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!menuId) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuId(null);
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-report-menu]")) setMenuId(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [menuId]);

  // Demo reports keep the existing "real + demo" convention of the cabinet.
  const all = sortNewest([...reports, ...myReportsDemo.filter((r) => !hiddenDemo.has(r.id))], (r) => r.createdAt);
  const counts = reportCounts(all);
  const shown = filterReports(all, filter);
  const confirming = all.find((r) => r.id === confirmId) ?? null;

  const runDelete = async () => {
    if (!confirming) return;
    setBusy(true);
    setDeleteError(null);
    try {
      if (reports.some((r) => r.id === confirming.id)) {
        await deleteReport(confirming.id);
        setReports((p) => p.filter((r) => r.id !== confirming.id));
      } else {
        setHiddenDemo((p) => new Set(p).add(confirming.id));
      }
      setConfirmId(null);
    } catch {
      setConfirmId(null);
      setDeleteError("Не вдалося видалити скаргу. Можливо, її вже розглянули.");
      load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[32px] font-bold leading-tight text-[#12172b]">Мої скарги</h1>
        <p className="text-black/60 mt-1 max-w-[640px]">
          Скарги, які ви подали на авторів або контент. Ми розглядаємо їх уважно, щоб підтримувати безпечне та
          комфортне середовище для всіх учасників.
        </p>
      </div>

      {state === "loading" && (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Завантаження скарг">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[112px] rounded-[22px] bg-white ring-1 ring-[#ece8fb] animate-pulse" />
          ))}
        </div>
      )}

      {state === "error" && all.length === 0 && (
        <div role="alert" className="rounded-[22px] bg-white ring-1 ring-[#ece8fb] px-6 py-10 text-center">
          <div className="text-[16px] font-medium">Не вдалося завантажити скарги</div>
          <button onClick={() => load()} className="mt-3 min-h-[44px] px-5 rounded-xl border border-[#e3def9] text-[14px] text-black/75 hover:bg-[#f6f4ff]">
            Спробувати ще раз
          </button>
        </div>
      )}

      {state !== "loading" && !(state === "error" && all.length === 0) && (
        <>
          {all.length > 0 && (
            <FilterPills
              label="Фільтр скарг за статусом"
              value={filter}
              onChange={setFilter}
              options={[
                { key: "all", label: "Усі", count: counts.all },
                { key: "open", label: REPORT_STATUS_LABEL.open, count: counts.open },
                { key: "reviewed", label: REPORT_STATUS_LABEL.reviewed, count: counts.reviewed },
              ]}
            />
          )}
          {state === "error" && (
            <div role="alert" className="text-[14px] text-rose-700">
              Не вдалося завантажити всі скарги.{" "}
              <button onClick={() => load()} className="underline font-medium">Спробувати ще раз</button>
            </div>
          )}
          {deleteError && <div role="alert" className="text-[14px] text-rose-700">{deleteError}</div>}

          {all.length === 0 ? (
            <div className="max-w-[560px] rounded-[22px] bg-white ring-1 ring-[#ece8fb] px-6 py-10 text-center">
              <span className="mx-auto w-12 h-12 rounded-full bg-[#eef0fd] text-[#4338ca] flex items-center justify-center">
                <Icon name="shield" size={22} />
              </span>
              <div className="text-[16px] font-medium mt-4">Скарг поки немає</div>
              <p className="text-[14px] text-black/60 mt-1 max-w-[400px] mx-auto leading-relaxed">
                Якщо ви помітите некоректну поведінку або контент, що порушує правила платформи, ви зможете
                поскаржитися у розділі «Повідомлення» — у меню діалогу з автором.
              </p>
            </div>
          ) : shown.length === 0 ? (
            <div className="rounded-[22px] bg-white ring-1 ring-[#ece8fb] px-6 py-8 text-center text-[14px] text-black/60">
              Немає скарг зі статусом «{REPORT_STATUS_LABEL[filter as "open" | "reviewed"]}».
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {shown.map((r) => {
                const { icon, tint } = REASON_ICON[r.reason];
                return (
                  <li key={r.id} className="rounded-[22px] bg-white ring-1 ring-[#ece8fb] p-4 sm:p-5 flex gap-4">
                    <span className={`shrink-0 w-11 h-11 rounded-full flex items-center justify-center ${tint}`}>
                      <Icon name={icon} size={20} />
                    </span>
                    <div className="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-start gap-x-4 gap-y-2">
                      <div className="min-w-0 flex-1">
                        <h2 className="text-[17px] font-bold text-[#12172b]">{r.reasonLabel ?? REPORT_REASON_LABELS[r.reason]}</h2>
                        <div className="text-[14px] text-black/60 break-words">
                          {[r.kind, r.reportedName, r.contentTitle].filter(Boolean).join(" · ")}
                        </div>
                        {r.details && <p className="text-[14px] text-[#2d2a5c] mt-1.5 whitespace-pre-wrap break-words">{r.details}</p>}
                        <div className="text-[12px] text-black/60 mt-1.5">{formatAbsoluteDate(r.createdAt)}</div>
                      </div>
                      <div className="flex sm:flex-col sm:items-end items-center gap-2 sm:gap-1 shrink-0">
                        <span className={`px-2.5 py-1 rounded-full text-[12px] font-medium ${STATUS_STYLE[r.status]}`}>
                          {REPORT_STATUS_LABEL[r.status]}
                        </span>
                        <div className="flex items-center gap-1 sm:mt-1 ml-auto sm:ml-0">
                          {r.status === "open" && r.deletable !== false && (
                            <div className="relative" data-report-menu>
                              <button
                                onClick={() => setMenuId(menuId === r.id ? null : r.id)}
                                aria-label="Дії зі скаргою"
                                aria-expanded={menuId === r.id}
                                className="w-11 h-11 rounded-full hover:bg-[#f6f4ff] flex items-center justify-center text-black/60 text-xl"
                              >
                                ⋯
                              </button>
                              {menuId === r.id && (
                                <div className="absolute right-0 top-full mt-1 w-48 rounded-xl bg-white border border-[#e3def9] shadow-[0_10px_24px_rgba(0,0,0,0.1)] py-1 z-10">
                                  <button
                                    onClick={() => {
                                      setMenuId(null);
                                      setDeleteError(null);
                                      setConfirmId(r.id);
                                    }}
                                    className="w-full text-left px-4 py-3 text-[14px] text-red-700 hover:bg-red-50"
                                  >
                                    Відкликати скаргу
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {confirming && (
        <ConfirmDialog
          title="Відкликати скаргу?"
          text="Скаргу можна видалити, поки її ще не розглянули."
          confirmLabel="Видалити"
          busy={busy}
          onConfirm={runDelete}
          onCancel={() => setConfirmId(null)}
        />
      )}
    </div>
  );
}
