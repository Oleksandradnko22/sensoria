import { Icon, type IconName } from "../components/ui/Icon";
import type { PrimaryStateId } from "../store/funnelStore";
import type { Program } from "../data/programs";
import type { Meditation } from "../data/meditations";
import { guideSizeLabel, type Guide } from "../data/guides";
import {
  getAllRelevantCourses,
  getAllRelevantMeditations,
  getAllRelevantGuides,
  patternTags,
  getRecommendationPrograms,
  type MatchContext,
} from "../utils/relevantContent";
import { meditations as allMeditationsList } from "../data/meditations";
import { guides as allGuidesList } from "../data/guides";
import funnelStore from "../store/funnelStore";
import { SHOW_DEMO } from "../utils/demoMode";
import { formatPrice, isFreePrice } from "../utils/price";
import { categoryLabels } from "../data/categoryLabels";
import { stateAccentColors } from "../data/stateAccentColors";
import type { Intensity } from "../store/funnelStore";

type Props = {
  primaryState: PrimaryStateId;
  secondaryState: PrimaryStateId | null;

  onOpenCourse: (course: Program) => void;
  onOpenMeditation: (meditation: Meditation) => void;
  onOpenGuide: (guide: Guide) => void;

  onViewAllCourses: () => void;
  onViewAllMeditations: () => void;
  onViewAllGuides: () => void;
  onViewEntireLibrary: () => void;
};

const LEVEL: Record<Intensity, string> = { low: "легкий рівень", moderate: "помірний рівень", high: "відчутний рівень", critical: "дуже високий рівень" };
const stateName = (id: string) => categoryLabels[id as keyof typeof categoryLabels] ?? id;
const lower = (id: string) => stateName(id).toLowerCase();

// «Ваша персональна добірка» (redesigned 22.11.2026, owner's brief):
// - per format the 3 best matches: 2 paid + 1 free when the catalog has them (authors sell, the person can start
//   without paying); an arrow tile opens the full catalog already filtered to the person's state(s);
// - every card says WHY it is here (which of the person's states it is about); every section says why this format
//   fits this state and level; on top one «first step» chosen by the level (gentle first when the state is strong);
// - only real matches, never padding (utils/relevantContent.ts).

type Kind = "program" | "meditation" | "guide";
type CardItem = {
  key: string;
  kind: Kind;
  icon: IconName;
  label: "Програма" | "Медитація" | "Гайд";
  title: string;
  meta: string;
  free: boolean;
  priceLabel: string;
  cover?: string;
  author?: string;
  why: string;
  onClick: () => void;
};

/**
 * Always 3 when the catalog has them (owner, 22.11.2026): 2 paid + 1 free. Materials on the person's topics come
 * first; when there are fewer than 3, other materials of the same format fill the row, marked honestly as not on
 * the person's topic. The free one goes first.
 */
function pickThree(matches: CardItem[], others: CardItem[]): CardItem[] {
  const pool = [...matches, ...others.filter((o) => !matches.some((m) => m.key === o.key))];
  const free = pool.filter((x) => x.free).slice(0, 1);
  const paid = pool.filter((x) => !x.free).slice(0, 2);
  const picked = [...free, ...paid];
  for (const x of pool) if (picked.length < 3 && !picked.includes(x)) picked.push(x);
  return picked.sort((a, b) => Number(b.free) - Number(a.free) || pool.indexOf(a) - pool.indexOf(b));
}

