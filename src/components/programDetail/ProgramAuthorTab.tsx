import { useEffect, useState, type ReactNode } from "react";
import AuthorAbout from "../author/public/AuthorAbout";
import AuthorKindBadge, { KIND_NOTE_SPECIALIST } from "../author/AuthorKindBadge";
import { peekAuthorProfile, prefetchAuthorProfile, type AuthorPublicProfile } from "../../lib/authorPublic";
import { getInitials } from "../../lib/auth";
import { formatSinceMonth } from "../../utils/authorProfileView";
import type { Program } from "../../data/programs";

type Kind = "program" | "meditation" | "guide";

// "Автор" tab: the SAME «Про автора» component the public author profile uses
// (one source of truth), loaded only when the tab is opened. Programs without
// a real author account (demo content) get a short name-only card.
export default function ProgramAuthorTab({ program, onOpenProfile, afterHeader }: { program: Pick<Program, "authorId" | "author">; onOpenProfile: () => void; afterHeader?: ReactNode }) {
  const authorId = program.authorId;
  // Opens from the cache when the data was loaded before (no flash of a skeleton); refreshes quietly.
  const cached = authorId ? peekAuthorProfile(authorId) : undefined;
  const [data, setData] = useState<AuthorPublicProfile | null>(cached ?? null);
  const [state, setState] = useState<"loading" | "ready" | "error">(cached ? "ready" : "loading");

  useEffect(() => {
    if (!authorId) return;
    let cancelled = false;
    if (!peekAuthorProfile(authorId)) setState("loading");
    prefetchAuthorProfile(authorId)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setState(d ? "ready" : "error");
      })
      .catch(() => !cancelled && setState("error"));
    return () => {
      cancelled = true;
    };
  }, [authorId]);

  const name = data?.name ?? program.author;

  const header = (
    <div className="flex min-w-0 flex-1 items-start gap-4">
      <div aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#0057ff] to-[#7b2cff] text-[20px] font-semibold text-white">
        {(name || "?").trim().charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[18px] font-semibold">{name}</div>
        {data?.details.title && <div className="mt-0.5 text-[14px] text-slate-500">{data.details.title}</div>}
        {data && <AuthorKindBadge educationVerified={data.details.educationVerified} showNote wide className="mt-2" />}
      </div>
    </div>
  );

  if (!authorId) return header;

  const profileButton = (
    <button
      type="button"
      onClick={onOpenProfile}
      className="min-h-[44px] rounded-[14px] border border-[#dbe4ff] px-5 text-[14px] font-medium text-[#4338ca] transition hover:bg-[#f8faff] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4338ca]"
    >
      Повний профіль автора →
    </button>
  );

  if (state === "loading") {
    return (
      <div role="status" aria-label="Завантажуємо інформацію про автора" className="flex animate-pulse flex-col gap-5">
        <div className="flex gap-2">
          <div className="h-11 w-28 rounded-full bg-slate-100" />
          <div className="h-11 w-40 rounded-full bg-slate-100" />
        </div>
        <div className="h-12 rounded-[16px] bg-slate-100" />
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-full bg-slate-100" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-40 rounded bg-slate-100" />
            <div className="h-3 w-56 rounded bg-slate-100" />
          </div>
        </div>
        <div className="space-y-2">
          <div className="h-3 w-full rounded bg-slate-100" />
          <div className="h-3 w-11/12 rounded bg-slate-100" />
          <div className="h-3 w-2/3 rounded bg-slate-100" />
        </div>
      </div>
    );
  }
  if (state === "error" || !data) {
    return (
      <div className="flex flex-col items-start gap-4">
        {header}
        {afterHeader && <div className="w-full">{afterHeader}</div>}
        {profileButton}
      </div>
    );
  }

  const count = (k: Kind) => data.content.filter((c) => c.kind === k).length;

  // Trust label + the platform's note: one quiet info block (icon, label as its title, note under it).
  const verified = data.details.educationVerified;
  const notice = (
    <div role="note" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[16px] bg-[#f6f7ff] px-4 py-3 ring-1 ring-[#e6eaf8] sm:px-5">
      <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#e9e6fc] text-[#4338ca]">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5M12 8h.01" />
        </svg>
      </span>
      <span className="text-[14px] font-semibold text-slate-900">{verified ? "Фахівець · документи про освіту переглянуто" : "Авторські освітні матеріали"}</span>
      <span aria-hidden="true" className="hidden h-4 w-px bg-slate-300 sm:block" />
      <span className="min-w-0 text-[14px] text-slate-600">{verified ? KIND_NOTE_SPECIALIST : "Sensoria не перевіряла професійну кваліфікацію автора."}</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <AuthorAbout
        wide
        tabsAside={afterHeader}
        belowTabs={notice}
        seed={data.id}
        name={data.name}
        initials={getInitials(data.name)}
        avatarUrl={data.avatarUrl}
        role={data.details.title}
        story={data.story}
        bio={data.details.bio}
        approach={data.details.approach}
        credentials={data.credentials}
        experience={data.experience}
        cases={data.cases}
        content={data.content}
        counts={{ program: count("program"), meditation: count("meditation"), guide: count("guide") }}
        onOpenKind={onOpenProfile}
        onOpenContent={onOpenProfile}
        site={data.details.site}
        instagram={data.details.instagram}
        since={formatSinceMonth(data.memberSince)}
      />
      <div>{profileButton}</div>
    </div>
  );
}
