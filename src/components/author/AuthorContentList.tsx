import { coverImageStyle, coverUrlForFrame } from "../../utils/coverFocus";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Icon, type IconName } from "../ui/Icon";
import { pluralUk } from "../../utils/plural";
import {
  type AuthoredContent,
  type ContentStatus,
  type ContentType,
} from "../../data/authorDashboard";
import CatalogSort from "../catalog/CatalogSort";
import { filterContent, sortContent, toggleArchive, type SortKey } from "../../utils/authorContentList";
import { canDeleteDraft, ARCHIVE_COOLDOWN_DAYS, archiveBlockedLabel, archiveBlockedUntil, formatDayMonth } from "../../utils/archiveRules";
import { fetchArchiveBlockers, type ArchiveBlockers } from "../../lib/content";

type Props = {
  content: AuthoredContent[];
  onCreate: (type?: ContentType) => void;
  onEdit: (id: string) => void;
  // archive / restore: resolves when the database accepted it, rejects with a message the author can read
  onChangeStatus: (item: AuthoredContent, status: ContentStatus) => Promise<void>;
  // permanently removes a never-published, never-bought draft; rejects with a readable message
  onDeleteDraft?: (item: AuthoredContent) => Promise<void>;
  // the real part of the list is fetched by the dashboard; the demo items are always there
  loading?: boolean;
  loadFailed?: boolean;
  onRetry?: () => void;
};

const typeLabel: Record<ContentType, string> = {
  program: "Програма",
  meditation: "Медитація",
  guide: "Гайд",
};

const typeFilterLabel: Record<ContentType, string> = {
  program: "Програми",
  meditation: "Медитації",
  guide: "Гайди",
};

const typeIcon: Record<ContentType, IconName> = {
  program: "program",
  meditation: "meditation",
  guide: "guide",
};

const PAGE = 4;

const statusLabel: Record<ContentStatus, string> = {
  published: "Опубліковано",
  draft: "Чернетка",
  review: "На модерації",
  archived: "В архіві",
};

// A draft that was live before (restored from the archive) is not a plain draft: it cannot be deleted and has
// buyers' history, so it gets its own label.
const wasLive = (item: { status: string; everPublished?: boolean }) => item.status === "draft" && item.everPublished === true;
const WAS_LIVE_LABEL = "Знято з публікації";
const WAS_LIVE_STYLE = "bg-violet-50 text-violet-700 ring-violet-200";

const statusStyle: Record<ContentStatus, string> = {
  published: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  draft: "bg-slate-100 text-slate-600 ring-slate-200",
  review: "bg-amber-50 text-amber-700 ring-amber-200",
  archived: "bg-rose-50 text-rose-600 ring-rose-200",
};

// Only keys that have a real value behind them (status, updatedAt, title, participants, revenue, rating).
// "default" = by status (published, moderation, drafts, archive), newest first inside each group.
const SORTS: { id: SortKey; label: string }[] = [
  { id: "default", label: "За замовчуванням" },
  { id: "newest", label: "Найновіші" },
  { id: "oldest", label: "Найстаріші" },
  { id: "title", label: "За назвою" },
  { id: "participants", label: "За кількістю учасників" },
  { id: "rating", label: "За рейтингом" },
  { id: "revenue", label: "За доходом" },
];