// Demo cards (owner, 22.11.2026: «по 3 в кожному розділі»): only with the demo catalog on (SHOW_DEMO), only to fill
// a row the real catalog cannot fill yet. They are not real materials: a click opens the catalog of that format.
const DEMO_FILL: Record<Kind, { title: string; meta: string; price: string }[]> = {
  meditation: [
    { title: "Дихання для спокою", meta: "6 хв", price: "0" },
    { title: "Відпустити напругу в тілі", meta: "12 хв", price: "190" },
    { title: "Вечірнє розслаблення перед сном", meta: "15 хв", price: "240" },
  ],
  guide: [
    { title: "Маленькі кроки, коли все дається через силу", meta: "10 сторінок", price: "0" },
    { title: "Тривожні думки: як перестати крутитися по колу", meta: "14 сторінок", price: "290" },
    { title: "Як відновлювати сили, коли ресурс на нулі", meta: "18 сторінок", price: "350" },
  ],
  program: [
    { title: "Перші кроки до спокою", meta: "3 модулі", price: "0" },
    { title: "Спокій без поспіху", meta: "5 модулів", price: "1200" },
    { title: "Опора в собі", meta: "6 модулів", price: "1500" },
  ],
};
const KIND_LOOK: Record<Kind, { icon: IconName; label: CardItem["label"] }> = {
  meditation: { icon: "meditation", label: "Медитація" },
  guide: { icon: "guide", label: "Гайд" },
  program: { icon: "library", label: "Програма" },
};
function fillWithDemo(kind: Kind, picked: CardItem[], onClick: () => void): CardItem[] {
  if (!SHOW_DEMO || picked.length >= 3) return picked;
  const out = [...picked];
  const demos = DEMO_FILL[kind].map((d, i): CardItem => ({
    key: `demo-${kind}-${i}`, kind, ...KIND_LOOK[kind], title: d.title, meta: d.meta,
    free: isFreePrice(d.price), priceLabel: formatPrice(d.price), author: "Sensoria",
    why: "Демо: так виглядатиме добірка, коли автори опублікують більше матеріалів", onClick,
  }));
  if (!out.some((x) => x.free)) out.push(demos.find((d) => d.free)!);
  for (const d of demos) if (out.length < 3 && !d.free) out.push(d);
  return out.sort((a, b) => Number(b.free) - Number(a.free));
}

function LibraryCard({ item, accentHex, big = false }: { item: CardItem; accentHex: string; big?: boolean }) {
  return (
    <button
      type="button"
      onClick={item.onClick}
      className={`group flex h-full w-full flex-col overflow-hidden rounded-[24px] ${big ? "md:flex-row" : ""} border border-white/15 bg-white/[0.08] text-left backdrop-blur-2xl transition duration-200 hover:-translate-y-1 hover:border-white/30 hover:bg-white/[0.12] focus:outline-none focus-visible:ring-2 focus-visible:ring-white`}
    >
      <div
        className={`relative w-full shrink-0 bg-cover bg-center ${big ? "h-48 md:h-auto md:min-h-[220px] md:w-[42%]" : "h-32"}`}
        style={item.cover ? { backgroundImage: `url(${item.cover})` } : { background: `linear-gradient(135deg, ${accentHex}, #7c5cf0 70%)` }}
        aria-hidden="true"
      >
        {!item.cover && (
          <span className="absolute inset-0 flex items-center justify-center text-white/85">
            <Icon name={item.icon} size={big ? 40 : 28} />
          </span>
        )}
        <span className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[12px] font-semibold ${item.free ? "bg-white text-[#1e3a8a]" : "bg-[#12172b]/45 text-white backdrop-blur"}`}>
          {item.free ? "Безкоштовно" : item.priceLabel}
        </span>
      </div>
      <div className={`flex flex-1 flex-col ${big ? "p-6 md:p-8" : "p-5"}`}>
        <div className="mb-2 inline-flex items-center gap-1.5 text-[12px] uppercase tracking-wide text-white/55">
          <Icon name={item.icon} size={13} /> {item.label}
        </div>
        <h3 className={`font-semibold leading-snug text-white ${big ? "text-2xl" : "text-[16px]"}`}>{item.title}</h3>
        <p className="mt-1 text-sm text-white/55">{item.meta}{item.author ? ` · ${item.author}` : ""}</p>
        <p className="mt-auto flex items-start gap-2 pt-4 text-[13.5px] leading-snug text-white/80">
          <Icon name="check" size={15} />
          <span>{item.why}</span>
        </p>
      </div>
    </button>
  );
}

function ViewAllArrow({ label, hint, onClick }: { label: string; hint: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label}. ${hint}`}
      className="group flex items-center gap-4 self-center rounded-full px-2 py-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-white lg:col-start-4 lg:flex-col lg:gap-3 lg:text-center"
    >
      <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white text-[#1e3a8a] shadow-[0_12px_30px_-10px_rgba(20,20,80,0.6)] transition duration-200 group-hover:scale-105 group-hover:shadow-[0_16px_40px_-10px_rgba(20,20,80,0.7)]">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="transition-transform duration-200 group-hover:translate-x-0.5">
          <path d="M5 12h13m0 0-5-5m5 5-5 5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="lg:max-w-[120px]">
        <span className="block text-[15px] font-semibold text-white">{label}</span>
        <span className="mt-0.5 block text-[12.5px] leading-snug text-white/60">{hint}</span>
      </span>
    </button>
  );
}

