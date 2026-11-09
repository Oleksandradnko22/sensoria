import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useOpenAuthorProfile } from "../../context/AuthorProfileContext";
import { categoryLabels } from "../../data/categoryLabels";
import type { Program } from "../../data/programs";
import type { Profile } from "../../lib/auth";
import { useAuthorLeft } from "../../lib/authorStatus";
import ProgramAuthorTab from "./ProgramAuthorTab";
import ProgramIntroVideo from "./ProgramIntroVideo";
import { useProgramIntroVideo } from "./useProgramIntroVideo";
import { Icon } from "../ui/Icon";
import { isAiProgram, isSensoriaAuthor } from "../../utils/contentLabels";
import { isFreePrice } from "../../utils/price";
import { averageRating, programCta, visibleSections, type SectionId } from "../../utils/programDetail";
import ProgramAccessPanel from "./ProgramAccessPanel";
import { requestOpenCart, useCart } from "../../lib/cartStore";
import { pluralUk } from "../../utils/plural";
import { HERO_VISUALS, heroVisualForTags } from "../../utils/heroVisual";
import HeroArt from "./HeroArt";
import ProgramCurriculum, { buildDisplayModules, programStats, type Learning } from "./ProgramCurriculum";
import ProgramReviewsPanel from "./ProgramReviewsPanel";
import { useProgramDetailData } from "./useProgramDetailData";
import { DEMO_BENEFITS, demoLearning, devHeroArt, isDevDemo } from "../../utils/devPreview";

type Props = {
  // null + !loading = not found
  program: Program | null;
  loading: boolean;
  session?: Profile | null;
  header: ReactNode;
  onBackToCatalog: () => void;
  // `section` = the page tab the sign-in was started from, so signing in returns to the same spot.
  onRequireLogin: (section?: string) => void;
  // `itemId` opens the player straight on that lesson; without it, on the program overview.
  onStart: (programId: string, itemId?: string) => void;
  scrollToReviews?: boolean;
  // Tab to open on ("curriculum" | "author" | "reviews"); beats the default first tab.
  initialSection?: string | null;
  // «Є питання до автора?» — hands the author over to the participant's messenger.
  onMessageAuthor: (author: { authorId: string; name: string; avatarUrl: string | null }) => void;
};

// «Кілька слів від автора»: three short reasons to press play (line icons, no data of their own).
const INTRO_POINTS = [
  { title: "Познайомтеся з автором", text: "Дізнайтеся, хто створив програму та який досвід стоїть за нею.", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20c0-4 3.6-6 8-6s8 2 8 6" },
  { title: "Зрозумійте зміст програми", text: "Коротко ознайомтеся з темами та підходом до роботи.", icon: "M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5" },
  { title: "Оцініть, чи підходить вона вам", text: "Зрозумійте, чи відповідає програма вашому запиту.", icon: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" },
] as const;

const CARD = "rounded-[24px] bg-white p-5 text-slate-900 shadow-[0_18px_40px_-22px_rgba(15,23,42,0.45)] sm:p-7 scroll-mt-28";

function MetaIcon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-white/90">
      <path d={d} />
    </svg>
  );
}

export default function ProgramDetailPage(props: Props) {
  const { program, loading, header, onBackToCatalog } = props;

  return (
    <div className="min-h-screen bg-[#f1f4ff]">
      {header}
      {program && !loading ? (
        <Detail {...props} program={program} />
      ) : (
      <main className="min-h-screen bg-gradient-to-br from-[#1e3a8a] via-[#2563eb] to-[#8b5cf6] px-4 pb-16 pt-28 sm:px-6 lg:px-8">
        {loading ? (
          <div role="status" aria-busy="true" className="rounded-[24px] bg-white/10 p-10 text-center text-white/80">
            Завантажуємо програму…
          </div>
        ) : (
          <div className="mx-auto mt-10 max-w-[560px] rounded-[24px] bg-white p-8 text-center text-slate-900 shadow-xl">
            <h1 className="text-[24px] font-semibold">Програму не знайдено</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-slate-600">Можливо, її зняли з публікації або посилання застаріло.</p>
            <button
              type="button"
              onClick={onBackToCatalog}
              className="mt-6 min-h-[48px] rounded-[16px] bg-gradient-to-r from-[#0057ff] to-[#7b2cff] px-6 text-[15px] font-medium text-white transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              До каталогу програм
            </button>
          </div>
        )}
      </main>
      )}
    </div>
  );
}

