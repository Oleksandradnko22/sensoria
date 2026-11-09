import { useEffect, useMemo, useState } from "react";
import {
  participants as participantsData,
  type AuthoredContent,
  type ParticipantSegment,
} from "../../data/authorDashboard";
import {
  fetchRealParticipants,
  fetchParticipantEngagement,
  type AuthorParticipant,
  type ParticipantEngagementSummary,
} from "../../lib/authorParticipants";
import { fetchProgramItems } from "../../lib/publicContent";
import type { ContentModule } from "../../data/contentTypes";

const segmentLabel: Record<ParticipantSegment, string> = {
  new: "Нові",
  active: "Активні",
  inactive: "Неактивні",
};

const segmentStyle: Record<ParticipantSegment, string> = {
  new: "bg-blue-100 text-blue-700",
  active: "bg-emerald-100 text-emerald-700",
  inactive: "bg-black/5 text-black/45",
};

// One shared row shape for the table — demo rows (data/authorDashboard.ts,
// Андрій's showcase) and real rows (lib/authorParticipants.ts, actual
// content_progress across the author's own real content) get mapped
// into this before rendering, so the table itself doesn't need to know
// which source a row came from. `isReal` gates the one thing that
// differs: real rows can expand into an engagement summary (fetched on
// demand), demo rows can't (there's no real engagement data behind
// them).
type Row = {
  id: string;
  isReal: boolean;
  name: string;
  email: string;
  contentId: string;
  progressPercent: number;
  lastActive: string;
  segment: ParticipantSegment;
  certificateIssued: boolean;
};

type Props = {
  content: AuthoredContent[];
};