function Section({ icon, title, eyebrow, why, items, accentHex, viewAll }: {
  icon: IconName; title: string; eyebrow?: string; why: string; items: CardItem[]; accentHex: string; viewAll: { label: string; hint: string; onClick: () => void };
}) {
  if (items.length === 0) return null;
  return (
    <section className="mb-16">
      {eyebrow && <p className="mb-2 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-[12px] font-semibold uppercase tracking-wide text-[#1e3a8a]"><Icon name="star" size={13} /> {eyebrow}</p>}
      <h2 className="flex items-center gap-2 text-2xl font-semibold sm:text-[28px]"><Icon name={icon} size={24} /> {title}</h2>
      <p className="mt-2 mb-6 max-w-3xl leading-relaxed text-white/70">{why}</p>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-[repeat(3,minmax(0,1fr))_auto] lg:gap-6">
        {items.map((item) => <LibraryCard key={item.key} item={item} accentHex={accentHex} />)}
        <ViewAllArrow {...viewAll} />
      </div>
    </section>
  );
}

const FORMAT_WHY: Record<Kind, Record<"low" | "moderate" | "strong", string>> = {
  program: {
    low: "Поки ресурс є, це добрий момент для системної роботи: модулі, практики й завдання від автора, у вашому темпі.",
    moderate: "Покроковий шлях від автора, щоб працювати з темою регулярно, а не від випадку до випадку.",
    strong: "Коли з'явиться ресурс. Спершу короткі практики, а програма може допомогти закріпити зміни.",
  },
  meditation: {
    low: "Кілька хвилин на день, щоб підтримувати баланс і помічати напругу раніше.",
    moderate: "Короткі практики, щоб знижувати напругу щодня, навіть у найзайнятіший день.",
    strong: "Найм'якший старт: кілька хвилин, щоб заспокоїтися й повернути відчуття опори. Без зусиль і підготовки.",
  },
  guide: {
    low: "Щоб краще розуміти себе й помічати ранні сигнали, поки все спокійно.",
    moderate: "Пояснюють, що відбувається, і дають конкретні кроки, які можна пробувати вже сьогодні.",
    strong: "Коротко й без перевантаження: що з вами відбувається і що можна зробити вже зараз.",
  },
};

