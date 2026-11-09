import { useMemo, useState } from "react";
import { Icon } from "../ui/Icon";
import type { Profile } from "../../lib/auth";
import type { ReviewRow } from "../../lib/reviews";
import type { AuthorPublicReview } from "../../lib/authorPublic";
import { averageRating } from "../../utils/programDetail";
import { shortName } from "../../utils/authorProfileView";
import { AuthorRatingForm, ContentReviewForm } from "./ProgramReviewForms";

type Kind = "program" | "author";
type Filter = "all" | Kind;

type Item = { key: string; domId?: string; kind: Kind; rating: number; text: string; name: string; at: string; reply?: string | null };

const KIND_LABEL: Record<Kind, string> = { program: "Про курс", author: "Про автора" };

type Props = {
  programId: string;
  authorId: string | null | undefined;
  reviews: ReviewRow[];
  authorReviews: AuthorPublicReview[];
  session?: Profile | null;
  // false for the author themself / when the author has left: no way to rate the author
  canRateAuthor: boolean;
  // Reviews (about the course and about the author) are written by people who joined the program.
  enrolled: boolean;
  onRequireLogin: () => void;
  onSaved: () => void;
};

// One list for everything people wrote: about the program and about its author, with a
// filter (Усі / Про курс / Про автора) and one form where the reviewer picks what it is about.
export default function ProgramReviewsPanel({ programId, authorId, reviews, authorReviews, session, canRateAuthor, enrolled, onRequireLogin, onSaved }: Props) {
  const isParticipant = session?.role === "participant";
  const blocked = isParticipant && !enrolled;
  const [filter, setFilter] = useState<Filter>("all");
  const [formKind, setFormKind] = useState<Kind>("program");

  const items = useMemo<Item[]>(() => {
    const a: Item[] = reviews.map((r) => ({ key: `p-${r.id}`, domId: `review-${r.id}`, kind: "program", rating: r.rating, text: r.text, name: r.participantName === "Учасник Sensoria" ? r.participantName : shortName(r.participantName), at: r.createdAt, reply: r.authorReply }));
    const b: Item[] = authorReviews.map((r) => ({ key: `a-${r.id}`, kind: "author", rating: r.rating, text: r.text, name: r.reviewerName, at: r.createdAt, reply: r.authorReply }));
    return [...a, ...b].sort((x, y) => (x.at < y.at ? 1 : -1));
  }, [reviews, authorReviews]);

  const counts = { all: items.length, program: reviews.length, author: authorReviews.length };
  const shown = filter === "all" ? items : items.filter((i) => i.kind === filter);
  const avg = averageRating(shown.map((i) => i.rating));
  const showFilter = !!authorId;
  const canChooseKind = !!authorId && canRateAuthor;
  const kind: Kind = canChooseKind ? formKind : "program";

  const pill = (id: Filter, label: string) => (
    <button
      key={id}
      type="button"
      role="tab"
      aria-selected={filter === id}
      onClick={() => setFilter(id)}
      className={`min-h-[40px] rounded-full border px-4 text-[14px] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4338ca] ${
        filter === id ? "border-[#4338ca]/30 bg-[#eef0fd] font-semibold text-[#4338ca]" : "border-black/[0.12] bg-white text-black/65 hover:bg-black/[0.04]"
      }`}
    >
      {label} <span className="text-[12px] opacity-70">{counts[id]}</span>
    </button>
  );

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="pd-reviews" className="text-[22px] font-semibold">Відгуки</h2>
        {avg && (
          <span className="inline-flex items-center gap-1.5 text-[15px] font-medium">
            <Icon name="star" size={14} filled /> {avg}
            <span className="text-[13px] font-normal text-slate-500">({shown.length})</span>
          </span>
        )}
      </div>

      {showFilter && (
        <div role="tablist" aria-label="Фільтр відгуків" className="mt-4 flex flex-wrap gap-2">
          {pill("all", "Усі")}
          {pill("program", "Про курс")}
          {pill("author", "Про автора")}
        </div>
      )}

      {shown.length > 0 ? (
        <ul className="mt-4 grid gap-4 md:grid-cols-2">
          {shown.map((r) => (
            <li key={r.key} id={r.domId} className="rounded-[18px] bg-[#f5f7ff] p-5">
              {showFilter && (
                <span className={`mb-2 inline-block rounded-full px-2.5 py-0.5 text-[12px] font-medium ${r.kind === "author" ? "bg-[#ece9fd] text-[#4338ca]" : "bg-white text-slate-600 ring-1 ring-[#e0e6fb]"}`}>
                  {KIND_LABEL[r.kind]}
                </span>
              )}
              <p className="text-[15px] leading-relaxed text-slate-700">{r.text}</p>
              {r.reply && (
                <p className="mt-3 rounded-[12px] bg-white px-3 py-2 text-[14px] leading-relaxed text-slate-600">
                  <span className="font-medium text-slate-700">Відповідь автора: </span>
                  {r.reply}
                </p>
              )}
              <div className="mt-4 flex items-center justify-between gap-3 text-[13px] text-slate-500">
                <span className="truncate">{r.name}</span>
                <span className="shrink-0 text-amber-500" role="img" aria-label={`Оцінка ${r.rating} з 5`}>
                  {"★".repeat(r.rating)}
                  <span className="text-black/15">{"★".repeat(5 - r.rating)}</span>
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-[14px] text-slate-500">
          {!authorId ? "Відгуків поки немає." : filter === "author" ? "Ще немає відгуків про автора." : filter === "program" ? "Ще немає відгуків про курс." : "Ще немає відгуків — станьте першим."}
        </p>
      )}

      {authorId && (
        <div className="mt-6 border-t border-black/5 pt-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-[14px] font-medium text-slate-700">Залишити відгук</div>
            {canChooseKind && !blocked && (
              <div role="radiogroup" aria-label="Про що відгук" className="inline-flex rounded-full bg-[#f1f3fb] p-1">
                {(["program", "author"] as Kind[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={formKind === k}
                    onClick={() => setFormKind(k)}
                    className={`min-h-[36px] rounded-full px-4 text-[13px] font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4338ca] ${
                      formKind === k ? "bg-white text-[#3730a3] shadow-sm" : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {KIND_LABEL[k]}
                  </button>
                ))}
              </div>
            )}
          </div>
          {blocked ? (
            <p className="rounded-[14px] bg-[#f5f7ff] px-4 py-3 text-[14px] text-slate-600">
              Відгук можуть залишити учасники програми. Розпочніть програму, щоб поділитися враженнями.
            </p>
          ) : kind === "program" ? (
            <ContentReviewForm key="p" programId={programId} session={session} onRequireLogin={onRequireLogin} onSaved={onSaved} />
          ) : (
            <AuthorRatingForm key="a" authorId={authorId} session={session} onRequireLogin={onRequireLogin} onSaved={onSaved} />
          )}
        </div>
      )}
    </>
  );
}
