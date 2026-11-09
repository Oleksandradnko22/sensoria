// «Освіта та досвід»: its own sub-tab of «Про автора», two separate blocks:
// «Освіта» (education, courses and certificates, each with the document the
// author uploaded, when there is one) and «Професійний досвід».
// Everything is what the author made public; nothing is invented.
import { parseExperienceText, periodLabel, periodLines, plainTitle, sortCredentials, sortExperience, type AuthorCredential, type AuthorExperience } from "../../../utils/authorCredentials";
import CredentialTimeline, { TimelineRail } from "./CredentialList";
import { PT } from "./profileType";

const CARD = "relative overflow-hidden rounded-2xl border border-black/[0.08] bg-white px-5 sm:px-8 py-6 sm:py-8";

// where the information comes from: an info mark, no colour or bold
function SourceNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 flex gap-3 py-0.5 text-[14px] leading-relaxed text-black/60">
      <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" className="mt-[3px] shrink-0 text-black/55"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>
      <span className="min-w-0">{children}</span>
    </p>
  );
}

export default function AuthorEducation({ credentials, experience }: { credentials: AuthorCredential[]; experience: AuthorExperience[] }) {
  const sorted = sortCredentials(credentials);
  const docs = sorted;
  const groups = [
    { id: "education", title: "Вища освіта", items: sorted.filter((c) => c.kind === "education") },
    { id: "training", title: "Курси", items: sorted.filter((c) => c.kind === "training") },
    { id: "certificate", title: "Сертифікати", items: sorted.filter((c) => c.kind === "certificate") },
  ].filter((g) => g.items.length > 0);
  const exp = sortExperience(experience);
  // the period column exists only while someone has dates
  const anyPeriod = exp.some((e) => periodLabel(e) !== "");
  if (docs.length + exp.length === 0) return null;
  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      {docs.length > 0 && (
        <section aria-labelledby="me-edu" className={CARD}>
          <div className="relative">
            <h3 id="me-edu" className={`${PT.display} text-black/90`}>Освіта та кваліфікація</h3>
            {/* the origin of the documents: set apart by an info mark, no colour or bold */}
            <SourceNote>Інформацію та документи надав автор. Наявність документа не означає, що Sensoria незалежно підтвердила його автентичність.</SourceNote>
          </div>
          {/* sub-blocks: only the kinds the author actually has */}
          <div className="relative mt-6 flex flex-col">
            {groups.map((g, i) => (
              <div key={g.id} aria-labelledby={`me-edu-${g.id}`} role="group" className={i > 0 ? "mt-7 pt-7 border-t border-black/[0.08]" : ""}>
                <h4 id={`me-edu-${g.id}`} className="text-[12px] font-semibold uppercase tracking-[0.12em] text-black/55 mb-4">{g.title}</h4>
                <CredentialTimeline items={g.items} />
              </div>
            ))}
          </div>
        </section>
      )}

      {exp.length > 0 && (
        <section aria-labelledby="me-exp" className={CARD}>
          <div className="relative">
            <h3 id="me-exp" className={`${PT.display} text-black/90`}>Професійний досвід</h3>
            <SourceNote>Досвід і місця роботи вказав автор. Sensoria окремо не перевіряє ці відомості.</SourceNote>
          </div>
          <ol className="relative mt-5">
            {exp.map((e, i) => {
              const period = periodLabel(e);
              const lines = periodLines(e);
              const title = plainTitle(e.role || e.organization);
              const org = plainTitle(e.organization);
              const { text, areas } = parseExperienceText(e.description);
              const hasAreas = areas.length > 0;
              return (
                <li
                  key={e.id}
                  className={`grid grid-cols-[16px_minmax(0,1fr)] gap-x-4 py-5 sm:gap-x-4 ${
                    anyPeriod
                      ? hasAreas ? "sm:grid-cols-[84px_16px_minmax(0,1fr)_minmax(0,300px)]" : "sm:grid-cols-[84px_16px_minmax(0,1fr)]"
                      : hasAreas ? "sm:grid-cols-[16px_minmax(0,1fr)_minmax(0,300px)]" : "sm:grid-cols-[16px_minmax(0,1fr)]"
                  } ${i > 0 ? "" : "pt-0"} ${i === exp.length - 1 ? "pb-0" : ""}`}
                >
                  {/* period, left (above the position on mobile) */}
                  {anyPeriod && <div aria-label={period} className="hidden sm:block pt-1 text-[20px] font-semibold leading-[1.15] tracking-tight tabular-nums text-black/20">{lines.map((l, k) => <div key={k} aria-hidden className="whitespace-nowrap">{l}</div>)}</div>}
                  <div className={`col-start-1 row-span-3 row-start-1 flex ${anyPeriod ? "sm:col-start-2" : "sm:col-start-1"} sm:row-span-1 sm:row-start-1`}>
                    <TimelineRail first={i === 0} last={i === exp.length - 1} always pad={20} dot={[4, 8]} />
                  </div>
                  {/* the position, the organisation and a short description */}
                  <div className={`min-w-0 col-start-2 row-start-1 ${anyPeriod ? "sm:col-start-3" : "sm:col-start-2"}`}>
                    {period && <div className="sm:hidden mb-0.5 text-[12px] tabular-nums text-black/55">{period}</div>}
                    <div className="text-[20px] font-semibold leading-snug tracking-tight text-black/90 break-words">{title}</div>
                    {e.role && org && <div className="mt-0.5 text-[14px] text-black/60 break-words">{org}</div>}
                    {text && <p className="mt-2 max-w-[56ch] text-[14px] leading-[1.6] text-black/65 break-words">{text}</p>}
                  </div>
                  {/* main areas of work, as quiet tags */}
                  {hasAreas && (
                    <div className={`min-w-0 col-start-2 row-start-2 mt-3 sm:row-start-1 sm:mt-0 sm:border-l sm:border-black/[0.07] sm:pl-5 ${anyPeriod ? "sm:col-start-4" : "sm:col-start-3"}`}>
                      <div className="text-[12px] font-medium uppercase tracking-[0.1em] text-black/55">Основні напрями роботи</div>
                      <ul className="mt-2.5 flex flex-wrap gap-2">
                        {areas.map((t, k) => (
                          <li key={k} className="inline-flex max-w-full items-center gap-2 rounded-full bg-[#f4f3fc] px-3 py-1.5 text-[14px] leading-none text-black/70">
                            <span aria-hidden className="h-[5px] w-[5px] shrink-0 rounded-full bg-[#6d63d8]" />
                            <span className="min-w-0 break-words">{t}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </div>
  );
}