export default function LibraryHomePage({
  primaryState,
  secondaryState,
  onOpenCourse,
  onOpenMeditation,
  onOpenGuide,
  onViewAllCourses,
  onViewAllMeditations,
  onViewAllGuides,
  onViewEntireLibrary,
}: Props) {
  // the same assessment the page was opened from: elevated topics and whether to lead with gentle, free materials
  const insight = funnelStore.insight;
  const extra = (insight?.supportingPatterns ?? []).map((p) => p.category);
  const ctx: MatchContext = { extraTags: extra, gentle: !!insight?.safety };
  const band: "low" | "moderate" | "strong" = insight?.intensity === "low" ? "low" : insight?.intensity === "moderate" ? "moderate" : "strong";
  const accentHex = stateAccentColors[primaryState].hex;
  const chosen = [primaryState, ...(secondaryState ? [secondaryState] : [])];
  const topic = chosen.map((s) => `«${lower(s)}»`).join(" і ");

  // why THIS material: which of the person's states it is about
  const extraStates = patternTags(extra).filter((t) => !chosen.includes(t as PrimaryStateId));
  const why = (tags: string[]): string => {
    if (tags.includes(primaryState)) return `Про ${lower(primaryState)}: ваш обраний стан`;
    if (secondaryState && tags.includes(secondaryState)) return `Про ${lower(secondaryState)}: ваш другий обраний стан`;
    const hit = extraStates.find((t) => tags.includes(t));
    return hit ? `Про ${lower(hit)}: теж помітно у ваших відповідях` : "Не на вашу тему, але може підтримати загальний стан";
  };

  const courseItem = (c: Program): CardItem => ({
    key: `p-${c.id}`, kind: "program", icon: "library", label: "Програма", title: c.title, meta: c.duration || "Програма",
    free: isFreePrice(c.price), priceLabel: formatPrice(c.price), cover: c.coverUrl, author: c.author, why: why(c.tags), onClick: () => onOpenCourse(c),
  });
  const meditationItem = (m: Meditation): CardItem => ({
    key: `m-${m.id}`, kind: "meditation", icon: "meditation", label: "Медитація", title: m.title, meta: m.duration,
    free: m.price === undefined || isFreePrice(m.price), priceLabel: m.price === undefined ? "" : formatPrice(m.price), cover: m.coverUrl, author: m.author, why: why(m.tags), onClick: () => onOpenMeditation(m),
  });
  const guideItem = (g: Guide): CardItem => ({
    key: `g-${g.id}`, kind: "guide", icon: "guide", label: "Гайд", title: g.title, meta: guideSizeLabel(g),
    free: isFreePrice(g.price), priceLabel: formatPrice(g.price), cover: (g as { coverUrl?: string }).coverUrl, author: g.author, why: why(g.tags), onClick: () => onOpenGuide(g),
  });

  const allCourses = getAllRelevantCourses(primaryState, secondaryState, extra, ctx.gentle).map(courseItem);
  const allMeditations = getAllRelevantMeditations(primaryState, secondaryState, extra, ctx.gentle).map(meditationItem);
  const allGuides = getAllRelevantGuides(primaryState, secondaryState, extra, ctx.gentle).map(guideItem);

  // the first step is the first section, by the level (gentle first when the state is strong)
  const FIRST_WHY: Record<typeof band, string> = {
    strong: "Зараз стан виражений сильно, тому почати краще з короткої практики: кілька хвилин, без підготовки й зусиль.",
    moderate: "Гайд може допомогти зрозуміти, що відбувається, і дасть перші конкретні кроки, які можна спробувати вже сьогодні.",
    low: "Ресурс зараз є, тож це добрий момент для програми, яка дає системну роботу з темою.",
  };
  // other materials of the same format, to fill a row up to 3 (relevance order of the catalog otherwise)
  const isMatch = (keys: Set<string>) => (x: CardItem) => !keys.has(x.key);
  const otherCourses = getRecommendationPrograms().map(courseItem).filter(isMatch(new Set(allCourses.map((x) => x.key))));
  const otherMeditations = allMeditationsList.map(meditationItem).filter(isMatch(new Set(allMeditations.map((x) => x.key))));
  const otherGuides = allGuidesList.map(guideItem).filter(isMatch(new Set(allGuides.map((x) => x.key))));
  const courses = fillWithDemo("program", pickThree(allCourses, otherCourses), onViewAllCourses);
  const meditations = fillWithDemo("meditation", pickThree(allMeditations, otherMeditations), onViewAllMeditations);
  const guides = fillWithDemo("guide", pickThree(allGuides, otherGuides), onViewAllGuides);
  const nothing = allCourses.length + allMeditations.length + allGuides.length === 0;

  const sectionsOrder: Kind[] = band === "strong" ? ["meditation", "guide", "program"] : band === "moderate" ? ["guide", "meditation", "program"] : ["program", "guide", "meditation"];
  const firstKind = sectionsOrder[0];
  const head = (k: Kind) => (k === firstKind ? { eyebrow: "Ваш перший крок", why: FIRST_WHY[band] } : { why: FORMAT_WHY[k][band] });
  const sections: Record<Kind, React.ReactNode> = {
    meditation: (
      <Section key="m" icon="meditation" title="Медитації" {...head("meditation")} items={meditations} accentHex={accentHex}
        viewAll={{ label: "Усі медитації", hint: `За темою ${topic}`, onClick: onViewAllMeditations }} />
    ),
    guide: (
      <Section key="g" icon="guide" title="Гайди" {...head("guide")} items={guides} accentHex={accentHex}
        viewAll={{ label: "Усі гайди", hint: `За темою ${topic}`, onClick: onViewAllGuides }} />
    ),
    program: (
      <Section key="p" icon="library" title="Програми" {...head("program")} items={courses} accentHex={accentHex}
        viewAll={{ label: "Усі програми", hint: `За темою ${topic}`, onClick: onViewAllCourses }} />
    ),
  };

  return (
    <div className="min-h-screen px-4 py-20 text-white sm:px-6">
      {/* the content is exactly as wide as the page title (owner, 22.11.2026) */}
      <div className="rec-wrap mx-auto max-w-[1040px]">
        <header className="mb-14 text-center">
          <p className="mb-4 text-xs uppercase tracking-[0.3em] text-white/55">Ваша персональна добірка</p>
          <h1 className="text-[30px] font-bold leading-tight sm:text-4xl md:text-5xl">Матеріали, підібрані за вашими відповідями</h1>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {chosen.map((id) => (
              <span key={id} className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stateAccentColors[id].hex }} aria-hidden="true" />
                {stateName(id)}
                {id === primaryState && insight ? <span className="text-white/60">· {LEVEL[insight.intensity]}</span> : null}
              </span>
            ))}
            {extraStates.map((t) => (
              <span key={t} className="rounded-full border border-white/10 px-3 py-1.5 text-sm text-white/70">також: {lower(t)}</span>
            ))}
          </div>
          <p className="mx-auto mt-5 max-w-xl text-white/70">Спершу — ваші теми, від найлегшого старту.</p>
          {/* lawyer, 22.11.2026 (1.4): how the selection is made, including the commercial side */}
          <details className="mx-auto mt-2 max-w-xl text-sm text-white/65">
            <summary className="cursor-pointer list-none underline underline-offset-2 hover:text-white">Як ми підбираємо</summary>
            <p className="mt-2 leading-relaxed">
              Добірку складає програма автоматично: за станами з ваших відповідей і рівнем, спершу — безоплатні й короткі матеріали. Якщо на вашу тему матеріалів мало, додаємо загальні — вони позначені. Платні матеріали продають автори; Sensoria отримує з продажу тариф.
            </p>
          </details>
          {ctx.gentle && (
            <div className="mx-auto mt-5 inline-flex items-start gap-3 rounded-2xl bg-white/10 px-4 py-3 text-left text-sm leading-relaxed text-white/80">
              <span aria-hidden="true" className="mt-0.5 text-white"><Icon name="lifebuoy" size={18} /></span>
              <span>
                <span className="block font-semibold text-white">Спершу безоплатні й короткі матеріали</span>
                Якщо не легшає, <a href="/crisis-help" className="underline underline-offset-2 hover:text-white">зверніться до спеціаліста</a>.
              </span>
            </div>
          )}
        </header>

        {nothing && (
          <p className="mb-12 text-center text-white/70">
            Поки немає матеріалів саме на цю тему. Вони з'являться, щойно автори їх опублікують, а нижче є матеріали, що можуть підтримати загальний стан.
          </p>
        )}

        {sectionsOrder.map((k) => sections[k])}

        <div className="border-t border-white/10 pt-14 text-center">
          <h2 className="mb-3 text-2xl font-semibold">Не знайшли потрібне?</h2>
          <p className="mx-auto mb-7 max-w-lg leading-relaxed text-white/60">Відкрийте каталог потрібного формату: фільтр за вашими темами вже буде ввімкнений, його можна змінити.</p>
          <div className="flex flex-wrap justify-center gap-3">
            {[
              { label: "Програми", icon: "library" as const, onClick: onViewAllCourses },
              { label: "Медитації", icon: "meditation" as const, onClick: onViewAllMeditations },
              { label: "Гайди", icon: "guide" as const, onClick: onViewAllGuides },
            ].map((b) => (
              <button key={b.label} type="button" onClick={b.onClick} className="inline-flex min-h-[48px] items-center gap-2 rounded-full bg-white px-6 font-semibold text-[#1e3a8a] transition hover:scale-[1.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#2563eb]">
                <Icon name={b.icon} size={18} /> {b.label} <span aria-hidden="true">→</span>
              </button>
            ))}
          </div>
          <button type="button" onClick={onViewEntireLibrary} className="mt-5 text-sm text-white/60 underline-offset-2 hover:text-white hover:underline">
            Усі програми без фільтрів
          </button>
        </div>
      </div>
    </div>
  );
}
