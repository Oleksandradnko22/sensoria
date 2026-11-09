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
  return (
    <span className={`${wide ? "flex w-full" : "inline-flex"} flex-col gap-1 ${className}`}>
      <span
        className={`w-fit rounded-full px-2.5 py-0.5 text-[12px] font-medium ${
          dark ? "bg-white/15 text-white" : educationVerified ? "bg-[#eef2ff] text-[#4338ca]" : "bg-black/5 text-black/70"
        }`}
      >
        {educationVerified ? "Фахівець · документи про освіту переглянуто" : "Авторські освітні матеріали"}
      </span>
      {showNote && (
        <span className={`text-[12px] leading-relaxed ${wide ? "" : "max-w-[52ch]"} ${dark ? "text-white/70" : "text-black/60"}`}>
          {educationVerified ? KIND_NOTE_SPECIALIST : KIND_NOTE_AUTHOR}
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