export default function AuthorParticipants({ content }: Props) {
  const [search, setSearch] = useState("");
  const [segment, setSegment] = useState<"all" | ParticipantSegment>("all");
  const [contentFilter, setContentFilter] = useState<"all" | string>("all");
  // Certificates — still a purely local, this-session-only toggle (see
  // AuthorParticipants' original comment); real persistence is a
  // separate, later decision per Sasha (2026-08-27), not part of this
  // pass. Keyed by the same synthetic row id as everything else here.
  const [issued, setIssued] = useState<Record<string, boolean>>({});

  const contentTitle = (id: string) => content.find((c) => c.id === id)?.title ?? id;

  const [realParticipants, setRealParticipants] = useState<AuthorParticipant[]>([]);
  const realContentIds = useMemo(
    () => content.filter((c) => c.status !== "draft").map((c) => c.id),
    [content]
  );
  useEffect(() => {
    let cancelled = false;
    // Demo content ids never have real content_progress rows behind
    // them (see DEMO_IDS in AuthorDashboardPage.tsx) — passing them
    // through is harmless (the query just returns nothing for those
    // ids), simpler than threading a separate "which ids are real"
    // filter down into this component.
    fetchRealParticipants(realContentIds).then((rows) => {
      if (!cancelled) setRealParticipants(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [realContentIds]);

  const rows: Row[] = useMemo(() => {
    const demoRows: Row[] = participantsData.map((p) => ({
      id: p.id,
      isReal: false,
      name: p.name,
      email: p.email,
      contentId: p.contentId,
      progressPercent: p.progressPercent,
      lastActive: p.lastActive,
      segment: p.segment,
      certificateIssued: issued[p.id] ?? p.certificateIssued,
    }));
    const realRows: Row[] = realParticipants.map((p) => {
      const id = `${p.userId}:${p.contentId}`;
      return {
        id,
        isReal: true,
        name: p.name,
        email: p.email,
        contentId: p.contentId,
        progressPercent: p.progressPercent,
        lastActive: p.lastActiveAt.slice(0, 10),
        segment: p.segment,
        certificateIssued: issued[id] ?? false,
      };
    });
    return [...realRows, ...demoRows];
  }, [realParticipants, issued]);

  const filtered = rows.filter((p) => {
    if (segment !== "all" && p.segment !== segment) return false;
    if (contentFilter !== "all" && p.contentId !== contentFilter) return false;
    if (
      search &&
      !p.name.toLowerCase().includes(search.toLowerCase()) &&
      !p.email.toLowerCase().includes(search.toLowerCase())
    )
      return false;
    return true;
  });

  // ENGAGEMENT — fetched lazily per expanded row (not for every row up
  // front, most will never be opened), and modules cached per content
  // id so expanding a second participant on the same program doesn't
  // re-fetch them.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [engagementByRow, setEngagementByRow] = useState<Record<string, ParticipantEngagementSummary>>({});
  const [engagementLoading, setEngagementLoading] = useState<string | null>(null);
  const modulesByContentRef = useMemo(() => new Map<string, ContentModule[] | null>(), []);

  const toggleExpand = async (row: Row) => {
    if (!row.isReal) return;
    if (expandedId === row.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(row.id);
    if (engagementByRow[row.id]) return;
    setEngagementLoading(row.id);
    try {
      let modules = modulesByContentRef.get(row.contentId);
      if (modules === undefined) {
        modules = await fetchProgramItems(row.contentId);
        modulesByContentRef.set(row.contentId, modules);
      }
      const [userId] = row.id.split(":");
      const summary = await fetchParticipantEngagement(row.contentId, userId, modules);
      setEngagementByRow((prev) => ({ ...prev, [row.id]: summary }));
    } finally {
      setEngagementLoading((cur) => (cur === row.id ? null : cur));
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold">Учасники</h1>
        <p className="text-black/50 mt-1">
          {rows.length} учасників переглядають ваш контент
        </p>
      </div>

      {/* FILTERS */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Пошук за ім'ям або email"
          className="px-4 py-2.5 rounded-xl border border-black/10 text-[14px] focus:outline-none focus:border-black/30 min-w-[240px]"
        />

        <select
          value={contentFilter}
          onChange={(e) => setContentFilter(e.target.value)}
          className="px-4 py-2.5 rounded-xl border border-black/10 text-[14px] bg-white focus:outline-none focus:border-black/30"
        >
          <option value="all">Усі курси/гайди</option>
          {content.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>

        <div className="flex gap-2">
          {(["all", "new", "active", "inactive"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSegment(s)}
              className={`px-3.5 py-2 rounded-xl text-[13px] font-medium transition ${
                segment === s
                  ? "bg-black text-white"
                  : "bg-white border border-black/10 text-black/60 hover:bg-black/5"
              }`}
            >
              {s === "all" ? "Усі" : segmentLabel[s]}
            </button>
          ))}
        </div>
      </div>

      {/* TABLE */}
      <div className="rounded-2xl bg-white border border-black/5 overflow-hidden">
        <div className="grid grid-cols-[1.4fr_1.2fr_1fr_1fr_0.8fr_180px] gap-4 px-6 py-3 text-[12px] uppercase tracking-wide text-black/40 border-b border-black/5">
          <div>Учасник</div>
          <div>Контент</div>
          <div>Прогрес</div>
          <div>Активність</div>
          <div>Сегмент</div>
          <div />
        </div>

        {filtered.length === 0 && (
          <div className="px-6 py-10 text-center text-black/40 text-[14px]">
            Нікого не знайдено
          </div>
        )}

        {filtered.map((p) => (
          <div key={p.id} className="border-b border-black/5 last:border-0">
            <div
              onClick={() => toggleExpand(p)}
              className={`grid grid-cols-[1.4fr_1.2fr_1fr_1fr_0.8fr_180px] gap-4 px-6 py-4 items-center transition ${
                p.isReal ? "cursor-pointer hover:bg-black/[0.02]" : "hover:bg-black/[0.02]"
              }`}
            >
              <div className="min-w-0">
                <div className="font-medium text-[14px] truncate flex items-center gap-1.5">
                  {p.name}
                  {p.isReal && (
                    <span className="text-black/25 text-[11px]" title="Розгорнути активність">
                      {expandedId === p.id ? "▲" : "▼"}
                    </span>
                  )}
                </div>
                <div className="text-[12px] text-black/40 truncate">{p.email}</div>
              </div>

              <div className="text-[13px] text-black/70 truncate">
                {contentTitle(p.contentId)}
              </div>

              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-black/10 overflow-hidden max-w-[90px]">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
                    style={{ width: `${p.progressPercent}%` }}
                  />
                </div>
                <span className="text-[12px] text-black/50">{p.progressPercent}%</span>
              </div>

              <div className="text-[13px] text-black/50">{p.lastActive}</div>

              <div>
                <span
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium ${segmentStyle[p.segment]}`}
                >
                  {segmentLabel[p.segment]}
                </span>
              </div>

              <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                {p.progressPercent === 100 && (
                  <button
                    onClick={() =>
                      setIssued((prev) => ({ ...prev, [p.id]: !p.certificateIssued }))
                    }
                    className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition ${
                      p.certificateIssued
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-black/5 hover:bg-black/10"
                    }`}
                  >
                    {p.certificateIssued ? "Сертифікат видано ✓" : "Видати сертифікат"}
                  </button>
                )}
              </div>
            </div>

            {/* ENGAGEMENT SUMMARY — aggregated counts only, never the
                reflection/practice text itself (see this file's header
                comment). */}
            {p.isReal && expandedId === p.id && (
              <div className="px-6 pb-5 -mt-1 bg-[#fafbff]">
                {engagementLoading === p.id ? (
                  <div className="text-[13px] text-black/40 py-3">Завантаження…</div>
                ) : (
                  (() => {
                    const e = engagementByRow[p.id];
                    if (!e) return null;
                    return (
                      <div className="flex flex-wrap gap-4 pt-3 text-[13px]">
                        <div className="rounded-xl bg-white border border-black/5 px-4 py-2.5">
                          <div className="text-[11px] text-black/40">Практики</div>
                          <div className="font-semibold">{e.practiceResponsesCount}</div>
                        </div>
                        <div className="rounded-xl bg-white border border-black/5 px-4 py-2.5">
                          <div className="text-[11px] text-black/40">Нотатки-спостереження</div>
                          <div className="font-semibold">{e.reflectionsCount}</div>
                        </div>
                        <div className="rounded-xl bg-white border border-black/5 px-4 py-2.5">
                          <div className="text-[11px] text-black/40">Стан до → після</div>
                          <div className="font-semibold">
                            {e.moodAverage
                              ? `${e.moodAverage.before.toFixed(1)} → ${e.moodAverage.after.toFixed(1)}`
                              : "—"}
                          </div>
                        </div>
                        <div className="rounded-xl bg-white border border-black/5 px-4 py-2.5">
                          <div className="text-[11px] text-black/40">Корисно / не зовсім</div>
                          <div className="font-semibold">
                            {e.feedbackHelpfulCount} / {e.feedbackNotHelpfulCount}
                          </div>
                        </div>
                      </div>
                    );
                  })()
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
