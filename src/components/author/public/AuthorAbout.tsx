// "Про автора": «Про мене» (the introduction page — see AuthorMe), «Освіта та
// досвід» (education, certificates, experience — AuthorEducation) and, when the
// author wrote any, «Кейси». Only sub-tabs that have real data exist.
import { useRef, useState, type ReactNode } from "react";
import type { AuthorCase, AuthorCredential, AuthorExperience } from "../../../utils/authorCredentials";
import type { AuthorContentItem } from "../../../utils/authorProfileView";
import { hasStory, type AuthorStory } from "../../../utils/authorStory";
import AuthorMe from "./AuthorMe";
import AuthorEducation from "./AuthorEducation";
import CaseCard, { CASE_NOTICE_LINES } from "./CaseCard";
import { backgroundFacts } from "../../../utils/authorFacts";

type TabId = "me" | "edu" | "cases";
type Kind = AuthorContentItem["kind"];

type Props = {
  seed: string;
  name: string;
  initials: string;
  avatarUrl: string | null;
  role: string;
  story: AuthorStory;
  bio: string;
  approach: string;
  credentials: AuthorCredential[];
  experience: AuthorExperience[];
  cases: AuthorCase[];
  content: AuthorContentItem[];
  counts: Record<Kind, number>;
  onOpenKind: (k: Kind) => void;
  onOpenContent: (kind: Kind, id: string) => void;
  site: string;
  instagram: string;
  since: string; // "серпня 2026" or ""
  // Fill the whole width of the container (program page's «Автор» tab) instead of the profile's reading-width cap.
  wide?: boolean;
  // Program page only: something placed level with the sub-tab pills (on their right), and a block under that row.
  tabsAside?: ReactNode;
  belowTabs?: ReactNode;
};


export default function AuthorAbout(p: Props) {
  const hasMe = !!(p.bio || p.approach || hasStory(p.story) || backgroundFacts({ credentials: p.credentials, experience: p.experience, year: new Date().getFullYear() }).length);
  const hasEdu = p.credentials.length + p.experience.length > 0;
  const tabs: { id: TabId; label: string; n?: number }[] = [];
  if (hasMe) tabs.push({ id: "me", label: "Про мене" });
  if (hasEdu) tabs.push({ id: "edu", label: "Освіта та досвід" });
  if (p.cases.length) tabs.push({ id: "cases", label: "Кейси", n: p.cases.length });

  const [picked, setPicked] = useState<TabId | null>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const active = tabs.find((t) => t.id === picked)?.id ?? tabs[0]?.id;

  if (!tabs.length) return <p className="text-[14px] text-black/55">Автор ще не додав опис.</p>;

  const byKey = new Map(p.content.map((c) => [`${c.kind}:${c.id}`, c]));

  return (
    <div className={`${p.wide ? "w-full" : active === "me" || active === "edu" ? "max-w-[860px]" : "max-w-[760px]"} flex flex-col gap-7`}>
      {(tabs.length > 1 || p.tabsAside) && (
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      {tabs.length > 1 ? (
        <div role="tablist" aria-label="Розділи «Про автора»" className="flex flex-wrap gap-2">
          {tabs.map((t) => {
            const on = t.id === active;
            return (
              <button
                key={t.id}
                ref={(el) => { tabRefs.current[t.id] = el; }}
                id={`about-tab-${t.id}`}
                role="tab"
                aria-selected={on}
                aria-controls="about-panel"
                tabIndex={on ? 0 : -1}
                onClick={() => setPicked(t.id)}
                onKeyDown={(e) => {
                  const k = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : e.key === "Home" ? "first" : e.key === "End" ? "last" : 0;
                  if (!k) return;
                  e.preventDefault();
                  const at = tabs.findIndex((x) => x.id === t.id);
                  const next = tabs[k === "first" ? 0 : k === "last" ? tabs.length - 1 : (at + k + tabs.length) % tabs.length];
                  setPicked(next.id);
                  tabRefs.current[next.id]?.focus();
                }}
                className={`inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-full border text-[14px] transition-colors ${
                  on ? "border-[#4338ca]/30 bg-[#eef0fd] text-[#4338ca] font-semibold" : "border-black/[0.12] bg-white text-black/65 hover:bg-black/[0.04] hover:text-black"
                }`}
              >
                {t.label}
                {t.n !== undefined && <span className={`text-[12px] ${on ? "text-[#4338ca]/80" : "text-black/55"}`}>{t.n}</span>}
              </button>
            );
          })}
        </div>
      ) : <span />}
      {p.tabsAside && <div className="shrink-0">{p.tabsAside}</div>}
      </div>
      )}
      {p.belowTabs}

      <div id="about-panel" role={tabs.length > 1 ? "tabpanel" : undefined} aria-labelledby={tabs.length > 1 ? `about-tab-${active}` : undefined} className="flex flex-col gap-7">
      {active === "me" && (
        <AuthorMe
          seed={p.seed}
          name={p.name}
          initials={p.initials}
          avatarUrl={p.avatarUrl}
          role={p.role}
          approach={p.approach}
          bio={p.bio}
          story={p.story}
          credentials={p.credentials}
          experience={p.experience}
          counts={p.counts}
          onOpenKind={p.onOpenKind}
        />
      )}

      {active === "edu" && <AuthorEducation credentials={p.credentials} experience={p.experience} />}

      {active === "cases" && (
        <section aria-label="Кейси">
          <p className="text-[14px] text-black/55 mb-5">
            {CASE_NOTICE_LINES.map((l, i) => (
              <span key={i} className="block">{l}</span>
            ))}
          </p>
          <ul className="flex flex-col gap-4">
            {p.cases.map((c) => (
              <li key={c.id}>
                <CaseCard c={c} linked={c.contentKind && c.contentId ? byKey.get(`${c.contentKind}:${c.contentId}`) : undefined} onOpenContent={p.onOpenContent as never} />
              </li>
            ))}
          </ul>
        </section>
      )}
      </div>

      {p.since && (
        <div className="pt-2 text-[12px] text-black/55 flex flex-col gap-1">
          {p.since && <span>На Sensoria з {p.since}</span>}
        </div>
      )}
    </div>
  );
}
