// «Відгуки» tab of the public author profile: a short honest note, one rating
// summary (average + distribution) and the real reviews. Everything comes from
// the author's reviews (summarizeRatings is the single rating calculation, the
// same one the profile header uses). Filter by rating, sort, and the author's
// public reply (the author sees the reply form on their own profile). The review
// model has no tags, so none are shown.
import ReportButton from "../../ReportButton";
import { useEffect, useRef, useState } from "react";
import ConfirmDialog from "./ConfirmDialog";
import { Icon } from "../../ui/Icon";
import Avatar from "../../ui/Avatar";
import { getInitials } from "../../../lib/auth";
import type { AuthorPublicReview } from "../../../lib/authorPublic";
import { filterReviews, formatRating, formatReviewDate, ratingRows, sortReviews, type RatingSummary, type ReviewSort } from "../../../utils/authorProfileView";
import { REVIEW_REPLY_MAX, checkPublicText } from "../../../utils/authorPosts";
import { pluralUk } from "../../../utils/plural";

const FIRST = 5;
const word = (n: number) => pluralUk(n, "відгук", "відгуки", "відгуків");
const starWord = (n: number) => pluralUk(n, "зірка", "зірки", "зірок");

// Five stars, the gold part clipped to the value (4,5 → four and a half).
function Stars({ value, size = 16 }: { value: number; size?: number }) {
  const pct = Math.max(0, Math.min(100, (value / 5) * 100));
  const row = (cls: string) => (
    <span className={`flex gap-0.5 ${cls}`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Icon key={n} name="star" size={size} filled />
      ))}
    </span>
  );
  return (
    <span role="img" aria-label={`Оцінка ${formatRating(value)} з 5`} className="relative inline-flex shrink-0">
      {row("text-black/[0.12]")}
      <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${pct}%` }}>
        {row("text-amber-400")}
      </span>
    </span>
  );
}


// Sort menu: a chip-style button with a small listbox (arrows / Enter / Esc, click outside closes).
const SORT_OPTIONS: { value: ReviewSort | "all"; label: string }[] = [
  { value: "all", label: "Усі" },
  { value: "new", label: "Спочатку нові" },
  { value: "high", label: "Спочатку високі" },
  { value: "low", label: "Спочатку низькі" },
];

function SortMenu({ value, onChange }: { value: ReviewSort | "all"; onChange: (v: ReviewSort | "all") => void }) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const current = SORT_OPTIONS.find((o) => o.value === value) ?? SORT_OPTIONS[0];

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const pick = (v: ReviewSort | "all") => {
    onChange(v);
    setOpen(false);
    root.current?.querySelector<HTMLButtonElement>("button")?.focus();
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Tab" && open) { setOpen(false); return; }
    if (e.key === "Escape" && open) { e.preventDefault(); setOpen(false); return; }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) { setCursor(SORT_OPTIONS.indexOf(current)); setOpen(true); return; }
      setCursor((c) => (c + (e.key === "ArrowDown" ? 1 : -1) + SORT_OPTIONS.length) % SORT_OPTIONS.length);
    } else if ((e.key === "Enter" || e.key === " ") && open) {
      e.preventDefault();
      pick(SORT_OPTIONS[cursor].value);
    }
  };

  return (
    <div ref={root} className="relative inline-flex items-center gap-2 text-[14px] text-black/60" onKeyDown={onKey}>
      <span id="sort-label">Сортування</span>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby="sort-label sort-value"
        aria-controls={open ? "sort-list" : undefined}
        aria-activedescendant={open ? `sort-opt-${cursor}` : undefined}
        onClick={() => { setCursor(SORT_OPTIONS.indexOf(current)); setOpen((v) => !v); }}
        className="inline-flex items-center gap-2 min-h-[44px] pl-4 pr-3 rounded-full border border-black/[0.12] bg-white text-black/85 hover:bg-black/[0.03] focus-visible:outline-2 focus-visible:outline-[#4338ca] transition-colors"
      >
        <span id="sort-value">{current.label}</span>
        <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`text-black/50 transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="m6 9.5 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <ul id="sort-list" role="listbox" aria-labelledby="sort-label" className="absolute right-0 top-full mt-2 z-20 min-w-[210px] rounded-2xl border border-black/[0.08] bg-white p-1.5 shadow-[0_8px_24px_rgba(20,20,60,0.10)]">
          {SORT_OPTIONS.map((o, i) => {
            const on = o.value === current.value;
            return (
              <li
                key={o.value}
                id={`sort-opt-${i}`}
                role="option"
                aria-selected={on}
                onMouseEnter={() => setCursor(i)}
                onClick={() => pick(o.value)}
                className={`flex items-center justify-between gap-3 min-h-[44px] px-3.5 rounded-xl cursor-pointer text-[14px] ${
                  cursor === i ? "bg-[#f3f2fd]" : ""
                } ${on ? "text-[#4338ca] font-semibold" : "text-black/80"}`}
              >
                {o.label}
                {on && (
                  <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m5 12.5 4.5 4.5L19 7.5" />
                  </svg>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

type Reply = { text: string | null; at: string | null };

export default function AuthorReviews({
  reviews,
  summary,
  canReply = false,
  onSaveReply,
  viewerId = null,
}: {
  // signed-in viewer → "Поскаржитися" on a review
  viewerId?: string | null;
  reviews: AuthorPublicReview[];
  summary: RatingSummary;
  // the author looks at their own profile: they can answer reviews
  canReply?: boolean;
  onSaveReply?: (reviewId: string, reply: string | null) => Promise<void>;
}) {
  const [all, setAll] = useState(false);
  const [stars, setStars] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<ReviewSort | "all">("all");
  const sort: ReviewSort = sortKey === "all" ? "new" : sortKey;
  // replies written in this session, on top of what was loaded
  const [local, setLocal] = useState<Record<string, Reply>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const replyOf = (r: AuthorPublicReview): Reply => local[r.id] ?? { text: r.authorReply ?? null, at: r.authorReplyAt ?? null };
  const list = sortReviews(filterReviews(reviews, stars), sort);
  const shown = all ? list : list.slice(0, FIRST);
  const rows = ratingRows(summary);

  const save = async (id: string, text: string | null) => {
    if (!onSaveReply || busy) return;
    if (text !== null) {
      const check = checkPublicText(text, REVIEW_REPLY_MAX);
      if (!check.ok) return setNotice(check.message);
    }
    setBusy(true);
    setNotice(null);
    try {
      await onSaveReply(id, text);
      setLocal((l) => ({ ...l, [id]: { text: text ? text.trim() : null, at: text ? new Date().toISOString() : null } }));
      setEditing(null);
      setDeleting(null);
    } catch {
      setNotice("Не вдалося зберегти відповідь. Спробуйте ще раз.");
      setDeleting(null);
    } finally {
      setBusy(false);
    }
  };

  const chip = (on: boolean) =>
    `inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-full border text-[14px] transition-colors ${
      on ? "border-[#4338ca]/30 bg-[#eef0fd] text-[#4338ca] font-semibold" : "border-black/[0.12] bg-white text-black/70 hover:bg-black/[0.04] hover:text-black"
    }`;

  return (
    <div className="max-w-[860px] flex flex-col gap-6">
      <div>
        <h2 id="h-reviews" className="text-[24px] font-bold tracking-tight leading-tight">
          Відгуки
        </h2>
        <p className="mt-3 flex gap-2.5 text-[14px] leading-relaxed text-black/60 ">
          <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" className="mt-[3px] shrink-0 text-black/40"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>
          <span>
            Відгуки залишають учасники після роботи з матеріалами автора. Ми не перевіряємо їх незалежно, але дбаємо про безпечний і коректний тон спілкування.
          </span>
        </p>
      </div>

      {summary.count === 0 ? (
        <div className="rounded-2xl border border-black/[0.06] bg-white px-6 py-10 text-center">
          <span className="mx-auto w-11 h-11 rounded-full bg-[#eef0fd] text-[#4338ca] flex items-center justify-center">
            <Icon name="comment" size={20} />
          </span>
          <div className="mt-4 text-[16px] font-medium">Відгуків поки немає</div>
          <p className="mt-1 mx-auto max-w-[400px] text-[14px] leading-relaxed text-black/60">
            Вони з’являться, коли учасники поділяться своїм досвідом роботи з матеріалами автора.
          </p>
        </div>
      ) : (
        <>
          <section aria-label="Підсумок оцінок" className="rounded-2xl border border-black/[0.06] bg-white p-5 sm:p-6 grid gap-6 sm:grid-cols-[220px_1fr] sm:gap-0">
            <div className="sm:pr-6 sm:border-r sm:border-black/[0.08] flex flex-col justify-center gap-2">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-[32px] font-bold leading-none tracking-tight">{formatRating(summary.average)}</span>
                <Stars value={summary.average} size={18} />
              </div>
              <div className="text-[14px] text-black/60">
                {summary.count} {word(summary.count)}
              </div>
            </div>
            <ul aria-label="Розподіл оцінок" className="sm:pl-6 flex flex-col gap-2.5 justify-center">
              {rows.map((r) => (
                <li key={r.stars} className="grid grid-cols-[44px_1fr_28px] items-center gap-3 text-[14px]">
                  <span className="flex items-center gap-1 text-black/70">
                    <span aria-hidden>{r.stars}</span>
                    <Icon name="star" size={13} filled className="text-amber-400" />
                    <span className="sr-only">
                      {r.stars} {starWord(r.stars)}:
                    </span>
                  </span>
                  <span aria-hidden className="h-2 rounded-full bg-[#eceefb] overflow-hidden">
                    <span className="block h-full rounded-full bg-[#b9b6f2]" style={{ width: `${r.percent}%` }} />
                  </span>
                  <span className="text-right tabular-nums text-black/70">
                    {r.count}
                    <span className="sr-only"> {word(r.count)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {summary.count > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div role="group" aria-label="Фільтр за оцінкою" className="flex flex-wrap gap-2">
                <button aria-pressed={stars === null} onClick={() => { setStars(null); setAll(false); }} className={chip(stars === null)}>
                  Усі <span className="text-[12px]">{summary.count}</span>
                </button>
                {rows.filter((r) => r.count > 0).map((r) => (
                  <button key={r.stars} aria-pressed={stars === r.stars} onClick={() => { setStars(r.stars); setAll(false); }} className={chip(stars === r.stars)}>
                    {r.stars}
                    <Icon name="star" size={13} filled className="text-amber-400" />
                    <span className="sr-only">{starWord(r.stars)}</span>
                    <span className="text-[12px]">{r.count}</span>
                  </button>
                ))}
              </div>
              <SortMenu value={sortKey} onChange={(v) => { setSortKey(v); setAll(false); }} />
            </div>
          )}

          <ul className="flex flex-col gap-3">
            {shown.map((r) => (
              <li key={r.id} className="rounded-2xl border border-black/[0.06] bg-white p-5 sm:p-6">
                <div className="flex items-start gap-3">
                  <Avatar avatarUrl={r.reviewerAvatarUrl ?? null} initials={getInitials(r.reviewerName)} className="w-11 h-11 text-[14px] text-white shrink-0" />
                  <div className="min-w-0 flex-1 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                    <div className="min-w-0">
                      <div className="text-[16px] font-semibold leading-tight text-black/90 break-words">{r.reviewerName}</div>
                      <time dateTime={r.createdAt} className="text-[14px] text-black/60">
                        {formatReviewDate(r.createdAt)}
                      </time>
                    </div>
                    <div className="flex items-center gap-2 text-[14px] tabular-nums text-black/70">
                      <Stars value={r.rating} size={14} />
                      <span aria-hidden>{formatRating(r.rating)}</span>
                    </div>
                  </div>
                </div>
                <p className="mt-3 text-[16px] leading-[1.7] text-black/75 whitespace-pre-line break-words">{r.text}</p>
                <div className="mt-1 -mb-2 flex justify-end">
                  <ReportButton type="review" targetId={r.id} ownerId={null} label={`Відгук від ${r.reviewerName}`} viewerId={viewerId} />
                </div>
                {(() => {
                  const rep = replyOf(r);
                  if (editing === r.id) {
                    return (
                      <div className="mt-4">
                        <label className="block text-[14px] font-medium text-black/70" htmlFor={`reply-${r.id}`}>
                          Ваша відповідь
                        </label>
                        <textarea
                          id={`reply-${r.id}`}
                          value={draft}
                          rows={3}
                          maxLength={REVIEW_REPLY_MAX}
                          onChange={(e) => { setDraft(e.target.value); setNotice(null); }}
                          className="mt-1.5 w-full rounded-xl border border-black/[0.12] bg-white p-3.5 text-[16px] sm:text-[14px] resize-none focus:outline-none focus:border-black/30"
                        />
                        <div className="mt-1 text-right text-[12px] text-black/55">{draft.trim().length} / {REVIEW_REPLY_MAX}</div>
                        {notice && <div role="alert" className="text-[14px] text-rose-600 mt-1">{notice}</div>}
                        <div className="mt-2 flex gap-2">
                          <button onClick={() => save(r.id, draft)} disabled={busy || !draft.trim()} className="min-h-[44px] px-5 rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-white text-[14px] font-medium disabled:opacity-40">
                            {busy ? "Зберігаємо…" : "Опублікувати"}
                          </button>
                          <button onClick={() => { setEditing(null); setNotice(null); }} className="min-h-[44px] px-4 rounded-xl border border-black/[0.12] text-[14px] text-black/70 hover:bg-black/[0.04]">
                            Скасувати
                          </button>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <>
                      {rep.text && (
                        <div className="mt-4 rounded-xl bg-[#f6f5fe] border border-[#4338ca]/10 p-4">
                          <div className="flex flex-wrap items-center gap-x-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-[#4338ca]">
                            Відповідь автора
                            {rep.at && <time dateTime={rep.at} className="font-normal normal-case tracking-normal text-black/55">· {formatReviewDate(rep.at)}</time>}
                          </div>
                          <p className="mt-1.5 text-[14px] leading-relaxed text-black/75 whitespace-pre-line break-words">{rep.text}</p>
                        </div>
                      )}
                      {canReply && (
                        <div className="mt-2 flex gap-4">
                          <button onClick={() => { setEditing(r.id); setDraft(rep.text ?? ""); setNotice(null); }} className="min-h-[44px] text-[14px] font-medium text-[#4338ca] hover:underline underline-offset-4">
                            {rep.text ? "Редагувати відповідь" : "Відповісти"}
                          </button>
                          {rep.text && (
                            <button onClick={() => setDeleting(r.id)} className="min-h-[44px] text-[14px] text-black/60 hover:text-rose-600">
                              Видалити
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  );
                })()}
              </li>
            ))}
          </ul>
          {!all && list.length > FIRST && (
            <button onClick={() => setAll(true)} className="self-start min-h-[44px] text-[14px] font-medium text-[#4338ca] hover:underline underline-offset-4">
              Показати всі відгуки ({list.length})
            </button>
          )}
        </>
      )}
      {deleting && (
        <ConfirmDialog
          title="Видалити відповідь?"
          text="Відповідь зникне з відгуку. Цю дію не можна скасувати."
          confirmLabel="Видалити"
          busy={busy}
          onConfirm={() => save(deleting, null)}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