function Detail({ program: loadedProgram, session, onBackToCatalog, onRequireLogin, onStart, scrollToReviews, initialSection, onMessageAuthor }: Props & { program: Program }) {
  const openAuthorProfile = useOpenAuthorProfile();
  // Dev-only sample state (`?demo=1`, see utils/devPreview.ts): sample benefits and 50% progress (the price stays the real one).
  const demo = isDevDemo();
  const program: Program = useMemo(
    () => (demo ? { ...loadedProgram, benefits: loadedProgram.benefits?.length ? loadedProgram.benefits : DEMO_BENEFITS } : loadedProgram),
    [demo, loadedProgram]
  );
  const data = useProgramDetailData(program, session);
  const introVideo = useProgramIntroVideo(program.authorId ? program.id : undefined, program.authorId, program.tags);
  const authorLeft = useAuthorLeft(program.authorId);
  const viewerIsAuthor = !!program.authorId && session?.id === program.authorId;
  const isParticipant = session?.role === "participant";
  const cartApi = useCart();
  const programRef = { kind: "program" as const, id: loadedProgram.id };

  const { list: modules } = useMemo(() => buildDisplayModules(program, data.realModules), [program, data.realModules]);
  // Lessons open (with real statuses) only for a participant who has progress on this program.
  const sample = demo ? demoLearning(data.realModules) : null;
  const learning: Learning | null = sample ?? (data.progress && data.itemModules && data.progressMap && !viewerIsAuthor ? { modules: data.itemModules, map: data.progressMap, summary: data.progress } : null);
  const rating = averageRating(data.reviews.map((r) => r.rating));
  const cta = programCta({ price: program.price, viewerIsAuthor, progress: sample ? sample.summary : data.progress, saved: data.saved, owned: data.owned });
  const tagLabels = (program.tags ?? [])
    .filter((t) => t in categoryLabels)
    .map((t) => categoryLabels[t as keyof typeof categoryLabels]);
  const free = isFreePrice(program.price);
  const [, setArtRev] = useState(0);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const f = () => setArtRev((n) => n + 1);
    window.addEventListener("sensoria:dev-art", f);
    return () => window.removeEventListener("sensoria:dev-art", f);
  }, []);
  const forcedArt = devHeroArt();
  const visual = forcedArt && forcedArt in HERO_VISUALS ? HERO_VISUALS[forcedArt as keyof typeof HERO_VISUALS] : heroVisualForTags(program.tags);
  // The participant's curriculum counts real lessons, so the header must agree with it
  // (the author-typed per-module number can differ from the lessons actually added).
  const baseStats = programStats(program, data.realModules);
  const itemLessons = learning ? learning.modules.reduce((s, m) => s + m.items.length, 0) : 0;
  const stats = { lessons: itemLessons > 0 ? itemLessons : baseStats.lessons };
  const bySensoria = isSensoriaAuthor(program.author);
  const ai = isAiProgram(program.tags);
  const sections = visibleSections({ hasCurriculum: modules.length > 0 || !data.modulesLoaded, hasAuthor: !!program.author, hasReviews: true });

  const validInitial = (["curriculum", "author", "reviews"] as const).find((id) => id === initialSection) ?? null;
  const [picked, setPicked] = useState<SectionId | null>(validInitial ?? (scrollToReviews ? "reviews" : null));
  const active: SectionId = sections.find((s) => s.id === picked)?.id ?? sections[0]?.id ?? "reviews";
  // Sign-in started here returns to this same tab.
  const requireLogin = () => onRequireLogin(active);
  // Coming back after signing in: bring the tab bar into view so the person lands on the same spot.
  useEffect(() => {
    if (!validInitial) return;
    const id = window.setTimeout(() => document.getElementById(`pd-tab-${validInitial}`)?.scrollIntoView({ block: "center" }), 400);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    document.title = `${program.title} — Sensoria`;
    return () => {
      document.title = "Sensoria";
    };
  }, [program.title]);
  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const next =
      e.key === "Home" ? sections[0] : e.key === "End" ? sections[sections.length - 1] : sections[(i + (e.key === "ArrowRight" ? 1 : sections.length - 1)) % sections.length];
    setPicked(next.id);
    document.getElementById(`pd-tab-${next.id}`)?.focus();
  };

  return (
    <>
      {/* HERO — full-bleed, atmosphere chosen by category (utils/heroVisual.ts) */}
      <section className="relative isolate overflow-hidden text-white" style={{ background: visual.background }}>
        <div className="relative mx-auto w-full max-w-[1200px] px-4 pb-24 pt-28 sm:px-6 sm:pb-28 lg:px-8 lg:pb-32">
          {/* category emblem: a whole square beside the text, never cropped; hidden on small screens */}
          <div aria-hidden="true" className="pointer-events-none absolute right-8 top-[136px] hidden aspect-square w-[300px] lg:block xl:right-12 xl:w-[340px]">
            <HeroArt visual={visual} />
          </div>
          <nav aria-label="Навігація" className="mb-8 text-[14px] text-white/80">
            <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <li>
                <button type="button" onClick={onBackToCatalog} className="-my-3 rounded py-3 underline-offset-2 hover:text-white hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-white">
                  Каталог програм
                </button>
              </li>
              <li aria-hidden="true">→</li>
              <li aria-current="page" className="min-w-0 max-w-full truncate font-medium text-white">
                {program.title}
              </li>
            </ol>
          </nav>

          <header className="max-w-[640px]">
            <div className="flex flex-wrap items-center gap-2">
              {tagLabels.length > 0 && (
                <span className="rounded-full bg-white/20 px-3.5 py-1.5 text-[13px] font-medium text-white ring-1 ring-white/25 backdrop-blur-sm">{tagLabels.join(" • ")}</span>
              )}
              {free && <span className="rounded-full bg-emerald-500 px-3.5 py-1.5 text-[13px] font-semibold text-white">Безкоштовно</span>}
              {bySensoria && <span className="rounded-full bg-[#4338ca] px-3.5 py-1.5 text-[13px] font-semibold text-white">Sensoria</span>}
              {ai && (
                <span className="rounded-full bg-white/90 px-2.5 py-1.5 text-[13px] font-bold tracking-wide text-violet-700" title="Під час створення використано ШІ">
                  AI
                </span>
              )}
            </div>

            <h1 className="mt-5 text-[34px] font-bold leading-[1.08] tracking-tight sm:text-[46px] lg:text-[54px]">{program.title}</h1>
            {program.description && <p className="mt-5 max-w-[56ch] text-[16px] leading-relaxed text-white/90 sm:text-[18px]">{program.description}</p>}

            <dl className="mt-8 flex flex-wrap items-center gap-x-7 gap-y-4 text-[15px]">
              <div className="flex items-center gap-2.5">
                <MetaIcon d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20c0-4 3.6-6 8-6s8 2 8 6" />
                <div>
                  <dt className="text-[12px] leading-none text-white/65">Автор</dt>
                  <dd className="mt-1 font-medium leading-none">
                    {program.authorId ? (
                      <button type="button" onClick={() => openAuthorProfile(program.authorId!)} className="-my-3 rounded py-3 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-white">
                        {program.author}
                      </button>
                    ) : (
                      program.author
                    )}
                  </dd>
                </div>
              </div>
              {program.duration && (
                <div className="flex items-center gap-2.5">
                  <MetaIcon d="M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5" />
                  <dt className="sr-only">Обсяг</dt>
                  <dd className="font-medium">{program.duration}</dd>
                </div>
              )}
              {stats.lessons && (
                <div className="flex items-center gap-2.5">
                  <MetaIcon d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM10 8.5v7l6-3.5z" />
                  <dt className="sr-only">Уроки</dt>
                  <dd className="font-medium">
                    {stats.lessons} {pluralUk(stats.lessons, "урок", "уроки", "уроків")}
                  </dd>
                </div>
              )}
              {rating && (
                <div className="flex items-center gap-2.5">
                  <Icon name="star" size={18} filled />
                  <dt className="sr-only">Рейтинг</dt>
                  <dd className="font-medium">
                    {rating} <span className="text-[13px] font-normal text-white/70">({data.reviews.length})</span>
                  </dd>
                </div>
              )}
            </dl>
          </header>
        </div>
      </section>

      <main className="mx-auto w-full max-w-[1200px] px-4 pb-16 sm:px-6 lg:px-8">
        {/* BENEFITS + ACCESS — one panel, overlapping the hero's lower edge */}
        <div className="relative z-10 -mt-16 sm:-mt-20">
          <ProgramAccessPanel program={program} cta={cta} onStart={() => onStart(program.id)} session={session} onRequireLogin={requireLogin} authorLeft={authorLeft} loading={!sample && data.progressLoading} inCart={cartApi.has(programRef)} onAddToCart={() => cartApi.add(programRef)} onRemoveFromCart={() => cartApi.remove(programRef)} onOpenCart={requestOpenCart} />
        </div>

        {introVideo && (
          <section aria-labelledby="pd-intro" className="relative mt-8 overflow-hidden rounded-[24px] border border-[#e8e4fb] bg-gradient-to-br from-white via-[#fbfaff] to-[#f1eeff] p-5 text-slate-900 sm:p-7 lg:p-8">
            {/* soft atmosphere: two blurred lavender shapes, behind the content */}
            <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#ddd6fe]/50 blur-3xl" />
            <div aria-hidden="true" className="pointer-events-none absolute -bottom-28 left-1/3 h-64 w-96 rounded-full bg-[#c7d2fe]/40 blur-3xl" />
            <div className="relative grid items-center gap-6 md:grid-cols-[minmax(0,58fr)_minmax(0,42fr)] md:gap-10">
              <ProgramIntroVideo url={introVideo} title={program.title} author={program.author} />
              <div className="min-w-0">
                <h2 id="pd-intro" className="text-[24px] font-bold leading-tight tracking-tight text-[#1d1a3b] sm:text-[28px]">Кілька слів від автора</h2>
                <p className="mt-3 text-[15px] leading-relaxed text-slate-600 sm:text-[16px]">Коротке знайомство з програмою та автором: що на вас чекає, для кого створена програма та яку користь вона принесе.</p>
                <ul className="mt-5 flex flex-col gap-3">
                  {INTRO_POINTS.map((pt) => (
                    <li key={pt.title} className="flex items-start gap-3.5">
                      <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[#ddd6fb] bg-white text-[#5b3df5] shadow-[0_6px_14px_-10px_rgba(91,61,245,0.55)]">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={pt.icon} /></svg>
                      </span>
                      <div className="min-w-0">
                        <div className="text-[15px] font-semibold leading-snug text-[#1d1a3b]">{pt.title}</div>
                        <p className="mt-0.5 text-[14px] leading-relaxed text-slate-600">{pt.text}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        )}

        <div role="tablist" aria-label="Розділи сторінки" className="mt-8 flex gap-1 overflow-x-auto border-b border-slate-200 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {sections.map((s, i) => (
            <button
              key={s.id}
              id={`pd-tab-${s.id}`}
              type="button"
              role="tab"
              aria-selected={active === s.id}
              aria-controls={active === s.id ? `pd-panel-${s.id}` : undefined}
              tabIndex={active === s.id ? 0 : -1}
              onClick={() => setPicked(s.id)}
              onKeyDown={(e) => onTabKey(e, i)}
              className={`-mb-px min-h-[48px] shrink-0 border-b-2 px-4 text-[15px] font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4338ca] sm:px-5 ${
                active === s.id ? "border-[#4f46e5] text-[#3730a3]" : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="mt-6 flex flex-col gap-6">

          {active === "curriculum" && (
          <section role="tabpanel" id="pd-panel-curriculum" aria-labelledby="pd-tab-curriculum" className={CARD}>
            <h2 id="pd-curriculum" className="text-[22px] font-semibold">Програма</h2>
            <div className="mt-4">
              {!data.modulesLoaded ? (
                <p role="status" className="text-[14px] text-slate-500">Завантажуємо структуру…</p>
              ) : modules.length === 0 ? (
                <p className="text-[14px] text-slate-500">Автор ще не додав структуру програми.</p>
              ) : (
                <ProgramCurriculum
                  key={learning ? "learning" : "visitor"}
                  program={program}
                  modules={modules}
                  learning={learning}
                  onOpenItem={(itemId) => onStart(program.id, itemId)}
                />
              )}
            </div>
          </section>
          )}

        {active === "author" && (
          <section role="tabpanel" id="pd-panel-author" aria-labelledby="pd-tab-author" className={CARD}>
            <ProgramAuthorTab
              program={program}
              onOpenProfile={() => program.authorId && openAuthorProfile(program.authorId)}
              afterHeader={
                program.authorId && !viewerIsAuthor && !authorLeft && (isParticipant || !session) ? (
                  // Only a signed-in participant can write: they continue in their cabinet's «Повідомлення»,
                  // everyone else is sent to sign in.
                  <button
                    type="button"
                    onClick={() =>
                      isParticipant
                        ? onMessageAuthor({ authorId: program.authorId!, name: program.author, avatarUrl: null })
                        : requireLogin()
                    }
                    className="min-h-[40px] shrink-0 whitespace-nowrap rounded-[12px] bg-gradient-to-r from-[#0057ff] to-[#7b2cff] px-4 text-[14px] font-medium text-white transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4338ca] focus-visible:ring-offset-2"
                  >
                    Є питання до автора?
                  </button>
                ) : undefined
              }
            />
          </section>
        )}

          {active === "reviews" && (
          <section role="tabpanel" id="pd-panel-reviews" aria-labelledby="pd-tab-reviews" className={CARD}>
            <ProgramReviewsPanel
              programId={program.id}
              authorId={program.authorId}
              reviews={data.reviews}
              authorReviews={data.authorReviews}
              session={session}
              canRateAuthor={!viewerIsAuthor && !authorLeft}
              enrolled={!!(sample || data.progress)}
              onRequireLogin={requireLogin}
              onSaved={data.refreshReviews}
            />
          </section>
          )}
        </div>
      </main>
    </>
  );
}
