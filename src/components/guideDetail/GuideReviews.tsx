import { useMemo, useState } from "react";
import { Icon } from "../ui/Icon";

export type GuideReview = {
  id: string;
  kind: "guide" | "author";
  rating: number; // 1–5
  text: string;
  name: string;
  date: string; // ISO
  reply?: string;
};

type Props = {
  reviews: GuideReview[];
  // «Читабельність», «Практичність»… — average per criterion, when the guide collects them.
  criteria?: { label: string; value: number }[];
  // Preview data: the form is shown switched off and a banner says so.
  demo?: boolean;
};

type Filter = "all" | "guide" | "author";
const KIND_LABEL = { guide: "Про гайд", author: "Про автора" } as const;

const monthYear = (iso: string) => new Date(iso).toLocaleDateString("uk-UA", { month: "long", year: "numeric" });
const average = (list: GuideReview[]) => (list.length ? Math.round((list.reduce((s, r) => s + r.rating, 0) / list.length) * 10) / 10 : null);

function Stars({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-amber-400" role="img" aria-label={`Оцінка ${value} з 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= Math.round(value) ? "" : "text-slate-200"}>
          <Icon name="star" size={size} filled />
        </span>
      ))}
    </span>
  );
}

// The guide's «Відгуки» tab: the score at a glance, how it is spread, then what people wrote, about the
// guide and about its author. Presentational only: the data comes in as props.
export default function GuideReviews({ reviews, criteria, demo }: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const shown = useMemo(() => (filter === "all" ? reviews : reviews.filter((r) => r.kind === filter)), [reviews, filter]);
  const counts = { all: reviews.length, guide: reviews.filter((r) => r.kind === "guide").length, author: reviews.filter((r) => r.kind === "author").length };
  const avg = average(shown);
  const spread = [5, 4, 3, 2, 1].map((n) => ({ n, count: shown.filter((r) => r.rating === n).length }));
  const most = Math.max(1, ...spread.map((s) => s.count));

  const pill = (id: Filter, label: string) => (
    <button
      key={id}
      type="button"
      role="tab"
      aria-selected={filter === id}
      onClick={() => setFilter(id)}
      className={`min-h-[40px] rounded-full border px-4 text-[14px] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00867f] ${
        filter === id ? "border-[#00a89a]/40 bg-[#e6faf6] font-semibold text-[#006b65]" : "border-black/[0.12] bg-white text-black/65 hover:bg-black/[0.04]"
      }`}
    >
      {label} <span className="text-[12px] opacity-70">{counts[id]}</span>
    </button>
  );

  return (
    <div>
      {demo && (
        <p role="note" className="mb-5 rounded-[14px] bg-amber-50 px-4 py-2.5 text-[13px] leading-relaxed text-amber-800 ring-1 ring-amber-200">
          Демо-дані для перегляду вигляду. Цього блоку не буде на справжньому сайті, доки не з’являться реальні відгуки.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[22px] font-semibold">Відгуки</h2>
        <div role="tablist" aria-label="Фільтр відгуків" className="flex flex-wrap gap-2">
          {pill("all", "Усі")}
          {pill("guide", "Про гайд")}
          {pill("author", "Про автора")}
        </div>
      </div>

      {/* score + spread (+ criteria) */}
      {shown.length > 0 && avg && (
        <div className="mt-5 grid gap-6 rounded-[20px] bg-gradient-to-br from-[#f1fcfa] to-[#e3f7f3] p-5 sm:grid-cols-[200px_minmax(0,1fr)] sm:p-6">
          <div className="flex flex-col items-start justify-center">
            <div className="text-[52px] font-bold leading-none text-[#0b3b38]">{avg.toFixed(1).replace(".", ",")}</div>
            <div className="mt-2">
              <Stars value={avg} size={18} />
            </div>
            <div className="mt-1.5 text-[13px] text-slate-600">{shown.length} відгуків</div>
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <ul className="flex flex-col gap-1.5" aria-label="Розподіл оцінок">
              {spread.map((s) => (
                <li key={s.n} className="flex items-center gap-3 text-[13px] text-slate-600">
                  <span className="w-3 text-right font-medium">{s.n}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/80">
                    <span className="block h-full rounded-full bg-gradient-to-r from-[#00a89a] to-[#14c4ae]" style={{ width: `${(s.count / most) * 100}%` }} />
                  </span>
                  <span className="w-5 text-right tabular-nums">{s.count}</span>
                </li>
              ))}
            </ul>
            {criteria && criteria.length > 0 && (
              <ul className="flex flex-wrap gap-2" aria-label="Оцінка за критеріями">
                {criteria.map((c) => (
                  <li key={c.label} className="rounded-full bg-white px-3.5 py-1.5 text-[13px] text-slate-700 ring-1 ring-[#cdeee8]">
                    {c.label} <b className="ml-1 text-[#006b65]">{c.value.toFixed(1).replace(".", ",")}</b>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {shown.length > 0 ? (
        <ul className="mt-5 grid gap-4 md:grid-cols-2">
          {shown.map((r) => (
            <li key={r.id} className="flex flex-col rounded-[18px] bg-[#f4fbfa] p-5">
              <div className="flex items-center justify-between gap-3">
                <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-medium ${r.kind === "author" ? "bg-[#d4f3ee] text-[#006b65]" : "bg-white text-slate-600 ring-1 ring-[#cdeee8]"}`}>{KIND_LABEL[r.kind]}</span>
                <Stars value={r.rating} size={14} />
              </div>
              <p className="mt-3 text-[15px] leading-relaxed text-slate-700">{r.text}</p>
              {r.reply && (
                <p className="mt-3 rounded-[12px] bg-white px-3 py-2 text-[14px] leading-relaxed text-slate-600">
                  <span className="font-medium text-slate-700">Відповідь автора: </span>
                  {r.reply}
                </p>
              )}
              <div className="mt-4 flex items-center justify-between gap-3 pt-1 text-[13px] text-slate-500">
                <span className="flex min-w-0 items-center gap-2">
                  <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#d4f3ee] text-[12px] font-semibold text-[#006b65]">
                    {r.name.trim().charAt(0).toUpperCase()}
                  </span>
                  <span className="truncate">{r.name}</span>
                </span>
                <time dateTime={r.date} className="shrink-0">{monthYear(r.date)}</time>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-5 text-[14px] text-slate-500">{filter === "author" ? "Ще немає відгуків про автора." : filter === "guide" ? "Ще немає відгуків про гайд." : "Ще немає відгуків — станьте першим."}</p>
      )}

      {/* who can write, and the form (switched off in the preview) */}
      <div className="mt-6 border-t border-black/5 pt-5">
        <div className="text-[14px] font-medium text-slate-700">Залишити відгук</div>
        <p className="mt-2 rounded-[14px] bg-[#f4fbfa] px-4 py-3 text-[14px] leading-relaxed text-slate-600">Відгук можуть залишити читачі, які розпочали цей гайд. Так оцінки лишаються чесними.</p>
        {demo && (
          <div aria-hidden="true" className="mt-3 flex flex-col gap-3 opacity-60">
            <div className="flex gap-1 text-slate-300">
              {[1, 2, 3, 4, 5].map((n) => (
                <Icon key={n} name="star" size={26} filled />
              ))}
            </div>
            <div className="h-20 rounded-[14px] border border-slate-200 bg-white px-4 py-3 text-[14px] text-slate-400">Розкажіть, що вам допомогло…</div>
            <div className="inline-flex min-h-[44px] w-fit items-center rounded-[14px] bg-slate-200 px-5 text-[14px] font-semibold text-slate-500">Надіслати відгук</div>
          </div>
        )}
      </div>
    </div>
  );
}