// ── small line icons for the row actions ─────────────────────────────────────────────────────────────────────
const svg = (children: ReactNode) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);
const PencilIcon = () => svg(<><path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z" /><path d="m13.5 7.5 3 3" /></>);
const ArchiveIcon = () => svg(<><rect x="3.5" y="4" width="17" height="4.5" rx="1" /><path d="M5 8.5V19a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8.5" /><path d="M10 12.5h4" /></>);
const TrashIcon = () => svg(<><path d="M4 7h16" /><path d="M9 7V4.5h6V7" /><path d="M6 7l1 12.2a1.8 1.8 0 0 0 1.8 1.6h6.4a1.8 1.8 0 0 0 1.8-1.6L18 7" /><path d="M10 11v6M14 11v6" /></>);
const RestoreIcon = () => svg(<><path d="M4 12a8 8 0 1 0 2.4-5.7" /><path d="M4 4v4.5h4.5" /></>);

// `unavailable`: looks muted but stays clickable (and focusable) so it can explain WHY it is not available now
function ActionButton({ label, onClick, unavailable, danger, children }: { label: string; onClick: () => void; unavailable?: boolean; danger?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-disabled={unavailable || undefined}
      className={`flex h-10 w-10 items-center justify-center rounded-xl transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7c5cf0] ${
        unavailable ? "text-black/30 hover:bg-black/5" : danger ? "text-rose-500 hover:bg-rose-50 hover:text-rose-700" : "text-[#4d5278] hover:bg-[#f1eeff] hover:text-[#5b4bd0]"
      }`}
    >
      {children}
    </button>
  );
}

function Thumb({ item, className }: { item: AuthoredContent; className: string }) {
  return (
    <span className={`flex shrink-0 items-center justify-center overflow-hidden bg-gradient-to-br from-[#d6e0ff] via-[#e2d9ff] to-[#cfc3ff] text-white ${className}`}>
      {item.coverUrl ? <img src={coverUrlForFrame(item.coverUrl, item.coverFocus, "square")} alt="" loading="lazy" style={coverImageStyle(item.coverFocus, "square")} className="h-full w-full object-cover" /> : <Icon name={typeIcon[item.type]} size={22} />}
    </span>
  );
}

// Real numbers whatever the status: people keep access to an archived or taken-down material, so its participants,
// income and rating still count. "—" only where there is nothing yet.
function metrics(item: AuthoredContent) {
  return {
    participants: item.participants > 0 ? item.participants.toLocaleString("uk-UA") : "—",
    revenue: item.revenue > 0 ? `${item.revenue.toLocaleString("uk-UA")} ₴` : "—",
    rating: item.rating ? `${item.rating} ★` : "—",
  };
}

type Confirm = { kind: "archive" | "restore" | "delete"; item: AuthoredContent } | { kind: "blocked"; item: AuthoredContent; until: Date | null; openRefunds: number } | null;

export default function AuthorContentList({ content, onCreate, onEdit, onChangeStatus, onDeleteDraft, loading = false, loadFailed = false, onRetry }: Props) {
  const [typeFilter, setTypeFilter] = useState<"all" | ContentType>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | ContentStatus>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("default");
  const [confirm, setConfirm] = useState<Confirm>(null);
  // Four at a time; «Показати ще» adds four more. Starts over whenever the list is filtered or sorted differently.
  const [shown, setShown] = useState(PAGE);
  useEffect(() => setShown(PAGE), [typeFilter, statusFilter, search, sort]);

  const filtered = useMemo(
    () => sortContent(filterContent(content, { type: typeFilter, status: statusFilter, search }), sort),
    [content, typeFilter, statusFilter, search, sort],
  );

  const filtersActive = typeFilter !== "all" || statusFilter !== "all" || search.trim() !== "";
  const resetFilters = () => {
    setTypeFilter("all");
    setStatusFilter("all");
    setSearch("");
  };

  // Date of the last completed purchase of each material (one query for the list). If it cannot be read, nothing is
  // blocked here: the database applies the same 14-day rule and its refusal is shown in the dialog.
  const [blockers, setBlockers] = useState<ArchiveBlockers>(new Map());
  const idsKey = content.map((c) => c.id).sort().join(",");
  useEffect(() => {
    let off = false;
    fetchArchiveBlockers(idsKey ? idsKey.split(",") : [])
      .then((m) => !off && setBlockers(m))
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [idsKey]);

  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const closeConfirm = () => {
    setConfirm(null);
    setActionError(null);
  };
  const applyArchiveToggle = async (item: AuthoredContent) => {
    setBusy(true);
    setActionError(null);
    try {
      if (confirm?.kind === "delete") {
        if (!onDeleteDraft) throw new Error("Видалення недоступне.");
        await onDeleteDraft(item);
      } else {
        await onChangeStatus(item, toggleArchive(item).status);
      }
      closeConfirm();
    } catch (e) {
      setActionError(e instanceof Error && e.message ? e.message : "Не вдалося зберегти зміну. Спробуйте ще раз.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* HEADER */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[32px] font-bold leading-tight text-[#12172b]">Контент</h1>
          <p className="mt-1 text-[15px] text-black/55">Усі ваші програми, медитації та гайди в одному місці.</p>
        </div>
        <CreateMenu onCreate={onCreate} />
      </div>

      {/* SEARCH + TYPE */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative block w-full min-[560px]:w-auto">
          <span className="sr-only">Пошук за назвою</span>
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-black/40"><Icon name="search" size={17} /></span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Пошук за назвою"
            className="min-h-[46px] w-full rounded-2xl bg-white pl-10 pr-4 text-[14px] shadow-[0_6px_18px_-12px_rgba(60,60,140,0.35)] ring-1 ring-[#ebe8ff] placeholder:text-black/40 focus:outline-none focus:ring-2 focus:ring-[#7c5cf0] min-[560px]:w-[260px]"
          />
        </label>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Тип матеріалу">
          {(["all", "program", "meditation", "guide"] as const).map((t) => (
            <Chip key={t} active={typeFilter === t} onClick={() => setTypeFilter(t)} icon={t === "all" ? undefined : typeIcon[t]}>
              {t === "all" ? "Усі типи" : typeFilterLabel[t]}
            </Chip>
          ))}
        </div>
      </div>

      {/* STATUS + SORT */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Статус публікації">
          {(["all", "published", "draft", "review", "archived"] as const).map((s) => (
            <Chip key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>
              {s === "all" ? "Усі статуси" : statusLabel[s]}
            </Chip>
          ))}
        </div>
        <CatalogSort<SortKey> value={sort} onChange={setSort} options={SORTS} variant="light" className="" />
      </div>

      {statusFilter === "archived" && (
        <p className="-mt-2 text-[13px] leading-relaxed text-black/60">
          В архіві матеріали зберігаються назавжди: видалити їх не можна. Ті, хто вже отримав доступ, його не втрачають. Відновлений матеріал повертається зі статусом «Знято з публікації»: його можна редагувати й опублікувати знову, але не можна видалити.
        </p>
      )}

      {/* LIST */}
      <div className="rounded-[26px] bg-white shadow-[0_10px_30px_-14px_rgba(60,60,140,0.28)] ring-1 ring-[#ebe8ff]">
        {loading && content.length > 0 && !loadFailed && (
          <div role="status" className="flex items-center gap-2 border-b border-black/5 px-6 py-3 text-[13px] text-black/60">
            <span aria-hidden="true" className="h-3 w-3 animate-spin rounded-full border-2 border-[#cfc3ff] border-t-[#7c5cf0]" />
            Завантажуємо ваші матеріали…
          </div>
        )}

        {loadFailed && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-100 bg-amber-50 px-6 py-4 text-[14px] text-amber-800">
            <span>Не вдалося завантажити ваші матеріали з бази. Нижче лише те, що вже відомо.</span>
            {onRetry && (
              <button type="button" onClick={onRetry} className="min-h-[40px] rounded-xl bg-white px-4 font-semibold text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7c5cf0]">
                Спробувати ще раз
              </button>
            )}
          </div>
        )}

        {/* header row (desktop) */}
        {filtered.length > 0 && (
          <div aria-hidden="true" className="hidden grid-cols-[minmax(0,2.4fr)_150px_96px_120px_88px_172px] items-center gap-4 border-b border-black/5 px-6 py-3.5 text-[13px] font-medium text-black/55 min-[1400px]:grid">
            <span>Контент</span><span>Статус</span><span>Учасники</span><span>Дохід</span><span>Рейтинг</span><span className="text-right">Дії</span>
          </div>
        )}

        {loading && content.length === 0 ? (
          <ul aria-busy="true" aria-label="Завантаження">
            {[0, 1, 2].map((i) => (
              <li key={i} className="flex items-center gap-4 border-b border-black/5 px-6 py-5 last:border-0">
                <span className="h-14 w-[72px] animate-pulse rounded-2xl bg-[#e7e3fb]" />
                <span className="h-4 w-1/2 animate-pulse rounded bg-black/5" />
              </li>
            ))}
          </ul>
        ) : content.length === 0 ? (
          <EmptyState
            title="Тут поки порожньо"
            text="Створіть першу програму, медитацію чи гайд, і вони з'являться в цьому списку."
            action={<CreateMenu onCreate={onCreate} />}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="Нічого не знайдено"
            text={search.trim() ? `За запитом «${search.trim()}» нічого немає з обраними фільтрами.` : "З обраними фільтрами матеріалів немає."}
            action={
              filtersActive ? (
                <button type="button" onClick={resetFilters} className="min-h-[44px] rounded-xl bg-[#f1eeff] px-5 text-[14px] font-semibold text-[#5b4bd0] hover:bg-[#e7e1ff] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7c5cf0]">
                  Скинути фільтри
                </button>
              ) : undefined
            }
          />
        ) : (
          <ul>
            {filtered.slice(0, shown).map((item) => {
              const m = metrics(item);
              const archived = item.status === "archived";
              const b = blockers.get(item.id);
              const until = archived ? null : archiveBlockedUntil(b?.lastPurchase);
              const openRefunds = archived ? 0 : b?.openRefunds ?? 0;
              const blocked = !!until || openRefunds > 0;
              const actions = (
                <div className="flex items-center justify-end gap-0.5">
                  {!archived && <ActionButton label="Редагувати" onClick={() => onEdit(item.id)}><PencilIcon /></ActionButton>}
                  {onDeleteDraft && canDeleteDraft(item) && (
                    <ActionButton label="Видалити чернетку назавжди" danger onClick={() => setConfirm({ kind: "delete", item })}><TrashIcon /></ActionButton>
                  )}
                  {archived ? (
                    <ActionButton label="Відновити (знято з публікації)" onClick={() => setConfirm({ kind: "restore", item })}><RestoreIcon /></ActionButton>
                  ) : (
                    <ActionButton
                      label={openRefunds > 0 ? "Є відкритий запит на повернення коштів" : until ? archiveBlockedLabel(until) : "Архівувати"}
                      unavailable={blocked}
                      onClick={() => setConfirm(blocked ? { kind: "blocked", item, until, openRefunds } : { kind: "archive", item })}
                    >
                      <ArchiveIcon />
                    </ActionButton>
                  )}
                </div>
              );
              const title = (
                <span className="flex min-w-0 items-center gap-3.5">
                  <Thumb item={item} className="h-14 w-[72px] rounded-2xl" />
                  <span className="min-w-0">
                    <span className="line-clamp-2 block text-[15px] font-semibold leading-snug text-[#12172b]" title={item.title}>{item.title}</span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-[13px] text-black/55">
                      <Icon name={typeIcon[item.type]} size={14} /> {typeLabel[item.type]}
                    </span>
                  </span>
                </span>
              );
              const status = (
                <span>
                  <span className={`inline-block whitespace-nowrap rounded-full px-3 py-1 text-[12px] font-semibold ring-1 ${wasLive(item) ? WAS_LIVE_STYLE : statusStyle[item.status]}`}>{wasLive(item) ? WAS_LIVE_LABEL : statusLabel[item.status]}</span>
                  {item.saleStatus === "complaint_pending" && <span className="mt-1 block text-[11px] text-amber-700">Знято з продажу після скарги</span>}
                  {item.saleStatus === "unlisted" && <span className="mt-1 block text-[11px] text-rose-700">Знято з продажу</span>}
                </span>
              );
              return (
                <li key={item.id} className="border-b border-black/5 last:border-0">
                  {/* desktop: table row */}
                  <div className="hidden grid-cols-[minmax(0,2.4fr)_150px_96px_120px_88px_172px] items-center gap-4 px-6 py-3.5 transition hover:bg-[#faf9ff] min-[1400px]:grid">
                    {title}
                    {status}
                    <span className="text-[14px] text-[#1d2240]">{m.participants}</span>
                    <span className="text-[14px] text-[#1d2240]">{m.revenue}</span>
                    <span className="text-[14px] text-[#1d2240]">{m.rating}</span>
                    {actions}
                  </div>
                  {/* tablet / mobile: compact item */}
                  <div className="flex flex-col gap-3 px-4 py-4 sm:px-6 min-[1400px]:hidden">
                    <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                      <div className="min-w-0">{title}</div>
                      <div className="shrink-0">{status}</div>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
                      <dl className="flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-black/60">
                        <div className="flex gap-1.5"><dt>Учасники:</dt><dd className="font-medium text-[#1d2240]">{m.participants}</dd></div>
                        <div className="flex gap-1.5"><dt>Дохід:</dt><dd className="font-medium text-[#1d2240]">{m.revenue}</dd></div>
                        <div className="flex gap-1.5"><dt>Рейтинг:</dt><dd className="font-medium text-[#1d2240]">{m.rating}</dd></div>
                      </dl>
                      {actions}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {filtered.length > shown && (
          <div className="border-t border-[#eceef7] px-5 py-3 sm:px-6">
            <button
              type="button"
              onClick={() => setShown((n) => n + PAGE)}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[#f1eeff] px-5 text-[14px] font-semibold text-[#5b4bd0] transition hover:bg-[#e7e1ff] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7c5cf0]"
            >
              Показати ще ({Math.min(PAGE, filtered.length - shown)}) <span aria-hidden="true">↓</span>
            </button>
          </div>
        )}
      </div>

      {confirm && confirm.kind === "blocked" && (
        <ConfirmDialog
          title="Поки що не можна архівувати"
          text={
            confirm.openRefunds > 0
              ? `Покупець «${confirm.item.title}» подав запит на повернення коштів, і команда Sensoria його ще розглядає. Архівувати матеріал можна, коли запит буде розглянуто${confirm.until ? ` і мине ${ARCHIVE_COOLDOWN_DAYS} днів після останньої покупки (з ${formatDayMonth(confirm.until)})` : ""}.`
              : `«${confirm.item.title}» нещодавно купили. Архівувати його можна не раніше ніж через ${ARCHIVE_COOLDOWN_DAYS} днів після останньої покупки: стільки діє право покупця на повернення коштів. Архівувати можна з ${confirm.until ? formatDayMonth(confirm.until) : "—"}.`
          }
          points={["Матеріал лишається в каталозі й доступним для покупців.", "Редагувати його можна в будь-який час.", "Видалити матеріал не можна."]}
          confirmLabel="Зрозуміло"
          hideCancel
          onCancel={closeConfirm}
          onConfirm={closeConfirm}
        />
      )}
      {confirm && confirm.kind !== "blocked" && (
        <ConfirmDialog
          title={confirm.kind === "delete" ? "Видалити чернетку назавжди?" : confirm.kind === "archive" ? "Архівувати матеріал?" : "Відновити матеріал?"}
          danger={confirm.kind === "delete"}
          text={
            confirm.kind === "delete"
              ? `«${confirm.item.title}» буде видалено без можливості відновлення.`
              : confirm.kind === "archive"
              ? `«${confirm.item.title}» зникне з каталогу, нових покупок не буде.`
              : `«${confirm.item.title}» повернеться у ваш список зі статусом «Знято з публікації». Перегляньте його й опублікуйте знову, коли будете готові. Видалити такий матеріал буде не можна.`
          }
          points={
            confirm.kind === "delete"
              ? [
                  "Усе, що ви ввели (текст, модулі, уроки, обкладинка), зникне безповоротно.",
                  "Скасувати видалення або відновити чернетку буде неможливо.",
                  "Це можна зробити лише тому, що матеріал ніколи не публікувався й ніхто його не купував.",
                ]
              : confirm.kind === "archive"
              ? [
                  confirm.item.status === "published" && confirm.item.participants > 0
                    ? `${confirm.item.participants.toLocaleString("uk-UA")} ${pluralUk(confirm.item.participants, "учасник", "учасники", "учасників")} збережуть доступ.`
                    : "Ті, хто вже отримав доступ, збережуть його.",
                  "Матеріал не видаляється: він лишається в розділі «В архіві».",
                  "Відновити його можна будь-коли.",
                ]
              : ["Дані та файли матеріалу збережено без змін.", "Публікація знову пройде звичайні перевірки."]
          }
          confirmLabel={confirm.kind === "delete" ? "Видалити назавжди" : confirm.kind === "archive" ? "Архівувати" : "Відновити"}
          busy={busy}
          error={actionError}
          onCancel={closeConfirm}
          onConfirm={() => void applyArchiveToggle(confirm.item)}
        />
      )}
    </div>
  );
}

function Chip({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon?: IconName; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex min-h-[40px] items-center gap-2 rounded-2xl px-3.5 text-[13px] font-semibold transition focus:outline-none sm:min-h-[44px] sm:px-4 sm:text-[14px] focus-visible:ring-2 focus-visible:ring-[#7c5cf0] ${
        active ? "bg-[#eef0fd] text-[#4338ca] ring-1 ring-[#4338ca]/35" : "bg-white text-[#1d2240] shadow-[0_6px_18px_-12px_rgba(60,60,140,0.35)] ring-1 ring-[#ebe8ff] hover:bg-[#faf9ff]"
      }`}
    >
      {icon && <span className={active ? "text-[#4338ca]" : "text-[#6d5bd0]"}><Icon name={icon} size={16} /></span>}
      {children}
    </button>
  );
}

function EmptyState({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f1eeff] text-[#7a68e0]"><Icon name="library" size={24} /></span>
      <div className="text-[17px] font-semibold text-[#12172b]">{title}</div>
      <p className="max-w-[420px] text-[14px] text-black/60">{text}</p>
      {action}
    </div>
  );
}

// "+ Створити" with the three existing creation flows (the editor opens with that type preselected)
function CreateMenu({ onCreate }: { onCreate: (type?: ContentType) => void }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const items = () => Array.from(wrapRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
    items()[0]?.focus();
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const list = items();
        const at = list.indexOf(document.activeElement as HTMLButtonElement);
        list[(at + (e.key === "ArrowDown" ? 1 : -1) + list.length) % list.length]?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={wrapRef}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex min-h-[52px] items-center gap-3 rounded-2xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] px-6 text-[15px] font-semibold text-white shadow-[0_10px_24px_-10px_rgba(91,92,240,0.75)] transition hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7c5cf0] focus-visible:ring-offset-2"
      >
        <span aria-hidden="true" className="text-[22px] leading-none">+</span> Створити
        <span aria-hidden="true" className={`transition-transform ${open ? "rotate-180" : ""}`}><Icon name="chevron" size={16} /></span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-20 mt-2 w-[250px] overflow-hidden rounded-2xl bg-white p-1.5 shadow-[0_18px_40px_-12px_rgba(30,41,90,0.35)] ring-1 ring-[#ebe8ff]">
          {(["program", "meditation", "guide"] as ContentType[]).map((t) => (
            <button
              key={t}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onCreate(t);
              }}
              className="flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 text-left text-[14px] font-medium text-[#12172b] transition hover:bg-[#f1eeff] focus:bg-[#f1eeff] focus:outline-none"
            >
              <span className="text-[#6d5bd0]"><Icon name={typeIcon[t]} size={18} /></span>
              Створити {t === "program" ? "програму" : t === "meditation" ? "медитацію" : "гайд"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ConfirmDialog({ title, text, points, confirmLabel, hideCancel, danger, busy, error, onCancel, onConfirm }: { danger?: boolean; title: string; text: string; points?: string[]; confirmLabel: string; hideCancel?: boolean; busy?: boolean; error?: string | null; onCancel: () => void; onConfirm: () => void }) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f1535]/50 p-4" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div role="dialog" aria-modal="true" aria-labelledby="confirm-title" className="w-full max-w-[420px] rounded-3xl bg-white p-6 shadow-[0_30px_60px_-20px_rgba(15,21,53,0.6)]">
        <h2 id="confirm-title" className="text-[19px] font-bold text-[#12172b]">{title}</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-black/65">{text}</p>
        {points && points.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1.5 rounded-2xl bg-[#f6f4ff] p-4 text-[13px] leading-snug text-[#3b3f66]">
            {points.map((p) => (
              <li key={p} className="flex gap-2"><span aria-hidden="true" className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#7c5cf0]" />{p}</li>
            ))}
          </ul>
        )}
        {error && <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3.5 py-2.5 text-[13px] leading-snug text-rose-700">{error}</p>}
        <div className="mt-6 flex justify-end gap-2.5">
          {!hideCancel && (
            <button type="button" onClick={onCancel} disabled={busy} className="min-h-[44px] rounded-xl px-5 text-[14px] font-semibold text-[#3b3f66] ring-1 ring-black/10 hover:bg-black/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7c5cf0] disabled:opacity-50">
              Скасувати
            </button>
          )}
          <button ref={confirmRef} type="button" onClick={onConfirm} disabled={busy} className={`min-h-[44px] rounded-xl px-5 text-[14px] font-semibold text-white hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7c5cf0] focus-visible:ring-offset-2 disabled:opacity-60 ${danger ? "bg-rose-600" : "bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0]"}`}>
            {busy ? "Зачекайте…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
