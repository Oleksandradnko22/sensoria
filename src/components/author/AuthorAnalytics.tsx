import { useEffect, useMemo, useState } from "react";
import { analyticsOverview, authoredContent, type AuthoredContent } from "../../data/authorDashboard";
import { fetchCompletionAnalytics, type ContentCompletionStats } from "../../lib/authorAnalytics";

const DEMO_IDS = new Set(authoredContent.map((c) => c.id));

type Props = {
  content: AuthoredContent[];
};

export default function AuthorAnalytics({ content }: Props) {
  const { viewsLast30Days, purchasesLast30Days, conversionRate, trafficSources, dropOffByModule, completionRateByContent } =
    analyticsOverview;

  const contentTitle = (id: string) =>
    content.find((c) => c.id === id)?.title ?? authoredContent.find((c) => c.id === id)?.title ?? id;

  const realContentIds = useMemo(
    () => content.filter((c) => !DEMO_IDS.has(c.id)).map((c) => c.id),
    [content]
  );
  const [realStats, setRealStats] = useState<ContentCompletionStats[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetchCompletionAnalytics(realContentIds).then((rows) => {
      if (!cancelled) setRealStats(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [realContentIds]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold">Аналітика</h1>
        <p className="text-black/50 mt-1">За останні 30 днів.</p>
      </div>

      {/* SUMMARY — page views/purchases/conversion aren't tracked
          anywhere in this app yet (no analytics pipeline exists), so
          these three stay the demo showcase numbers, honestly labelled
          as such rather than presented as real. */}
      <div className="grid sm:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-white border border-black/5 p-5">
          <div className="text-[13px] text-black/45">Перегляди карток (демо)</div>
          <div className="text-[26px] font-bold mt-2">
            {viewsLast30Days.toLocaleString("uk-UA")}
          </div>
        </div>
        <div className="rounded-2xl bg-white border border-black/5 p-5">
          <div className="text-[13px] text-black/45">Покупки (демо)</div>
          <div className="text-[26px] font-bold mt-2">{purchasesLast30Days}</div>
        </div>
        <div className="rounded-2xl bg-white border border-black/5 p-5">
          <div className="text-[13px] text-black/45">Конверсія (демо)</div>
          <div className="text-[26px] font-bold mt-2">
            {(conversionRate * 100).toFixed(1)}%
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* TRAFFIC SOURCES — same "no real tracking exists" reasoning
            as the summary cards above, stays demo. */}
        <div className="rounded-2xl bg-white border border-black/5 p-6">
          <h2 className="text-[17px] font-semibold mb-1">Джерела трафіку</h2>
          <p className="text-[12px] text-black/40 mb-4">Демо-приклад — реальна аналітика трафіку поки не підключена.</p>
          <div className="flex flex-col gap-4">
            {trafficSources.map((s) => (
              <div key={s.source}>
                <div className="flex items-center justify-between text-[13px] mb-1.5">
                  <span className="text-black/70">{s.source}</span>
                  <span className="font-medium">{s.percent}%</span>
                </div>
                <div className="h-2 rounded-full bg-black/5 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
                    style={{ width: `${s.percent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* COMPLETION RATE — demo entries kept as-is, real programs'
            entries are genuinely computed from content_progress
            (lib/authorAnalytics.ts), mixed into the same list. */}
        <div className="rounded-2xl bg-white border border-black/5 p-6">
          <h2 className="text-[17px] font-semibold mb-5">
            Відсоток завершення курсу
          </h2>
          <div className="flex flex-col gap-4">
            {Object.entries(completionRateByContent).map(([id, rate]) => (
              <div key={id}>
                <div className="flex items-center justify-between text-[13px] mb-1.5">
                  <span className="text-black/70 truncate">{contentTitle(id)}</span>
                  <span className="font-medium">{Math.round(rate * 100)}%</span>
                </div>
                <div className="h-2 rounded-full bg-black/5 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500"
                    style={{ width: `${rate * 100}%` }}
                  />
                </div>
              </div>
            ))}
            {realStats.map((s) => (
              <div key={s.contentId}>
                <div className="flex items-center justify-between text-[13px] mb-1.5">
                  <span className="text-black/70 truncate">{contentTitle(s.contentId)}</span>
                  <span className="font-medium">{Math.round(s.completionRate * 100)}%</span>
                </div>
                <div className="h-2 rounded-full bg-black/5 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500"
                    style={{ width: `${s.completionRate * 100}%` }}
                  />
                </div>
                <div className="text-[11px] text-black/35 mt-1">{s.participantsCount} учасників</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* DROP-OFF FUNNELS — the original demo funnel (Андрія's showcase
          "Робота зі стресом"), plus one real funnel per real program
          that actually has participants, each with its own real module
          titles/percentages. */}
      <div className="rounded-2xl bg-white border border-black/5 p-6">
        <h2 className="text-[17px] font-semibold mb-1">
          Де учасники зупиняються — «Робота зі стресом» (демо)
        </h2>
        <p className="text-[13px] text-black/45 mb-5">
          Відсоток учасників, які дійшли до кожного модуля
        </p>
        <div className="flex flex-col gap-4">
          {dropOffByModule.map((m, i) => (
            <div key={m.module} className="flex items-center gap-4">
              <div className="w-6 h-6 rounded-full bg-[#eef2ff] flex items-center justify-center text-[12px] font-semibold text-[#4338ca] shrink-0">
                {i + 1}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between text-[13px] mb-1.5">
                  <span className="text-black/70">{m.module}</span>
                  <span className="font-medium">{m.completion}%</span>
                </div>
                <div className="h-2 rounded-full bg-black/5 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
                    style={{ width: `${m.completion}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {realStats.map((s) => (
        <div key={s.contentId} className="rounded-2xl bg-white border border-black/5 p-6">
          <h2 className="text-[17px] font-semibold mb-1">
            Де учасники зупиняються — «{contentTitle(s.contentId)}»
          </h2>
          <p className="text-[13px] text-black/45 mb-5">
            Відсоток учасників, які дійшли до кожного модуля ({s.participantsCount} учасників)
          </p>
          <div className="flex flex-col gap-4">
            {s.moduleDropOff.map((m, i) => (
              <div key={`${s.contentId}-${i}`} className="flex items-center gap-4">
                <div className="w-6 h-6 rounded-full bg-[#eef2ff] flex items-center justify-center text-[12px] font-semibold text-[#4338ca] shrink-0">
                  {i + 1}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between text-[13px] mb-1.5">
                    <span className="text-black/70">{m.moduleTitle}</span>
                    <span className="font-medium">{m.reachedPercent}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-black/5 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
                      style={{ width: `${m.reachedPercent}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
