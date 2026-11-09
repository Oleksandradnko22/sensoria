import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon, type IconName } from "../ui/Icon";
import { fetchPlatformAnalytics, type ContentKind, type PlatformAnalytics } from "../../lib/admin";
import {
  PERIOD_OPTIONS,
  bucketCountFor,
  bucketSeries,
  chartFrom,
  deltaPercent,
  distribution,
  maskEmail,
  type PeriodDays,
} from "../../utils/adminAnalytics";
import { formatAbsoluteDate } from "../../utils/relativeTime";
import { getInitials } from "../../lib/auth";
import AdminSelect from "./AdminSelect";

export type AttentionItem = { key: string; label: string; count: number; onOpen: () => void };

type Props = {
  /** "Переглянути всіх" for participants → the existing users tab. */
  onOpenUsers: () => void;
  /** Open work items the admin has to handle (from data the page already loaded). */
  attention?: AttentionItem[];
  /** Opens the Модерація tab (used for the chat-bans item). */
  onOpenModeration?: () => void;
};

const KIND_LABEL: Record<ContentKind, string> = {
  program: "Програми",
  guide: "Гайди",
  meditation: "Медитації",
};
const KIND_SINGULAR: Record<ContentKind, string> = {
  program: "Програма",
  guide: "Гайд",
  meditation: "Медитація",
};
const KIND_ICON: Record<ContentKind, IconName> = {
  program: "program",
  guide: "guide",
  meditation: "meditation",
};
const KIND_ORDER: readonly ContentKind[] = ["program", "guide", "meditation"];
const KIND_COLOR: Record<ContentKind, string> = {
  program: "#7c5cf0",
  guide: "#2563eb",
  meditation: "#0d9488",
};

const SERIES_COLOR = { registrations: "#7c5cf0", content: "#0d9488" } as const;

const card = "rounded-2xl bg-white border border-black/5";

function Delta({ value }: { value: number | null }) {
  if (value == null) return null;
  const up = value > 0;
  const flat = value === 0;
  return (
    <span
      className={`text-[12px] font-medium ${
        flat ? "text-black/60" : up ? "text-emerald-700" : "text-red-600"
      }`}
    >
      {flat ? "без змін" : `${up ? "+" : "−"}${Math.abs(value)}%`}
      <span className="text-black/60 font-normal"> до попер. періоду</span>
    </span>
  );
}

function PeriodSelect({ value, onChange }: { value: PeriodDays; onChange: (d: PeriodDays) => void }) {
  return (
    <AdminSelect
      value={value}
      options={PERIOD_OPTIONS.map((p) => ({ value: p.days, label: p.label }))}
      onChange={onChange}
      label="Період"
      align="right"
    />
  );
}

