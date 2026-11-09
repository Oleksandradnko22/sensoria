import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../ui/Icon";
import { fetchModerationLog, liftChatBan, setUserBanned } from "../../lib/admin";
import ConfirmDialog from "../author/public/ConfirmDialog";
import { moderationDemoOn } from "../../dev/moderationPreview";
import ChatBanControls from "./ChatBanControls";
import { getInitials } from "../../lib/auth";
import AdminSelect from "./AdminSelect";
import {
  ADMIN_ATTENTION_BLOCKS,
  NO_CHAT_BAN,
  DEFAULT_FILTERS,
  filterRows,
  hasActiveFilters,
  needsAdminAttention,
  sortNewestFirst,
  summarizeSenders,
  splitSenders,
  categoryLabel,
  type SenderSummary,
  type ActionFilter,
  type FlaggedAction,
  type ModerationFilters,
  type ModerationRow,
  type PeriodFilter,
} from "../../utils/moderationView";

const ACTION_STYLE: Record<FlaggedAction, string> = {
  WARN: "bg-amber-50 text-amber-800",
  BLOCK: "bg-red-50 text-red-700",
};

const ACTION_OPTIONS: { value: ActionFilter; label: string }[] = [
  { value: "all", label: "Усі дії" },
  { value: "WARN", label: "WARN" },
  { value: "BLOCK", label: "BLOCK" },
];
const PERIOD_OPTIONS: { value: PeriodFilter; label: string }[] = [
  { value: 0, label: "Весь час" },
  { value: 7, label: "Останні 7 днів" },
  { value: 30, label: "Останні 30 днів" },
  { value: 90, label: "Останні 90 днів" },
];

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("uk-UA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ActionBadge({ action }: { action: FlaggedAction }) {
  return (
    <span className={`inline-block px-2.5 py-1 rounded-full text-[12px] font-semibold ${ACTION_STYLE[action]}`}>
      {action}
    </span>
  );
}

function Sender({ row }: { row: ModerationRow }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <span className="w-9 h-9 rounded-full bg-violet-100 text-violet-700 text-[13px] font-semibold flex items-center justify-center shrink-0">
        {getInitials(row.senderName)}
      </span>
      <div className="min-w-0">
        <div className="text-[14px] font-medium truncate">{row.senderName}</div>
        <div className="text-[13px] text-black/60 truncate">{row.senderEmail}</div>
      </div>
    </div>
  );
}

const cats = (r: ModerationRow) => (r.categories.length ? r.categories.map(categoryLabel).join(", ") : "—");

