// How an author is labelled for the public. Only what Sensoria actually did:
//  * «Фахівець» — Sensoria reviewed the author's education documents.
//    It does NOT say the qualification or experience was verified.
//  * «Автор» — own educational content; no qualification claimed by Sensoria.
// Experience is always «вказано автором».
import { useEffect, useState } from "react";
import { fetchAuthorDetails } from "../../lib/authorDetails";

export const KIND_NOTE_SPECIALIST =
  "Sensoria переглянула документи автора про освіту. Це не гарантія результату й не перевірка досвіду, який автор вказав сам.";
export const KIND_NOTE_AUTHOR =
  "Sensoria не перевіряла професійну кваліфікацію автора. Матеріали мають освітній характер і не замінюють консультацію психолога, психотерапевта чи лікаря.";

export default function AuthorKindBadge({
  educationVerified,
  showNote = false,
  dark = false,
  className = "",
  wide = false,
}: {
  educationVerified: boolean;
  showNote?: boolean;
  dark?: boolean;
  className?: string;
  // Note spans the full width of its container instead of a reading-width cap.
  wide?: boolean;
}) {
  // the note is not printed on the page: it opens on hover, or on tap / keyboard focus of the badge
  const note = educationVerified ? KIND_NOTE_SPECIALIST : KIND_NOTE_AUTHOR;
  return (
    <span className={`group relative ${wide ? "flex w-full" : "inline-flex"} ${className}`}>
      <span
        tabIndex={showNote ? 0 : undefined}
        aria-label={showNote ? `${educationVerified ? "Фахівець" : "Авторські освітні матеріали"}. ${note}` : undefined}
        className={`inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50 ${showNote ? "cursor-help" : ""} ${
          dark ? "bg-white/15 text-white" : educationVerified ? "bg-[#eef2ff] text-[#4338ca]" : "bg-black/5 text-black/70"
        }`}
      >
        {educationVerified ? "Фахівець · документи про освіту переглянуто" : "Авторські освітні матеріали"}
        {showNote && <span aria-hidden="true" className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-current text-[9px] font-bold opacity-60">i</span>}
      </span>
      {showNote && (
        <span role="tooltip" className="pointer-events-none absolute left-0 top-full z-30 mt-1.5 hidden w-[min(320px,80vw)] rounded-xl bg-[#1d1a3b] px-3 py-2.5 text-[12px] font-normal leading-relaxed text-white shadow-[0_14px_30px_-12px_rgba(20,16,60,0.5)] group-hover:block group-focus-within:block">
          {note}
        </span>
      )}
    </span>
  );
}

// For places that only know the author's id (program card / modal).
export function AuthorKindBadgeById({ authorId, showNote = false, dark = false, className = "" }: { authorId: string; showNote?: boolean; dark?: boolean; className?: string }) {
  const [verified, setVerified] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    fetchAuthorDetails(authorId)
      .then((d) => alive && setVerified(d.educationVerified))
      .catch(() => alive && setVerified(null));
    return () => {
      alive = false;
    };
  }, [authorId]);
  if (verified === null) return null;
  return <AuthorKindBadge educationVerified={verified} showNote={showNote} dark={dark} className={className} />;
}
