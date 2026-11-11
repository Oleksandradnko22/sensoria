// «Учасники»: the people who bought or go through the author's materials. One card per person (not per person ×
// material), with their materials as chips; opening a card shows how each material is going. Privacy rules of a
// psychological platform: no email (contact goes through «Повідомлення»), a person's reflections and answers only as
// counts, and the state before → after only as an average over everyone (lib/authorParticipants.ts).
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { demoMoodByContent, type AuthoredContent, type ContentType, type ParticipantSegment } from "../../data/authorDashboard";
import { fetchParticipantsPage, fetchParticipantEngagement, fetchMoodByContent, type ParticipantEngagementSummary } from "../../lib/authorParticipants";
import { fetchProgramItems } from "../../lib/publicContent";
import type { ContentModule } from "../../data/contentTypes";
import { SHOW_AUTHOR_DEMO } from "../../utils/demoMode";
import { demoWorld } from "../../data/demoWorld";
import { pluralUk } from "../../utils/plural";
import { formatRelativeTime } from "../../utils/relativeTime";
import { Icon, type IconName } from "../ui/Icon";
import CatalogSort from "../catalog/CatalogSort";

// otherId null = a demo participant: «Повідомлення» opens without a conversation (there is nobody real to write to)
export type WriteTarget = { otherId: string | null; name: string; contentId: string | null; contentTitle: string | null };

type Props = {
  content: AuthoredContent[];
  // opens «Повідомлення» with this person (a new conversation if there is none yet)
  onWrite?: (target: WriteTarget) => void;
};

// neutral and gentle: a status is about a person's rhythm, not a grade
const SEGMENT_LABEL: Record<ParticipantSegment, string> = { new: "Початок", active: "Активно", inactive: "На паузі" };
const SEGMENT_STYLE: Record<ParticipantSegment, string> = {
  new: "bg-sky-50 text-sky-700 ring-sky-200",
  active: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  inactive: "bg-slate-100 text-slate-600 ring-slate-200",
};
const TYPE_ICON: Record<ContentType, IconName> = { program: "program", meditation: "meditation", guide: "guide" };
const TYPE_LABEL: Record<ContentType, string> = { program: "Програма", meditation: "Медитація", guide: "Гайд" };
type SortKey = "recent" | "name" | "new" | "inactive";
const SORTS: { id: SortKey; label: string }[] = [
  { id: "recent", label: "Нещодавно активні" },
  { id: "name", label: "За ім’ям" },
  { id: "new", label: "Спершу нові" },
  { id: "inactive", label: "Давно не заходили" },
];
const PAGE = 4;
// a showcase picture of a demo participant's activity (they have no real answers behind them)
const demoFacts = (progress: number) => ({ practiceResponsesCount: Math.round(progress / 9), reflectionsCount: Math.round(progress / 14), feedbackHelpfulCount: Math.round(progress / 12), feedbackNotHelpfulCount: progress > 50 ? 1 : 0 });
const DAY = 86_400_000;

// one person × one material
type Entry = { contentId: string; progressPercent: number; lastActive: string; segment: ParticipantSegment };
type Person = { key: string; userId: string | null; name: string; entries: Entry[]; lastActive: string; segment: ParticipantSegment };

const card = "rounded-[26px] bg-white shadow-[0_10px_30px_-14px_rgba(60,60,140,0.28)] ring-1 ring-[#ebe8ff]";
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "У";
// the most "alive" state of a person over all their materials
const bestSegment = (list: ParticipantSegment[]): ParticipantSegment => (list.includes("active") ? "active" : list.includes("new") ? "new" : "inactive");
const lastSeen = (iso: string) => `востаннє ${formatRelativeTime(iso)}`;

// Demo people come from the shared demo world (data/demoWorld.ts): the same buyers as in «Фінанси».
function demoPeople(): Person[] {
  return demoWorld().people.map((d) => ({
    key: `demo:${d.name}`,
    userId: null,
    name: d.name,
    entries: d.entries,
    lastActive: d.entries.reduce((m, e) => (new Date(e.lastActive) > new Date(m) ? e.lastActive : m), d.entries[0]?.lastActive ?? d.firstSeen),
    segment: bestSegment(d.entries.map((e) => e.segment)),
  }));
}