function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-xl bg-black/[0.06] ${className}`} aria-hidden />;
}

export default function AdminAnalytics({ onOpenUsers, attention = [], onOpenModeration }: Props) {
  const [days, setDays] = useState<PeriodDays>(30);
  const [data, setData] = useState<PlatformAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const reqId = useRef(0);

  const load = useCallback((d: PeriodDays) => {
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    fetchPlatformAnalytics(d)
      .then((res) => {
        if (id === reqId.current) setData(res);
      })
      .catch((e) => {
        if (id !== reqId.current) return;
        const msg = e instanceof Error ? e.message : "Не вдалося завантажити.";
        setError(
          /Невідома дія/.test(msg)
            ? "Функція admin-data у Supabase застаріла — розгорніть оновлену версію (дія «analytics»)."
            : msg
        );
      })
      .finally(() => {
        if (id === reqId.current) setLoading(false);
      });
  }, []);

  useEffect(() => {
    load(days);
  }, [days, load]);

  const periodLabel = PERIOD_OPTIONS.find((p) => p.days === days)?.short ?? "";
  const first = data == null; // nothing yet → skeletons; otherwise keep stale data while refetching

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">Аналітика платформи</h1>
          <p className="text-black/60 text-[14px] mt-1">
            Загальна статистика, ключові показники та активність на Sensoria.
          </p>
        </div>
        <PeriodSelect value={days} onChange={setDays} />
      </div>

      {error && (
        <div
          role="alert"
          className="mb-5 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-[14px] text-red-700 flex flex-wrap items-center justify-between gap-3"
        >
          <span>{error}</span>
          <button
            onClick={() => load(days)}
            className="min-h-[44px] px-4 rounded-lg bg-white border border-red-200 font-medium hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
          >
            Спробувати ще раз
          </button>
        </div>
      )}

      <div
        className={`flex flex-col gap-5 transition-opacity ${loading && !first ? "opacity-60" : ""}`}
        aria-busy={loading}
      >
        <Attention
          items={[
            ...attention,
            ...(data?.totals.chatBanned
              ? [{ key: "chat", label: "Заблоковано чатів", count: data.totals.chatBanned, onOpen: onOpenModeration ?? (() => {}) }]
              : []),
          ]}
        />
        <Kpis data={data} periodLabel={periodLabel} days={days} />
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
          <ActivityChart data={data} days={days} periodLabel={periodLabel} />
          <ContentDistribution data={data} />
        </div>
        <div className="grid gap-5 xl:grid-cols-2">
          <RecentParticipants data={data} onOpenUsers={onOpenUsers} />
          <RecentContent data={data} />
        </div>
      </div>
    </div>
  );
}

// ── Needs attention ────────────────────────────────────────────────

function Attention({ items }: { items: AttentionItem[] }) {
  const open = items.filter((i) => i.count > 0);
  return (
    <section aria-label="Потребує уваги" className={`${card} p-4`}>
      <h2 className="text-[16px] font-semibold mb-2">Потребує уваги</h2>
      {open.length === 0 ? (
        <p className="text-[14px] text-emerald-700">Усе опрацьовано: відкритих звернень, скарг і повернень немає.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {open.map((i) => (
            <li key={i.key}>
              <button
                onClick={i.onOpen}
                className="min-h-[44px] inline-flex items-center gap-2 px-3.5 rounded-xl bg-amber-50 text-amber-900 text-[14px] font-medium hover:bg-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
              >
                <span className="tabular-nums font-bold">{i.count}</span>
                {i.label}
                <span aria-hidden>→</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── KPI ────────────────────────────────────────────────────────────

function Kpis({
  data,
  periodLabel,
  days,
}: {
  data: PlatformAnalytics | null;
  periodLabel: string;
  days: PeriodDays;
}) {
  const t = data?.totals;
  const p = data?.period;
  const cards: {
    label: string;
    icon: IconName;
    tint: string;
    value: number | null | undefined;
    caption: string;
    delta?: number | null;
  }[] = [
    { label: "Авторів", icon: "idcard", tint: "bg-blue-50 text-blue-600", value: t?.authors, caption: "Усього" },
    {
      label: "Учасників",
      icon: "heart",
      tint: "bg-violet-50 text-violet-600",
      value: t?.participants,
      caption: p ? `+${p.newParticipants} за ${periodLabel}` : "Усього",
      delta: p ? deltaPercent(p.newParticipants, p.prevNewParticipants) : null,
    },
    { label: "Опубліковано контенту", icon: "program", tint: "bg-emerald-50 text-emerald-700", value: t?.published, caption: "Зараз на платформі" },
    { label: "Чернетки", icon: "note", tint: "bg-slate-100 text-slate-600", value: t?.drafts, caption: "Зараз" },
    { label: "На модерації", icon: "shield", tint: "bg-amber-50 text-amber-700", value: t?.review, caption: "Контент очікує перевірки" },
    {
      label: `BLOCK за ${periodLabel}`,
      icon: "lock",
      tint: "bg-red-50 text-red-600",
      value: p?.block,
      caption: "Заблоковані повідомлення",
      delta: p ? deltaPercent(p.block, p.prevBlock) : null,
    },
    {
      label: `WARN за ${periodLabel}`,
      icon: "warning",
      tint: "bg-orange-50 text-orange-700",
      value: p?.warn,
      caption: "Попередження",
      delta: p ? deltaPercent(p.warn, p.prevWarn) : null,
    },
  ];
  void days;

  return (
    <section aria-label="Ключові показники" className="grid gap-3 grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className={`${card} p-4 flex items-start gap-3 min-w-0`}>
          <span className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${c.tint}`}>
            <Icon name={c.icon} size={20} />
          </span>
          <div className="min-w-0">
            <div className="text-[14px] text-black/70">{c.label}</div>
            {c.value == null ? (
              <Skeleton className="h-8 w-14 mt-1" />
            ) : (
              <div className="text-[30px] leading-tight font-bold tabular-nums">{c.value}</div>
            )}
            <div className="text-[12px] text-black/60">{c.value == null ? " " : c.caption}</div>
            {c.delta !== undefined && <Delta value={c.delta} />}
          </div>
        </div>
      ))}
    </section>
  );
}

