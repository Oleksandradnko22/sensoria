// «Про мене» — meeting the author, in calm white blocks (same surface as the
// feed) so the page reads as a few clear pieces rather than loose text:
//   1 Знайомство        portrait thumbnail, name, role, intro, areas, and the
//                       author's video as a thumbnail (opens a real player)
//   2 Освіта та досвід  document thumbnails (lightbox) + experience timeline
//   3 Підхід і напрями  approach, areas, material types, what I do / don't offer
//   4 Запитання та відповіді  the author's own Q&A accordion
// Every block renders only when it has real content; no stand-in media ever.
// Same component = public page and editor preview.
import { useId, useState } from "react";
import { parseVideoUrl } from "../../../utils/authorPosts";
import { type AuthorCredential, type AuthorExperience } from "../../../utils/authorCredentials";
import { hasStory, paragraphs, visibleBlocks, type AuthorStory } from "../../../utils/authorStory";
import AuthorVideoIntro from "./AuthorVideoIntro";
import SectionLabel from "./SectionLabel";
import { PT } from "./profileType";
import { DEFAULT_OFFER_ICON, DEFAULT_PRINCIPLE_ICONS, DEFAULT_STEP_ICONS, iconPath } from "../../../utils/storyIcons.ts";
import { approachPlan } from "../../../utils/approachPlan.ts";
import { backgroundFacts, type BackgroundFact } from "../../../utils/authorFacts.ts";

const FACT_ICON: Record<BackgroundFact["key"], string> = {
  education: "M22 10 12 5 2 10l10 5 10-5zM6 12v5c3 2.5 9 2.5 12 0v-5",
  years: "M3 8h18v11H3zM8 8V5h8v3M3 13h18",
  certificates: "M12 14a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM8.5 13.5 7 21l5-3 5 3-1.5-7.5",
};

type Kind = "program" | "meditation" | "guide";

type Props = {
  seed?: string;
  name: string;
  initials: string;
  avatarUrl: string | null;
  role?: string; // author_details.title
  approach?: string; // author_details.approach (profile copy)
  bio?: string; // author_details.bio (used only while the story is empty)
  story: AuthorStory;
  credentials?: AuthorCredential[];
  experience?: AuthorExperience[];
  counts?: Record<Kind, number>;
  onOpenKind?: (k: Kind) => void;
  // Editor preview only: show where the video will appear while none is added.
  videoSlotHint?: boolean;
};

const CARD = "rounded-2xl border border-black/[0.08] bg-white px-5 sm:px-8 py-6 sm:py-8";
// one sub-heading style and one level separator for the whole «Підхід і напрями» section
const EYEBROW = "text-[12px] font-semibold uppercase tracking-[0.12em] text-black/55";
const LEVEL = "mt-8 pt-8 border-t border-black/[0.08]";
// tones for the principle tiles (the icon itself is the author's choice, default by position)
const TONES = [
  { bg: "bg-[#fdf1f6]", fg: "text-[#d6336c]" },
  { bg: "bg-[#f1f0fd]", fg: "text-[#4338ca]" },
  { bg: "bg-[#eef8f2]", fg: "text-[#1f9d6b]" },
  { bg: "bg-[#eef4ff]", fg: "text-[#3b6fd9]" },
];
const KIND_LABEL: Record<Kind, string> = { program: "Програми", meditation: "Медитації", guide: "Гайди" };