export default function AdminModeration({ onOpenUser }: { onOpenUser: (email: string) => void }) {
  const [rows, setRows] = useState<ModerationRow[] | null>(null);
  const [allowedCount, setAllowedCount] = useState<number | undefined>(undefined);
  const [flaggedTotal, setFlaggedTotal] = useState<number | undefined>(undefined);
  const [howOpen, setHowOpen] = useState(false);
  const [banTarget, setBanTarget] = useState<SenderSummary | null>(null);
  const [banning, setBanning] = useState(false);
  const demo = import.meta.env.DEV && moderationDemoOn();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<ModerationFilters>(DEFAULT_FILTERS);
  const inFlight = useRef(false);
  const [liftingId, setLiftingId] = useState<string | null>(null);
  const [liftError, setLiftError] = useState<string | null>(null);

  const lift = async (senderId: string) => {
    setLiftingId(senderId);
    setLiftError(null);
    try {
      await liftChatBan(senderId);
      load(); // server state is the truth — reload the log + ban status
    } catch (e) {
      setLiftError(e instanceof Error ? e.message : "Не вдалося зняти блокування.");
    } finally {
      setLiftingId(null);
    }
  };

  const banAccount = async () => {
    if (!banTarget) return;
    setBanning(true);
    setLiftError(null);
    try {
      await setUserBanned(banTarget.senderId, true);
      setBanTarget(null);
      load();
    } catch (e) {
      setLiftError(e instanceof Error ? e.message : "Не вдалося заблокувати акаунт.");
      setBanTarget(null);
    } finally {
      setBanning(false);
    }
  };

  const load = useCallback(() => {
    if (inFlight.current) return; // no duplicate requests
    inFlight.current = true;
    setLoading(true);
    setError(null);
    fetchModerationLog()
      .then(({ entries, allowedCount: allowed, flaggedTotal: total }) => {
        setAllowedCount(allowed);
        setFlaggedTotal(total);
        setRows(
          entries
            // Only decisions that need a look; ALLOW is just counted.
            .filter((e) => e.action === "WARN" || e.action === "BLOCK")
            .map((e) => ({
              id: e.id,
              senderId: e.senderId,
              senderName: e.senderName,
              senderEmail: e.senderEmail,
              senderChatBan: e.senderChatBan ?? NO_CHAT_BAN,
              senderAccountBanned: e.senderAccountBanned ?? false,
              action: e.action,
              riskScore: typeof e.riskScore === "number" ? e.riskScore : null,
              categories: Array.isArray(e.categories) ? e.categories : [],
              createdAt: e.createdAt,
            }))
        );
      })
      // On failure keep whatever was already shown; just report the error.
      .catch((e) => setError(e instanceof Error ? e.message : "Не вдалося завантажити журнал."))
      .finally(() => {
        inFlight.current = false;
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const sorted = useMemo(() => (rows ? sortNewestFirst(rows) : null), [rows]);
  // Period applies to the summary too; search / action filters only to the table.
  const inPeriod = useMemo(
    () => (sorted ? filterRows(sorted, { ...DEFAULT_FILTERS, days: filters.days }, Date.now()) : null),
    [sorted, filters.days]
  );
  const visible = useMemo(
    () => (sorted ? filterRows(sorted, filters, Date.now()) : null),
    [sorted, filters]
  );
  const { needsAction, watching } = useMemo(
    () => splitSenders(inPeriod ? summarizeSenders(inPeriod) : [], Date.now()),
    [inPeriod]
  );
  const set = <K extends keyof ModerationFilters>(k: K, v: ModerationFilters[K]) =>
    setFilters((f) => ({ ...f, [k]: v }));
  const filtered = hasActiveFilters(filters);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-1">
        <h1 className="text-2xl font-bold">Журнал модерації</h1>
        {demo && (
          <span className="px-2.5 py-1 rounded-full bg-violet-100 text-violet-800 text-[12px] font-semibold">
            Демо-дані — не справжні
          </span>
        )}
      </div>
      <p className="text-black/60 text-[14px]">
        Повідомлення, які система затримала або позначила. Тексту повідомлень тут немає.{" "}
        <button
          onClick={() => setHowOpen((o) => !o)}
          aria-expanded={howOpen}
          className="inline min-h-[44px] sm:min-h-0 text-[#2563eb] font-medium hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] rounded"
        >
          {howOpen ? "Згорнути" : "Як це працює"}
        </button>
      </p>
      {howOpen && (
        <div className="mt-2 mb-1 rounded-xl bg-white border border-black/5 px-4 py-3 text-[14px] text-black/70 leading-relaxed">
          <p>
            <b className="font-semibold text-amber-800">WARN</b> — повідомлення надіслано, але підозріле.{" "}
            <b className="font-semibold text-red-700">BLOCK</b> — не надіслано.
          </p>
          <p className="mt-1.5">
            Кожні 3 нові BLOCK блокують <b className="font-semibold">чат</b> користувача: 3 дні → 7 → 14 → 30 днів →
            назавжди. Акаунт при цьому працює. Помилкове блокування можна зняти кнопкою «Зняти блокування чату».
          </p>
          <p className="mt-1.5">
            Якщо в людини {ADMIN_ATTENTION_BLOCKS}+ BLOCK, вона з'явиться серед тих, хто потребує вашого рішення: можна
            написати їй або заблокувати акаунт.
          </p>
        </div>
      )}
      {(allowedCount !== undefined || (flaggedTotal !== undefined && rows && flaggedTotal > rows.length)) && (
        <p className="text-black/60 text-[13px] mt-2">
          {allowedCount !== undefined && <>Пройшло без зауважень: {allowedCount.toLocaleString("uk-UA")} (точна кількість записів у журналі).</>}
          {flaggedTotal !== undefined && rows && flaggedTotal > rows.length && (
            <> Показано останні {rows.length.toLocaleString("uk-UA")} із {flaggedTotal.toLocaleString("uk-UA")} позначених.</>
          )}
        </p>
      )}
      <div className="mb-5" />

      {needsAction.length > 0 && (
        <section aria-label="Потребують вашого рішення" className="mb-6">
          <h2 className="text-[16px] font-semibold">Потребують вашого рішення</h2>
          <p className="text-[13px] text-black/60 mb-2">
            Чат заблоковано (можна зняти, якщо це непорозуміння) або набралось {ADMIN_ATTENTION_BLOCKS}+ BLOCK.
          </p>
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {needsAction.map((u) => (
              <li key={u.senderId} className="rounded-2xl bg-white border border-black/5 p-4 flex flex-col gap-3 min-w-0">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-10 h-10 rounded-full bg-violet-100 text-violet-700 text-[13px] font-semibold flex items-center justify-center shrink-0">
                    {getInitials(u.senderName)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-medium truncate">{u.senderName}</div>
                    <div className="text-[13px] text-black/70">
                      {u.block > 0 && <span className="text-red-700 font-medium">{u.block} BLOCK</span>}
                      {u.block > 0 && u.warn > 0 && " · "}
                      {u.warn > 0 && <span className="text-amber-800 font-medium">{u.warn} WARN</span>}
                    </div>
                  </div>
                </div>
                {needsAdminAttention(u) && (
                  <div className="text-[13px] text-amber-900 bg-amber-50 rounded-lg px-3 py-2 font-medium">
                    {ADMIN_ATTENTION_BLOCKS}+ блокувань — зв'яжіться з користувачем або заблокуйте акаунт
                  </div>
                )}
                <ChatBanControls ban={u.chatBan} busy={liftingId === u.senderId} onLift={() => lift(u.senderId)} />
                {u.accountBanned ? (
                  <span className="self-start px-2 py-0.5 rounded-full bg-red-50 text-red-700 text-[12px] font-medium">
                    Акаунт заблоковано
                  </span>
                ) : (
                  needsAdminAttention(u) && (
                    <button
                      onClick={() => setBanTarget(u)}
                      className="self-start min-h-[44px] px-3 rounded-lg text-[13px] font-medium bg-red-50 text-red-700 hover:bg-red-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                    >
                      Заблокувати акаунт
                    </button>
                  )
                )}
                <button
                  onClick={() => onOpenUser(u.senderEmail)}
                  className="self-start min-h-[44px] -mt-1 px-1 text-[14px] font-medium text-[#2563eb] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] rounded-lg"
                >
                  До користувача →
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {watching.length > 0 && (
        <section aria-label="Є сигнали, чат працює" className="mb-6">
          <h2 className="text-[16px] font-semibold">Є сигнали, чат працює</h2>
          <p className="text-[13px] text-black/60 mb-2">Ще не дійшло до блокування чату — просто тримайте в полі зору.</p>
          <ul className="rounded-2xl bg-white border border-black/5 divide-y divide-black/5">
            {watching.map((u) => (
              <li key={u.senderId} className="px-4 py-2 flex items-center gap-3 min-w-0">
                <span className="w-8 h-8 rounded-full bg-violet-100 text-violet-700 text-[12px] font-semibold flex items-center justify-center shrink-0">
                  {getInitials(u.senderName)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-medium truncate">{u.senderName}</div>
                  <div className="text-[13px] text-black/70">
                    {u.block > 0 && <span className="text-red-700 font-medium">{u.block} BLOCK</span>}
                    {u.block > 0 && u.warn > 0 && " · "}
                    {u.warn > 0 && <span className="text-amber-800 font-medium">{u.warn} WARN</span>}
                    {u.chatBan.count > 0 && <span className="text-black/60"> · блокувань чату раніше: {u.chatBan.count}</span>}
                  </div>
                </div>
                <button
                  onClick={() => onOpenUser(u.senderEmail)}
                  className="shrink-0 min-h-[44px] px-1 text-[13px] font-medium text-[#2563eb] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] rounded-lg"
                >
                  До користувача →
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <label className="relative flex-1 min-w-[220px] max-w-[420px]">
          <span className="sr-only">Пошук за користувачем або email</span>
          <Icon name="search" size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-black/50" />
          <input
            value={filters.query}
            onChange={(e) => set("query", e.target.value)}
            placeholder="Пошук за користувачем або email..."
            className="w-full min-h-[44px] pl-10 pr-3 rounded-xl bg-white border border-black/10 text-[14px] placeholder:text-black/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]"
          />
        </label>
        <AdminSelect value={filters.action} options={ACTION_OPTIONS} onChange={(v) => set("action", v)} label="Дія" icon="shield" />
        <AdminSelect value={filters.days} options={PERIOD_OPTIONS} onChange={(v) => set("days", v)} label="Період" icon="clock" />
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-xl bg-white border border-black/10 text-[14px] font-medium hover:border-black/20 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]"
        >
          <Icon name="refresh" size={16} className={loading ? "animate-spin" : ""} />
          Оновити
        </button>
      </div>

      {liftError && (
        <div role="alert" className="mb-4 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-[14px] text-red-700">
          {liftError}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-[14px] text-red-700 flex flex-wrap items-center justify-between gap-3"
        >
          <span>{error}</span>
          <button
            onClick={load}
            disabled={loading}
            className="min-h-[44px] px-4 rounded-lg bg-white border border-red-200 font-medium hover:bg-red-50 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
          >
            Спробувати ще раз
          </button>
        </div>
      )}

      {!visible && !error && (
        <div className="rounded-2xl bg-white border border-black/5 p-4 flex flex-col gap-3" aria-busy>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 rounded-xl bg-black/[0.06] animate-pulse" />
          ))}
        </div>
      )}

      {rows && visible && (
        <div className={`rounded-2xl bg-white border border-black/5 overflow-hidden transition-opacity ${loading ? "opacity-60" : ""}`}>
          {rows.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-[15px] font-medium mb-1">Усе чисто</p>
              <p className="text-[14px] text-black/60">Попереджень і блокувань поки не було.</p>
            </div>
          ) : visible.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-[14px] text-black/60 mb-3">За вибраними умовами нічого не знайдено.</p>
              {filtered && (
                <button
                  onClick={() => setFilters(DEFAULT_FILTERS)}
                  className="min-h-[44px] px-4 rounded-xl bg-[#eef2ff] text-[#1d4ed8] text-[14px] font-medium hover:bg-[#e0e7ff] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]"
                >
                  Скинути пошук і фільтри
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Desktop / tablet */}
              <table className="w-full text-[14px] hidden md:table">
                <thead>
                  <tr className="text-left text-black/60 border-b border-black/5 text-[13px]">
                    <th scope="col" className="px-5 py-3 font-medium">Відправник</th>
                    <th scope="col" className="px-3 py-3 font-medium">Дія</th>
                    <th scope="col" className="px-3 py-3 font-medium">Категорії</th>
                    <th scope="col" className="px-5 py-3 font-medium">Дата</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => (
                    <tr key={r.id} className="border-b border-black/5 last:border-0 hover:bg-[#f6f8ff] transition-colors">
                      <td className="px-5 py-3 max-w-[320px]"><Sender row={r} /></td>
                      <td className="px-3 py-3"><ActionBadge action={r.action as FlaggedAction} /></td>
                      <td className="px-3 py-3 text-black/70">{cats(r)}</td>
                      <td className="px-5 py-3 text-black/70 whitespace-nowrap" title={r.createdAt}>
                        {formatWhen(r.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Mobile: compact record list */}
              <ul className="md:hidden divide-y divide-black/5">
                {visible.map((r) => (
                  <li key={r.id} className="px-4 py-3 flex flex-col gap-2">
                    <Sender row={r} />
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-black/70">
                      <ActionBadge action={r.action as FlaggedAction} />
                      <span>Категорії: {cats(r)}</span>
                    </div>
                    <div className="text-[13px] text-black/60" title={r.createdAt}>{formatWhen(r.createdAt)}</div>
                  </li>
                ))}
              </ul>

              <div className="px-5 py-3 border-t border-black/5 text-[13px] text-black/60">
                Показано {visible.length} з {rows.length} {rows.length === 1 ? "запису" : "записів"}
              </div>
            </>
          )}
        </div>
      )}
      {banTarget && (
        <ConfirmDialog
          title="Заблокувати акаунт?"
          text={`${banTarget.senderName} більше не зможе користуватись платформою (вхід буде закрито). Розблокувати можна у вкладці «Користувачі».`}
          confirmLabel="Заблокувати акаунт"
          busy={banning}
          onConfirm={banAccount}
          onCancel={() => !banning && setBanTarget(null)}
        />
      )}
    </div>
  );
}