export default function AuthorParticipants({ content, onWrite }: Props) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState(""); // the search sent to the database, a moment after typing stops
  useEffect(() => {
    const t = window.setTimeout(() => setQuery(search.trim()), 300);
    return () => window.clearTimeout(t);
  }, [search]);
  const [segment, setSegment] = useState<"all" | ParticipantSegment>("all");
  const [material, setMaterial] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("recent");

  const byId = useMemo(() => new Map(content.map((c) => [c.id, c])), [content]);
  // participants exist only for what was ever on sale: published, archived, or taken down after publishing
  const liveIds = useMemo(() => content.filter((c) => c.status !== "draft" || c.everPublished).map((c) => c.id), [content]);

  // REAL participants: one page at a time from the database (author_participants)
  const [real, setReal] = useState<Person[]>([]);
  const [totals, setTotals] = useState({ total: 0, active7: 0, finished: 0, matching: 0 });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const toPerson = (p: Awaited<ReturnType<typeof fetchParticipantsPage>>["people"][number]): Person => ({
    key: p.userId,
    userId: p.userId,
    name: p.name,
    lastActive: p.lastActive,
    segment: p.segment,
    entries: p.items.map((i) => ({ contentId: i.contentId, progressPercent: i.percent, lastActive: i.lastActive, segment: i.segment })),
  });
  const params = { search: query, contentId: material === "all" ? null : material, segment: segment === "all" ? null : segment, sort };
  const paramsKey = JSON.stringify(params);
  useEffect(() => {
    let off = false;
    setLoading(true);
    setFailed(false);
    fetchParticipantsPage({ ...params, limit: PAGE, offset: 0 })
      .then((page) => {
        if (off) return;
        setReal(page.people.map(toPerson));
        setTotals({ total: page.total, active7: page.active7, finished: page.finished, matching: page.matching });
      })
      .catch(() => { if (!off) { setFailed(true); setReal([]); } })
      .finally(() => { if (!off) setLoading(false); });
    return () => {
      off = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsKey, reload]);

  // DEMO participants: filtered here, shown after the real ones
  const [now] = useState(() => Date.now());
  const demoAll = useMemo(() => (SHOW_AUTHOR_DEMO ? demoPeople() : []), []);
  const demoFiltered = demoAll
    .filter((p) => (segment === "all" || p.segment === segment) && (material === "all" || p.entries.some((e) => e.contentId === material)) && (!query || p.name.toLowerCase().includes(query.toLowerCase())))
    .sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name, "uk") : sort === "inactive" ? new Date(a.lastActive).getTime() - new Date(b.lastActive).getTime() : sort === "new" ? Number(b.segment === "new") - Number(a.segment === "new") : new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime()));
  // pages of 4 over one list: real people first (fetched page by page), then the demo showcase
  const [pages, setPages] = useState(1);
  useEffect(() => setPages(1), [paramsKey]);
  const realDone = real.length >= totals.matching;
  const visible = [...real, ...(realDone ? demoFiltered : [])].slice(0, pages * PAGE);
  const moreLeft = totals.matching + demoFiltered.length - visible.length;
  const showMore = async () => {
    const next = pages + 1;
    if (!realDone && real.length < next * PAGE) {
      setLoadingMore(true);
      try {
        const page = await fetchParticipantsPage({ ...params, limit: PAGE, offset: real.length });
        setReal((prev) => [...prev, ...page.people.map(toPerson)]);
      } catch {
        setFailed(true);
      } finally {
        setLoadingMore(false);
      }
    }
    setPages(next);
  };

  const stats = [
    { label: "Учасників", value: totals.total + demoAll.length, icon: "graduation" as IconName, hint: "Різні люди в усіх ваших матеріалах" },
    { label: "Активні за 7 днів", value: totals.active7 + demoAll.filter((p) => now - new Date(p.lastActive).getTime() <= 7 * DAY).length, icon: "bolt" as IconName, hint: "Заходили протягом тижня" },
    { label: "Пройшли програму", value: totals.finished + demoAll.filter((p) => p.entries.some((e) => e.progressPercent >= 100 && byId.get(e.contentId)?.type === "program")).length, icon: "check" as IconName, hint: "Завершили хоча б одну програму" },
  ];

  const [realMood, setRealMood] = useState<{ contentId: string; before: number; after: number; people: number }[]>([]);
  const liveKey = liveIds.join(",");
  useEffect(() => {
    let off = false;
    fetchMoodByContent(liveKey ? liveKey.split(",") : []).then((m) => { if (!off) setRealMood(m); }).catch(() => {});
    return () => {
      off = true;
    };
  }, [liveKey]);
  // demo marks: never more people than the material really has in the demo world, and only from 3 people
  const demoMood = SHOW_AUTHOR_DEMO
    ? demoMoodByContent.map((r) => ({ ...r, people: demoAll.filter((p) => p.entries.some((e) => e.contentId === r.contentId)).length })).filter((r) => r.people >= 3)
    : [];
  const moodRows = [...realMood, ...demoMood].filter((r) => byId.has(r.contentId)).slice(0, 6);

  const [demoNote, setDemoNote] = useState<string | null>(null);
  const write = (p: Person) => {
    if (!onWrite) return;
    if (!p.userId) {
      setDemoNote(p.key);
      return;
    }
    const c = byId.get(p.entries[0]?.contentId ?? "");
    onWrite({ otherId: p.userId, name: p.name, contentId: c?.id ?? null, contentTitle: c?.title ?? null });
  };

  const materialOptions = useMemo(
    () => [{ id: "all", label: "Усі матеріали" }, ...content.filter((c) => liveIds.includes(c.id)).map((c) => ({ id: c.id, label: c.title.length > 40 ? `${c.title.slice(0, 40)}…` : c.title }))],
    [content, liveIds],
  );

  // engagement of one person in one program, loaded when the card is opened (and kept for the next opening)
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [engagement, setEngagement] = useState<Record<string, ParticipantEngagementSummary | "loading">>({});
  const [modulesCache] = useState(() => new Map<string, ContentModule[] | null>());
  const toggle = (p: Person) => {
    const next = openKey === p.key ? null : p.key;
    setOpenKey(next);
    const userId = p.userId;
    if (!next || !userId) return;
    p.entries.filter((e) => byId.get(e.contentId)?.type === "program").forEach(async (e) => {
      const k = `${userId}:${e.contentId}`;
      if (engagement[k]) return;
      setEngagement((s) => ({ ...s, [k]: "loading" }));
      let modules = modulesCache.get(e.contentId);
      if (modules === undefined) {
        modules = await fetchProgramItems(e.contentId).catch(() => null);
        modulesCache.set(e.contentId, modules);
      }
      const summary = await fetchParticipantEngagement(e.contentId, userId, modules).catch(() => null);
      setEngagement((s) => {
        const copy = { ...s };
        if (summary) copy[k] = summary;
        else delete copy[k];
        return copy;
      });
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[32px] font-bold leading-tight text-[#12172b]">Учасники</h1>
        <p className="mt-1 text-[15px] text-black/55">Люди, які придбали або проходять ваші матеріали.</p>
      </div>

      {/* STATS + how it helps */}
      <div className="grid gap-4 md:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className={`${card} flex items-center gap-4 px-5 py-5`} title={s.hint}>
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#f1eeff] text-[#7a68e0]"><Icon name={s.icon} size={24} /></span>
            <div className="min-w-0">
              <div className="text-[14px] font-medium text-black/60">{s.label}</div>
              <div className="mt-1 text-[28px] font-bold leading-none text-[#12172b]">{loading && real.length === 0 ? <span className="inline-block h-7 w-12 animate-pulse rounded-lg bg-[#e7e3fb]" /> : s.value.toLocaleString("uk-UA")}</div>
            </div>
          </div>
        ))}
      </div>

      {/* HOW IT HELPS: average state before → after, per material, never per person */}
      <section className={`${card} p-5 sm:p-6`} aria-labelledby="pt-mood">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="pt-mood" className="text-[20px] font-bold text-[#12172b]">Як матеріали допомагають</h2>
          <span className="text-[13px] text-black/50">Середній стан до й після практики, шкала 0–10 · без імен</span>
        </div>
        {moodRows.length === 0 ? (
          <p className="mt-3 text-[14px] text-black/55">З’явиться, коли щонайменше троє учасників відмітять свій стан до й після практики.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-4">
            {moodRows.map((r) => {
              const c = byId.get(r.contentId);
              const diff = r.after - r.before;
              // close values: the two numbers move apart vertically so they never cover each other
              const close = Math.abs(diff) < 0.8;
              return (
                <li key={r.contentId} className="grid items-center gap-x-5 gap-y-2 md:grid-cols-[minmax(0,240px)_minmax(0,1fr)_140px]">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-[12px] font-medium text-[#6d5bd0]">{c && <Icon name={TYPE_ICON[c.type]} size={13} />}{c ? TYPE_LABEL[c.type] : ""}</div>
                    <div className="truncate text-[15px] font-semibold text-[#12172b]" title={c?.title}>{c?.title}</div>
                  </div>
                  <div className="relative mx-4 h-12" aria-label={`Стан до ${r.before.toFixed(1)}, після ${r.after.toFixed(1)}`}>
                    <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-[#ece9fe]" />
                    <div className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-gradient-to-r from-[#c9bff7] to-[#22a35a]" style={{ left: `${r.before * 10}%`, width: `${Math.max(0, diff) * 10}%` }} />
                    <span className="absolute top-1/2 grid h-8 w-8 -translate-x-1/2 place-items-center rounded-full bg-white text-[11px] font-bold text-[#4d5278] ring-2 ring-[#c9bff7]" style={{ left: `${r.before * 10}%`, transform: `translate(-50%, ${close ? "-100%" : "-50%"})` }}>{r.before.toFixed(1)}</span>
                    <span className="absolute top-1/2 grid h-8 w-8 -translate-x-1/2 place-items-center rounded-full bg-[#22a35a] text-[11px] font-bold text-white" style={{ left: `${r.after * 10}%`, transform: `translate(-50%, ${close ? "0%" : "-50%"})` }}>{r.after.toFixed(1)}</span>
                  </div>
                  <div className="text-[13px] md:text-right">
                    <b className={diff >= 1 ? "text-[#1d7a45]" : "text-[#4d5278]"}>{diff >= 0 ? "+" : ""}{diff.toFixed(1)}</b>
                    <span className="text-black/50"> · {r.people} {pluralUk(r.people, "людина", "людини", "людей")}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* FILTERS */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative block w-full min-[560px]:w-auto">
          <span className="sr-only">Пошук за ім’ям</span>
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-black/40"><Icon name="search" size={17} /></span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Пошук за ім’ям" className="min-h-[46px] w-full rounded-2xl bg-white pl-10 pr-4 text-[14px] shadow-[0_6px_18px_-12px_rgba(60,60,140,0.35)] ring-1 ring-[#ebe8ff] placeholder:text-black/40 focus:outline-none focus:ring-2 focus:ring-[#7c5cf0] min-[560px]:w-[260px]" />
        </label>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Активність">
          {(["all", "active", "new", "inactive"] as const).map((s) => (
            <Chip key={s} active={segment === s} onClick={() => setSegment(s)}>{s === "all" ? "Усі" : SEGMENT_LABEL[s]}</Chip>
          ))}
        </div>
      </div>
      {/* which material + in what order: one row, filter on the left, order on the right */}
      <div className="-mt-2 flex flex-wrap items-center justify-between gap-3">
        <CatalogSort<string> value={material} onChange={setMaterial} options={materialOptions} label="Матеріал" variant="light" className="" icon={<Icon name="library" size={16} />} />
        <CatalogSort<SortKey> value={sort} onChange={setSort} options={SORTS} label="Порядок" variant="light" className="" />
      </div>

      {/* LIST */}
      <div className={card}>
        {failed && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-100 bg-amber-50 px-6 py-4 text-[14px] text-amber-800">
            <span>Не вдалося завантажити учасників.</span>
            <button type="button" onClick={() => setReload((n) => n + 1)} className="min-h-[40px] rounded-xl bg-white px-4 font-semibold ring-1 ring-amber-200 hover:bg-amber-100">Спробувати ще раз</button>
          </div>
        )}
        {loading && visible.length === 0 ? (
          <ul aria-busy="true" aria-label="Завантаження">
            {[0, 1, 2].map((i) => (
              <li key={i} className="flex items-center gap-4 border-b border-black/5 px-6 py-5 last:border-0">
                <span className="h-12 w-12 animate-pulse rounded-full bg-[#e7e3fb]" />
                <span className="h-4 w-1/3 animate-pulse rounded bg-black/5" />
              </li>
            ))}
          </ul>
        ) : totals.total + demoAll.length === 0 ? (
          <Empty title="Поки немає учасників" text="Коли хтось придбає або почне проходити ваш матеріал, він з’явиться тут." />
        ) : visible.length === 0 ? (
          <Empty title="Нікого не знайдено" text="Спробуйте інше ім’я або інший фільтр." />
        ) : (
          <ul>
            {visible.map((p) => {
              const open = openKey === p.key;
              const userId = p.userId;
              return (
                <li key={p.key} className="border-b border-black/5 last:border-0">
                  <div className="flex flex-wrap items-center gap-4 px-4 py-4 sm:px-6">
                    <button type="button" onClick={() => toggle(p)} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-4 rounded-2xl text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7c5cf0]">
                      <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#e2dbff] to-[#cfc3ff] text-[15px] font-bold text-[#4a2fd0]">{initials(p.name)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-3">
                          <span className="truncate text-[16px] font-semibold text-[#12172b]">{p.name}</span>
                          <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold ring-1 ${SEGMENT_STYLE[p.segment]}`}>{SEGMENT_LABEL[p.segment]}</span>
                        </span>
                        <span className="mt-2.5 flex flex-wrap items-center gap-2">
                          {p.entries.filter((e) => byId.has(e.contentId)).slice(0, 3).map((e) => {
                            const c = byId.get(e.contentId);
                            return (
                              <span key={e.contentId} className="inline-flex max-w-[220px] items-center gap-1 rounded-full bg-[#f6f4ff] px-2.5 py-0.5 text-[12px] font-medium text-[#4d5278]">
                                {c && <Icon name={TYPE_ICON[c.type]} size={12} />}
                                <span className="truncate">{c?.title ?? "Матеріал"}</span>
                              </span>
                            );
                          })}
                          {p.entries.filter((e) => byId.has(e.contentId)).length > 3 && <span className="text-[12px] text-black/50">+{p.entries.filter((e) => byId.has(e.contentId)).length - 3}</span>}
                        </span>
                        <span className="mt-1.5 block text-[12px] text-black/50 sm:hidden">{lastSeen(p.lastActive)}</span>
                      </span>
                      <span className="hidden shrink-0 items-center gap-3 text-[13px] text-black/55 sm:flex">
                        {formatRelativeTime(p.lastActive)}
                        <span className={`transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true"><Icon name="chevron" size={16} /></span>
                      </span>
                    </button>
                    {onWrite && (
                      <button
                        type="button"
                        onClick={() => write(p)}
                        className="inline-flex min-h-[42px] shrink-0 items-center gap-2 rounded-xl bg-[#f1eeff] px-4 text-[14px] font-semibold text-[#5b4bd0] transition hover:bg-[#e7e1ff] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7c5cf0]"
                      >
                        <Icon name="mail" size={16} /> Написати
                      </button>
                    )}
                    {demoNote === p.key && <p role="status" className="w-full text-right text-[12px] text-black/50">Це демо-учасник: написати йому не можна, а реальним учасникам — так.</p>}
                  </div>

                  {open && (
                    <div className="grid gap-3 border-t border-[#efeafd] bg-[#faf9ff] px-4 pb-5 pt-4 sm:px-6 md:grid-cols-2">
                      {p.entries.map((e) => {
                        const c = byId.get(e.contentId);
                        const isProgram = c?.type === "program";
                        const eng = userId ? engagement[`${userId}:${e.contentId}`] : undefined;
                        return (
                          <div key={e.contentId} className="rounded-2xl bg-white p-4 ring-1 ring-[#ebe8ff]">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
                              <span className="inline-flex items-center gap-1.5 font-semibold text-[#6d5bd0]">
                                {c && <Icon name={TYPE_ICON[c.type]} size={13} />}
                                {c ? TYPE_LABEL[c.type] : "Матеріал"}
                              </span>
                              <span aria-hidden="true" className="text-black/25">·</span>
                              <span className="text-black/50">{lastSeen(e.lastActive)}</span>
                            </div>
                            <div className="mt-1 line-clamp-2 text-[15px] font-semibold text-[#12172b]">{c?.title ?? "Матеріал"}</div>
                            {!isProgram && (
                              <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#e8f6ee] px-3 py-1 text-[12px] font-semibold text-[#1d7a45]">
                                <Icon name="check" size={13} /> {c?.type === "meditation" ? "Слухає" : "Читає"}
                              </div>
                            )}
                            {isProgram && (
                              <div className="mt-3 flex items-center gap-3">
                                <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#ece9fe]">
                                  <div className="h-full rounded-full bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0]" style={{ width: `${Math.min(100, e.progressPercent)}%` }} />
                                </div>
                                <span className="text-[13px] font-semibold text-[#2d2a5c]">{e.progressPercent >= 100 ? "Пройдено" : `${e.progressPercent}%`}</span>
                              </div>
                            )}
                            {isProgram && (
                              <div className="mt-3 flex flex-wrap gap-2 text-[12px]">
                                {!userId ? (
                                  <DemoFacts progress={e.progressPercent} />
                                ) : eng === "loading" ? (
                                  <span className="text-black/45">Завантаження…</span>
                                ) : eng ? (
                                  <>
                                    <Fact label="Практики" value={eng.practiceResponsesCount} />
                                    <Fact label="Нотатки" value={eng.reflectionsCount} />
                                    <Fact label="Корисно" value={eng.feedbackHelpfulCount} />
                                    <Fact label="Не зовсім" value={eng.feedbackNotHelpfulCount} />
                                  </>
                                ) : null}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      <div className="flex flex-wrap items-center justify-between gap-3 md:col-span-2">
                        <p className="max-w-[560px] text-[12px] leading-snug text-black/50">Нотатки й відповіді на практики — особистий простір учасника: ви бачите лише їх кількість, не текст.</p>
                        {onWrite && (
                          <button type="button" onClick={() => write(p)} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] px-5 text-[14px] font-semibold text-white transition hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7c5cf0] focus-visible:ring-offset-2">
                            <Icon name="mail" size={16} /> Написати учаснику
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {moreLeft > 0 && (
          <div className="border-t border-[#eceef7] px-5 py-3 sm:px-6">
            <button type="button" onClick={() => void showMore()} disabled={loadingMore} className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[#f1eeff] px-5 text-[14px] font-semibold text-[#5b4bd0] transition hover:bg-[#e7e1ff] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7c5cf0] disabled:opacity-60">
              {loadingMore ? "Завантаження…" : <>Показати ще ({Math.min(PAGE, moreLeft)}) <span aria-hidden="true">↓</span></>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={`inline-flex min-h-[44px] items-center rounded-2xl px-4 text-[14px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7c5cf0] ${active ? "bg-[#12172b] text-white" : "bg-white text-[#1d2240] shadow-[0_6px_18px_-12px_rgba(60,60,140,0.35)] ring-1 ring-[#ebe8ff] hover:bg-[#faf9ff]"}`}>
      {children}
    </button>
  );
}

function DemoFacts({ progress }: { progress: number }) {
  const d = demoFacts(progress);
  return (
    <>
      <Fact label="Практики" value={d.practiceResponsesCount} />
      <Fact label="Нотатки" value={d.reflectionsCount} />
      <Fact label="Корисно" value={d.feedbackHelpfulCount} />
      <Fact label="Не зовсім" value={d.feedbackNotHelpfulCount} />
    </>
  );
}

function Fact({ label, value }: { label: string; value: number }) {
  return (
    <span className="rounded-full bg-[#f6f4ff] px-3 py-1 font-medium text-[#4d5278]">
      {label}: <b className="text-[#12172b]">{value}</b>
    </span>
  );
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f1eeff] text-[#7a68e0]"><Icon name="graduation" size={24} /></span>
      <div className="text-[17px] font-semibold text-[#12172b]">{title}</div>
      <p className="max-w-[420px] text-[14px] text-black/60">{text}</p>
    </div>
  );
}