// accordion of the author's own questions; the first is open, the rest are one tap away
function FaqBlock({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(0);
  const uid = useId();
  return (
    <section aria-labelledby="me-faq" className={CARD}>
      <SectionLabel>Кілька слів перед початком</SectionLabel>
      <h3 id="me-faq" className={`mt-2 ${PT.display} text-black/90`}>Запитання та відповіді</h3>
      <ul className="mt-5">
        {items.map((it, i) => {
          const on = open === i;
          return (
            <li key={i} className={i > 0 ? "border-t border-black/[0.06]" : ""}>
              <h4>
                <button
                  type="button"
                  onClick={() => setOpen(on ? null : i)}
                  aria-expanded={on}
                  aria-controls={`${uid}-${i}`}
                  className="w-full min-h-[56px] flex items-center gap-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 ring-[#4338ca] rounded-lg"
                >
                  <span aria-hidden className="shrink-0 flex h-9 w-9 items-center justify-center rounded-full bg-[#eef0fd] text-[14px] font-semibold tabular-nums text-[#4338ca]">{String(i + 1).padStart(2, "0")}</span>
                  <span className="flex-1 min-w-0 text-[16px] font-medium leading-snug text-black/90 break-words">{it.q}</span>
                  <span aria-hidden className="shrink-0 flex h-8 w-8 items-center justify-center rounded-full bg-[#f1f0fb] text-[#4338ca]">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d={on ? "M5 12h14" : "M12 5v14M5 12h14"} /></svg>
                  </span>
                </button>
              </h4>
              {on && (
                <div id={`${uid}-${i}`} className="mb-3 sm:ml-[52px] rounded-xl bg-[#f6f6fd] px-4 py-3.5 sm:px-5">
                  <p className="text-[16px] leading-[1.7] text-black/65 whitespace-pre-line break-words">{it.a}</p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default function AuthorMe(p: Props) {
  const { story } = p;
  const v = visibleBlocks(story);
  const legacy = !hasStory(story);
  const photo = story.portraitUrl || p.avatarUrl || "";
  const [photoBroken, setPhotoBroken] = useState(false);
  const showPhoto = !!photo && !photoBroken;

  const counts = p.counts ?? { program: 0, meditation: 0, guide: 0 };
  const plan = approachPlan(story, { approach: p.approach, counts, canOpen: !!p.onOpenKind });
  const hasVideo = v.media && !!story.media && (story.media.kind === "audio" ? !!story.media.url : !!parseVideoUrl(story.media.url));
  const facts = backgroundFacts({ credentials: p.credentials ?? [], experience: p.experience ?? [], year: new Date().getFullYear() });
  const hasIntroBlock = v.intro || showPhoto || hasVideo || !!p.name;

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      {/* 1 — meet the author: photo | line | text (no video here). The photo column is always
          there: the real photo, or (until one is uploaded) a quiet monogram tile. */}
      {hasIntroBlock && (
        <section aria-label="Знайомство" className="rounded-xl border border-black/[0.08] bg-white p-4 sm:p-6">
          <div className="grid grid-cols-[132px_minmax(0,1fr)] gap-x-4 gap-y-5 sm:grid-cols-[clamp(250px,34%,300px)_auto_minmax(0,1fr)] sm:gap-x-0 sm:gap-y-0">
            <div className="min-w-0 sm:col-start-1 sm:row-start-1 sm:row-span-2 flex flex-col gap-4">
              {/* the portrait is the main visual; without one, only a quiet flat tile */}
              <div className={`relative aspect-[4/5] rounded-lg overflow-hidden ${showPhoto ? "bg-black/[0.04]" : "bg-[#f6f5fb] border border-[#4338ca]/10"}`}>
                {showPhoto ? (
                  <img src={photo} alt={`Фото: ${p.name}`} onError={() => setPhotoBroken(true)} className="absolute inset-0 w-full h-full object-cover object-[50%_25%]" />
                ) : (
                  <span aria-hidden className="absolute inset-0 flex items-center justify-center text-[24px] font-semibold tracking-tight text-[#4338ca]/35">
                    {p.initials}
                  </span>
                )}
              </div>
            </div>

            {/* the line between photo and text */}
            <span aria-hidden className="col-span-2 h-px bg-black/[0.06] sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:row-span-2 sm:h-auto sm:w-px sm:mx-6" />

            {/* name beside the photo on mobile */}
            <div className="min-w-0 self-center col-start-2 row-start-1 sm:hidden">
              <SectionLabel>Знайомство</SectionLabel>
              <div className="mt-1 text-[20px] font-bold leading-[1.2] tracking-[-0.01em] text-black/90 break-words">{p.name}</div>
              {p.role && <div className="mt-0.5 text-[14px] text-black/55 break-words">{p.role}</div>}
            </div>

            <div className="min-w-0 col-span-2 sm:col-span-1 sm:col-start-3 sm:row-start-1 sm:row-span-2 sm:self-center flex flex-col gap-4">
              <div className="hidden sm:block">
                <SectionLabel>Знайомство</SectionLabel>
                <div className={`mt-2 ${PT.display} text-black/90 break-words`}>{p.name}</div>
                {p.role && <div className="mt-1 text-[14px] text-black/55 break-words">{p.role}</div>}
              </div>
              {paragraphs(story.intro).map((para, i) => (
                <p key={i} className="text-[16px] leading-[1.75] text-black/65 whitespace-pre-line break-words max-w-[56ch]">{para}</p>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 1a — «Професійний бекграунд»: only what the author stated in public records */}
      {facts.length > 0 && (
        <section aria-labelledby="me-bg" className="rounded-xl border border-black/[0.08] bg-white overflow-hidden">
          <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3"><SectionLabel as="h3" id="me-bg">Професійний бекграунд</SectionLabel></div>
          <ul className="grid grid-cols-1 sm:grid-cols-3 border-t border-black/[0.06] divide-y sm:divide-y-0 sm:divide-x divide-black/[0.06]">
            {facts.map((f) => (
              <li key={f.key} className="min-w-0 flex items-center gap-3.5 px-4 sm:px-6 py-4 sm:py-5">
                <span aria-hidden className="shrink-0 w-11 h-11 rounded-full bg-[#f1f0fb] flex items-center justify-center">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4338ca" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d={FACT_ICON[f.key]} />
                  </svg>
                </span>
                <div className="min-w-0">
                  <div className="text-[20px] font-bold leading-[1.2] tracking-[-0.01em] text-black/90 break-words">{f.value}</div>
                  <div className="mt-0.5 text-[14px] leading-snug text-black/55 break-words">{f.label}</div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 1b — the author's own video, its own block (only with real media) */}
      {hasVideo && story.media && (
        <section aria-label="Відеознайомство" className="rounded-xl border border-black/[0.08] bg-white p-4 sm:p-6">
          <AuthorVideoIntro media={story.media} name={p.name} />
        </section>
      )}

      {!hasVideo && p.videoSlotHint && (
        <section aria-label="Відеознайомство (місце для відео)" className="rounded-2xl border border-dashed border-[#4338ca]/30 p-5 sm:p-8">
          <p className="text-[14px] leading-relaxed text-black/55 max-w-[52ch]">
            Тут з’явиться ваше відеознайомство: плеєр із кадром з вашого відео та коротким вступом. Додайте посилання на відео (YouTube або Vimeo) у розділі «Відеознайомство». Відвідувачі цього місця не бачать, поки відео немає.
          </p>
        </section>
      )}

      {/* 3 — «Підхід і напрями»: assembled from what the author wrote (utils/approachPlan.ts).
          statement + explanation panel → steps on a connected path → principle tiles → expectations/catalog → boundaries.
          Every part is optional; nothing renders empty. */}
      {plan.show && (
        <section aria-labelledby="me-approach" className={CARD}>
          <SectionLabel as="h3" id="me-approach">Підхід і напрями</SectionLabel>

          {/* 1 — the author's own words, no headings: the first sentence leads, the rest is one calm paragraph */}
          {plan.text && (
            <div className="group relative mt-5 overflow-hidden rounded-2xl bg-gradient-to-br from-[#edeffe] via-[#f3f1fd] to-[#f7f2fd] px-5 py-6 sm:px-8 sm:py-8">
              {/* soft petals behind the text; they drift a little when the panel is hovered */}
              <svg aria-hidden viewBox="0 0 200 200" className="pointer-events-none absolute -right-10 -top-8 h-[260px] w-[260px] opacity-70 transition-transform duration-700 ease-out motion-safe:group-hover:rotate-[8deg] motion-safe:group-hover:scale-105">
                <defs>
                  <linearGradient id="pet-a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#c9c4f6" stopOpacity="0.55" /><stop offset="1" stopColor="#f0c9ee" stopOpacity="0.45" /></linearGradient>
                  <linearGradient id="pet-b" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#d9d3fb" stopOpacity="0.5" /><stop offset="1" stopColor="#efe3fb" stopOpacity="0.4" /></linearGradient>
                </defs>
                <ellipse cx="128" cy="72" rx="34" ry="78" transform="rotate(28 128 72)" fill="url(#pet-a)" />
                <ellipse cx="82" cy="128" rx="30" ry="66" transform="rotate(-62 82 128)" fill="url(#pet-b)" />
              </svg>
              {plan.lead && <p className={`relative max-w-[44ch] ${PT.display} text-black/90 text-balance break-words`}>{plan.lead}</p>}
              {plan.body && <p className={`relative ${plan.lead ? "mt-3" : ""} max-w-[60ch] text-[16px] leading-[1.7] text-black/70 break-words`}>{plan.body}</p>}
            </div>
          )}

          {/* 2 — how the work goes: steps on one connected path */}
          {plan.stepCols > 0 && (
            <div className={plan.text ? LEVEL : "mt-7"}>
              <h4 className="text-[20px] font-semibold tracking-tight text-black/90">Як відбувається робота</h4>
              <ol className={`mt-5 grid gap-y-5 md:gap-x-5 md:gap-y-6 ${plan.stepCols === 2 ? "md:grid-cols-2" : "md:grid-cols-3"}`}>
                {plan.steps.map((s, i) => (
                  <li key={i} className="min-w-0 flex flex-col gap-3">
                    {/* one dashed path runs through every badge of a row and reaches both edges */}
                    <div className="relative flex items-center justify-center" aria-hidden>
                      <span
                        className="hidden md:block absolute inset-y-1/2 h-0 border-t-2 border-dashed border-[#4338ca]/25"
                        // the path bridges the gap to its neighbours but never leaves the outer edges of the row's cards
                        style={{
                          left: i % plan.stepCols === 0 ? 0 : -10,
                          right: (i + 1) % plan.stepCols === 0 || i === plan.steps.length - 1 ? 0 : -10,
                        }}
                      />
                      <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#eef0fd] text-[14px] font-semibold tabular-nums text-[#4338ca] ring-[6px] ring-white">{String(i + 1).padStart(2, "0")}</span>
                    </div>
                    <div className="flex-1 flex gap-3.5 rounded-xl border border-black/[0.08] p-4">
                      <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#f1f0fb] text-[#4338ca]">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={iconPath(s.icon, DEFAULT_STEP_ICONS[i % DEFAULT_STEP_ICONS.length])} /></svg>
                      </span>
                      <div className="min-w-0">
                        <div className="sr-only">Крок {i + 1}:</div>
                        <div className="text-[16px] font-semibold leading-snug text-black/90 break-words">{s.title}</div>
                        <p className="mt-1 text-[14px] leading-[1.6] text-black/60 break-words">{s.text}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* 3 — what matters: principle tiles */}
          {plan.principleCols > 0 && (
            <div className={plan.text || plan.stepCols ? LEVEL : "mt-7"}>
              <h4 className="text-[20px] font-semibold tracking-tight text-black/90">Що для мене важливо в роботі з людьми</h4>
              <ul className={`mt-5 grid gap-3 ${plan.principleCols === 1 ? "max-w-[460px]" : plan.principleCols === 2 ? "md:grid-cols-2" : "md:grid-cols-3"}`}>
                {plan.principles.map((pr, i) => {
                  const tone = TONES[i % TONES.length];
                  return (
                    <li key={i} className={`min-w-0 flex items-center gap-4 rounded-xl px-4 py-4 sm:px-5 ${tone.bg}`}>
                      <span aria-hidden className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/70 ${tone.fg}`}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={iconPath(pr.icon, DEFAULT_PRINCIPLE_ICONS[i % DEFAULT_PRINCIPLE_ICONS.length])} /></svg>
                      </span>
                      <span className="min-w-0 text-[16px] font-medium leading-snug text-black/85 break-words">{pr.text}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* 4 — expectations and the author's real materials (only what exists) */}
          {plan.extras !== "none" && (
            <div className={`${plan.text || plan.stepCols || plan.principleCols ? LEVEL : "mt-7"} grid gap-x-14 gap-y-8 ${plan.extras === "split" ? "md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]" : ""}`}>
              {plan.offers.length > 0 && (
                <div className="min-w-0 max-w-[60ch]">
                  <h4 className={EYEBROW}>Чого очікувати від моїх матеріалів</h4>
                  <ul className="mt-3 flex flex-col gap-2">
                    {plan.offers.map((o, i) => (
                      <li key={i} className="flex gap-3 text-[14px] leading-[1.6] text-black/75">
                        <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4338ca" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mt-[3px] shrink-0"><path d={iconPath(o.icon, DEFAULT_OFFER_ICON)} /></svg>
                        <span className="min-w-0 break-words">{o.text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {plan.kinds.length > 0 && (
                <div className="min-w-0 max-w-[420px]">
                  <h4 className={EYEBROW}>Що я створюю</h4>
                  <ul className="mt-2 flex flex-col">
                    {plan.kinds.map((k, i) => (
                      <li key={k} className={i > 0 ? "border-t border-black/[0.06]" : ""}>
                        <button onClick={() => p.onOpenKind!(k)} className="group w-full min-h-[44px] flex items-center justify-between gap-3 text-left text-[14px] text-black/70 hover:text-[#4338ca] focus-visible:outline-none focus-visible:text-[#4338ca] transition-colors">
                          <span>{KIND_LABEL[k]}</span>
                          <span className="flex items-center gap-2 tabular-nums text-black/55">
                            {counts[k]}
                            <span aria-hidden className="text-[14px] text-[#4338ca] transition-transform motion-safe:group-hover:translate-x-0.5">→</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* boundaries: only when written — a calm bar, not an alert */}
          {plan.notOffers.length > 0 && (
            <div className={`${plan.text || plan.stepCols || plan.principleCols || plan.extras !== "none" ? "mt-6" : "mt-7"} flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl bg-[#f3f4fb] px-4 py-3.5 sm:px-5`}>
              <span className="flex items-center gap-2.5 text-[14px] font-semibold text-black/80">
                <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4338ca" strokeWidth="1.7" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>
                Межі моєї роботи
              </span>
              <span aria-hidden className="hidden sm:block h-5 w-px bg-black/[0.12]" />
              <span className="min-w-0 text-[14px] leading-[1.6] text-black/65 break-words">{plan.notOffers.map((t) => t.replace(/[.\s]+$/, "")).join(". ")}.</span>
            </div>
          )}
        </section>
      )}

      {/* 4 — «Запитання та відповіді»: the author's own questions, one open at a time */}
      {v.faq && <FaqBlock items={story.faq} />}

      {/* earlier free-text field, only until the author fills the story */}
      {legacy && p.bio && !v.intro && (
        <section aria-label="Про мене" className={CARD}>
          <p className="text-[16px] leading-[1.7] text-black/75 whitespace-pre-line break-words max-w-[62ch]">{p.bio}</p>
        </section>
      )}
    </div>
  );
}