// ── Activity chart ─────────────────────────────────────────────────

function niceMax(v: number): number {
  if (v <= 4) return 4;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

function ActivityChart({
  data,
  days,
  periodLabel,
}: {
  data: PlatformAnalytics | null;
  days: PeriodDays;
  periodLabel: string;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const model = useMemo(() => {
    if (!data) return null;
    const now = Date.parse(data.generatedAt);
    const all = [...data.series.registrations, ...data.series.content];
    const from = chartFrom(days, now, all);
    const n = bucketCountFor(days);
    const reg = bucketSeries(data.series.registrations, from, now, n);
    const con = bucketSeries(data.series.content, from, now, n);
    const max = niceMax(Math.max(0, ...reg.map((b) => b.count), ...con.map((b) => b.count)));
    const total = data.series.registrations.length + data.series.content.length;
    return { reg, con, max, total, from, now };
  }, [data, days]);

  const W = 640;
  const H = 240;
  const pad = { l: 36, r: 12, t: 12, b: 28 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;

  const fmt = (ms: number) =>
    new Date(ms).toLocaleDateString("uk-UA", { day: "numeric", month: "short" });

  return (
    <section className={`${card} p-5 min-w-0`} aria-label="Активність на платформі">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <h2 className="text-[18px] font-semibold">Активність: {periodLabel}</h2>
        <ul className="flex items-center gap-4 text-[13px] text-black/70">
          <li className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 rounded" style={{ background: SERIES_COLOR.registrations }} />
            Нові учасники
          </li>
          <li className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 rounded border-t-2 border-dashed" style={{ borderColor: SERIES_COLOR.content }} />
            Створено контенту
          </li>
        </ul>
      </div>
      <p className="text-[13px] text-black/60 mb-3">
        Кількість нових записів за проміжок часу. «Створено» — дата створення, не публікації.
      </p>

      {!model ? (
        <Skeleton className="h-[240px] w-full" />
      ) : model.total === 0 ? (
        <div className="h-[240px] flex items-center justify-center text-center text-[14px] text-black/60 rounded-xl bg-black/[0.02]">
          За цей період нових учасників і контенту немає.
        </div>
      ) : (
        <div className="relative">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="w-full h-auto"
            role="img"
            aria-label={`Нові учасники: ${data!.series.registrations.length}, створено контенту: ${data!.series.content.length} за ${periodLabel}`}
            onMouseLeave={() => setHover(null)}
          >
            {[0, 0.5, 1].map((f) => {
              const y = pad.t + ih - f * ih;
              return (
                <g key={f}>
                  <line x1={pad.l} x2={W - pad.r} y1={y} y2={y} stroke="#000" strokeOpacity={0.08} />
                  <text x={pad.l - 6} y={y + 4} textAnchor="end" fontSize={12} fill="#000" fillOpacity={0.6}>
                    {Math.round(f * model.max)}
                  </text>
                </g>
              );
            })}
            {([
              ["reg", model.reg, SERIES_COLOR.registrations, undefined],
              ["con", model.con, SERIES_COLOR.content, "5 4"],
            ] as const).map(([key, series, color, dash]) => {
              const pts = series.map((b, i) => {
                const x = pad.l + (series.length === 1 ? iw / 2 : (i / (series.length - 1)) * iw);
                const y = pad.t + ih - (b.count / model.max) * ih;
                return [x, y] as const;
              });
              return (
                <g key={key}>
                  <polyline
                    points={pts.map((p) => p.join(",")).join(" ")}
                    fill="none"
                    stroke={color}
                    strokeWidth={2}
                    strokeDasharray={dash}
                    strokeLinejoin="round"
                  />
                  {hover != null && <circle cx={pts[hover][0]} cy={pts[hover][1]} r={4} fill={color} />}
                </g>
              );
            })}
            {[0, Math.floor((model.reg.length - 1) / 2), model.reg.length - 1].map((i, k) => {
              const x = pad.l + (model.reg.length === 1 ? iw / 2 : (i / (model.reg.length - 1)) * iw);
              return (
                <text
                  key={k}
                  x={x}
                  y={H - 8}
                  textAnchor={k === 0 ? "start" : k === 2 ? "end" : "middle"}
                  fontSize={12}
                  fill="#000"
                  fillOpacity={0.6}
                >
                  {fmt(model.reg[i].start)}
                </text>
              );
            })}
            {model.reg.map((_b, i) => {
              const w = iw / model.reg.length;
              const x = pad.l + (model.reg.length === 1 ? 0 : (i / (model.reg.length - 1)) * iw) - w / 2;
              return (
                <rect
                  key={i}
                  x={Math.max(pad.l, x)}
                  y={pad.t}
                  width={w}
                  height={ih}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                  onTouchStart={() => setHover(i)}
                />
              );
            })}
          </svg>
          {hover != null && (
            <div
              className="pointer-events-none absolute top-2 right-2 rounded-lg bg-white border border-black/10 shadow-sm px-3 py-2 text-[13px]"
              role="status"
            >
              <div className="font-medium">
                {fmt(model.reg[hover].start)}
                {days !== 7 && days !== 30 ? ` – ${fmt(model.reg[hover].end)}` : ""}
              </div>
              <div style={{ color: SERIES_COLOR.registrations }}>Нові учасники: {model.reg[hover].count}</div>
              <div style={{ color: SERIES_COLOR.content }}>Створено контенту: {model.con[hover].count}</div>
            </div>
          )}
          <div className="sr-only">
          <table>
            <caption>Активність за проміжками часу</caption>
            <thead>
              <tr>
                <th>Початок</th>
                <th>Нові учасники</th>
                <th>Створено контенту</th>
              </tr>
            </thead>
            <tbody>
              {model.reg.map((b, i) => (
                <tr key={i}>
                  <td>{fmt(b.start)}</td>
                  <td>{b.count}</td>
                  <td>{model.con[i].count}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          {(data!.series.registrationsTruncated || data!.series.contentTruncated) && (
            <p className="text-[12px] text-amber-700 mt-2">
              Показано не більше 5000 останніх записів — старіші в графік не потрапили.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

// ── Content distribution ───────────────────────────────────────────

function ContentDistribution({ data }: { data: PlatformAnalytics | null }) {
  const dist = data ? distribution(data.totals.publishedByKind, KIND_ORDER) : null;
  const R = 52;
  const C = 2 * Math.PI * R;

  let offset = 0;
  return (
    <section className={`${card} p-5 min-w-0`} aria-label="Розподіл контенту">
      <h2 className="text-[18px] font-semibold">Розподіл контенту</h2>
      <p className="text-[13px] text-black/60 mb-4">Опубліковане зараз; від періоду не залежить.</p>
      {!dist ? (
        <Skeleton className="h-[150px] w-full" />
      ) : (
        <div className="flex flex-wrap items-center gap-6">
          <svg viewBox="0 0 140 140" className="w-[140px] h-[140px] shrink-0" role="img" aria-label={`Усього опубліковано: ${dist.total}`}>
            <circle cx={70} cy={70} r={R} fill="none" stroke="#000" strokeOpacity={0.07} strokeWidth={18} />
            {dist.total > 0 &&
              dist.rows.map((r) => {
                const len = (r.count / dist.total) * C;
                const el =
                  r.count > 0 ? (
                    <circle
                      key={r.key}
                      cx={70}
                      cy={70}
                      r={R}
                      fill="none"
                      stroke={KIND_COLOR[r.key]}
                      strokeWidth={18}
                      strokeDasharray={`${len} ${C - len}`}
                      strokeDashoffset={-offset}
                      transform="rotate(-90 70 70)"
                    />
                  ) : null;
                offset += len;
                return el;
              })}
            <text x={70} y={72} textAnchor="middle" fontSize={24} fontWeight={700} fill="#000">
              {dist.total}
            </text>
            <text x={70} y={90} textAnchor="middle" fontSize={12} fill="#000" fillOpacity={0.6}>
              усього
            </text>
          </svg>
          <ul className="flex-1 min-w-[160px] flex flex-col gap-2.5 text-[14px]">
            {dist.rows.map((r) => (
              <li key={r.key} className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0" style={{ background: KIND_COLOR[r.key] }}>
                  <Icon name={KIND_ICON[r.key]} size={15} />
                </span>
                <span className="flex-1">{KIND_LABEL[r.key]}</span>
                <span className="font-semibold tabular-nums">{r.count}</span>
                <span className="text-black/60 tabular-nums w-[48px] text-right">
                  {dist.total > 0 ? `${r.percent}%` : "—"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {dist && dist.total === 0 && (
        <p className="text-[13px] text-black/60 mt-3">Опублікованого контенту ще немає.</p>
      )}
    </section>
  );
}

// ── Recent participants ────────────────────────────────────────────

function RecentParticipants({
  data,
  onOpenUsers,
}: {
  data: PlatformAnalytics | null;
  onOpenUsers: () => void;
}) {
  const rows = data?.recentParticipants;
  return (
    <section className={`${card} p-5 min-w-0`} aria-label="Останні зареєстровані учасники">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-[18px] font-semibold">Останні зареєстровані учасники</h2>
        <button
          onClick={onOpenUsers}
          className="min-h-[44px] px-2 -mr-2 text-[14px] font-medium text-[#2563eb] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] rounded-lg"
        >
          Переглянути всіх →
        </button>
      </div>
      {!rows ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-[14px] text-black/60">Учасників ще немає.</p>
      ) : (
        <ul className="divide-y divide-black/5">
          {rows.map((u) => (
            <li key={u.id} className="py-3 flex items-center gap-3 min-w-0">
              <span className="w-9 h-9 rounded-full bg-violet-100 text-violet-700 text-[13px] font-semibold flex items-center justify-center shrink-0">
                {getInitials(u.name)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-medium truncate">{u.name}</div>
                <div className="text-[13px] text-black/60 truncate">{maskEmail(u.email)}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[13px] text-black/70">{formatAbsoluteDate(u.createdAt)}</div>
                <span
                  className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-[12px] font-medium ${
                    u.isBanned ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {u.isBanned ? "Заблоковано" : "Активний"}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── Recent content ─────────────────────────────────────────────────

function RecentContent({ data }: { data: PlatformAnalytics | null }) {
  const rows = data?.recentContent;
  return (
    <section className={`${card} p-5 min-w-0`} aria-label="Останній опублікований контент">
      <h2 className="text-[18px] font-semibold mb-3">Останній опублікований контент</h2>
      {!rows ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-[14px] text-black/60">Опублікованого контенту ще немає.</p>
      ) : (
        <ul className="divide-y divide-black/5">
          {rows.map((c) => (
            <li key={c.id} className="py-3 flex items-center gap-3 min-w-0">
              {c.coverUrl ? (
                <img src={c.coverUrl} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0 bg-black/5" />
              ) : (
                <span className="w-12 h-12 rounded-lg bg-black/[0.04] text-black/50 flex items-center justify-center shrink-0">
                  <Icon name={KIND_ICON[c.kind]} size={20} />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-medium truncate">{c.title}</div>
                <div className="text-[13px] text-black/60 truncate">{c.authorName}</div>
              </div>
              <div className="text-right shrink-0">
                <span className="inline-block px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 text-[12px] font-medium">
                  {KIND_SINGULAR[c.kind]}
                </span>
                <div className="text-[13px] text-black/70 mt-0.5">
                  Оновлено {formatAbsoluteDate(c.updatedAt)}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
