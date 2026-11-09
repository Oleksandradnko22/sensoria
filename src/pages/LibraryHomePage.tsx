import { Icon, type IconName } from "../components/ui/Icon";
import type { PrimaryStateId } from "../store/funnelStore";
import type { Program } from "../data/programs";
import type { Meditation } from "../data/meditations";
import { guideSizeLabel, type Guide } from "../data/guides";
import {
  getFeaturedMix,
  getRelevantCourses,
  getRelevantMeditations,
  getRelevantGuides,
} from "../utils/relevantContent";
import { formatPrice } from "../utils/price";

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

function coursePrice(course: Program) {
  return formatPrice(course.price);
}

function guideMeta(guide: Guide) {
  return `${guideSizeLabel(guide)} · ${formatPrice(guide.price)}`;
}

// One shared card for every content type on this page — deliberately
// NOT the white, badge-heavy, price-forward card style the Courses and
// Guides catalog pages use (that's the right register for a browsing
// catalog, wrong register here). This screen's whole brief is "curated
// personal library, not a marketplace," so every card stays in the same
// quiet dark-glass language as the rest of the app: a plain text badge
// for format (not a colored pill shouting "New!"/"Popular!"), the title
// doing the selling, and a de-emphasized meta line instead of a bold
// price tag.
function LibraryCard({
  badge,
  badgeIcon,
  title,
  meta,
  onClick,
  featured = false,
}: {
  badge: string;
  badgeIcon: IconName;
  title: string;
  meta?: string;
  onClick: () => void;
  featured?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        group
        text-left
        rounded-3xl
        bg-white/8
        hover:bg-white/12
        border border-white/15
        hover:border-white/25
        backdrop-blur-2xl
        transition-all
        duration-200
        hover:-translate-y-1
        flex
        flex-col
        justify-between
        ${
          featured
            ? "p-8 min-h-[200px]"
            : "p-6 min-h-[160px] w-[240px] shrink-0"
        }
      `}
    >
      <div className="text-xs uppercase tracking-wide text-white/45 mb-4 inline-flex items-center gap-1.5">
        <Icon name={badgeIcon} size={14} />
        {badge}
      </div>

      <div>
        <h3
          className={`font-semibold text-white leading-snug ${
            featured ? "text-xl" : "text-base"
          }`}
        >
          {title}
        </h3>

        {meta && (
          <div className="mt-3 text-sm text-white/45">{meta}</div>
        )}
      </div>
    </button>
  );
}

// A heading + description + horizontally-scrolling row + "view all"
// link, repeated for Courses/Meditations/Guides. Pulled into one
// function specifically so a future section (per the brief: "Popular
// among people with similar emotional profiles," "Recently added,"
// "Continue where you left off") is just another call to this same
// helper — no layout rework needed to add one later.
function LibraryRow({
  icon,
  title,
  description,
  viewAllLabel,
  onViewAll,
  children,
}: {
  icon: IconName;
  title: string;
  description: string;
  viewAllLabel: string;
  onViewAll: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-20">
      <h2 className="text-2xl font-semibold mb-2 flex items-center gap-2">
        <Icon name={icon} size={22} /> {title}
      </h2>

      <p className="text-white/55 mb-7 max-w-xl">{description}</p>

      <div className="flex gap-5 overflow-x-auto no-scrollbar pb-2 -mx-1 px-1">
        {children}
      </div>

      <button
        onClick={onViewAll}
        className="mt-7 text-white/70 hover:text-white transition"
      >
        {viewAllLabel}
      </button>
    </section>
  );
}

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
  const { course, meditation, guide } = getFeaturedMix(
    primaryState,
    secondaryState
  );

  const courses = getRelevantCourses(primaryState, secondaryState, 5);
  const meditations = getRelevantMeditations(primaryState, secondaryState, 5);
  const guides = getRelevantGuides(primaryState, secondaryState, 5);

  return (
    <div className="min-h-screen px-6 py-24 text-white">
      <div className="max-w-6xl mx-auto">
        {/* HERO — generous spacing, the page should breathe before
            anything else asks for attention. */}
        <div className="text-center mb-28">
          <h1 className="text-5xl md:text-6xl font-bold mb-6 leading-tight">
            Ваша персональна добірка
          </h1>

          <p className="text-white/70 text-lg max-w-2xl mx-auto leading-relaxed">
            На основі ваших відповідей ми підібрали матеріали, які
            найбільше відповідають вашому емоційному стану зараз.
          </p>
        </div>

        {/* SECTION 1 — the most important section. Only 2-3 cards, one
            of each format, never all courses (see getFeaturedMix). */}
        <section className="mb-24">
          <h2 className="text-2xl font-semibold mb-8 flex items-center gap-2">
            <Icon name="star" size={22} /> Рекомендуємо почати з цього
          </h2>

          <div className="grid md:grid-cols-3 gap-6">
            {course && (
              <LibraryCard
                badge="Курс"
                badgeIcon="library"
                title={course.title}
                meta={`${course.duration} · ${coursePrice(course)}`}
                onClick={() => onOpenCourse(course)}
                featured
              />
            )}

            {meditation && (
              <LibraryCard
                badge="Медитація"
                badgeIcon="meditation"
                title={meditation.title}
                meta={meditation.duration}
                onClick={() => onOpenMeditation(meditation)}
                featured
              />
            )}

            {guide && (
              <LibraryCard
                badge="Гайд"
                badgeIcon="guide"
                title={guide.title}
                meta={guideMeta(guide)}
                onClick={() => onOpenGuide(guide)}
                featured
              />
            )}
          </div>
        </section>

        {/* SECTION 2 — Courses */}
        <LibraryRow
          icon="library"
          title="Курси"
          description="Для глибокої роботи та довготривалих змін."
          viewAllLabel="Переглянути всі курси →"
          onViewAll={onViewAllCourses}
        >
          {courses.map((c) => (
            <LibraryCard
              key={c.id}
              badge="Курс"
                badgeIcon="library"
              title={c.title}
              meta={`${c.duration} · ${coursePrice(c)}`}
              onClick={() => onOpenCourse(c)}
            />
          ))}
        </LibraryRow>

        {/* SECTION 3 — Meditations */}
        <LibraryRow
          icon="meditation"
          title="Медитації"
          description="Коли потрібно швидко заспокоїтись і повернути відчуття контролю."
          viewAllLabel="Переглянути всі медитації →"
          onViewAll={onViewAllMeditations}
        >
          {meditations.map((m) => (
            <LibraryCard
              key={m.id}
              badge="Медитація"
                badgeIcon="meditation"
              title={m.title}
              meta={m.duration}
              onClick={() => onOpenMeditation(m)}
            />
          ))}
        </LibraryRow>

        {/* SECTION 4 — Guides */}
        <LibraryRow
          icon="guide"
          title="Гайди"
          description="Для тих, хто хоче краще зрозуміти свій стан і знайти практичні рішення."
          viewAllLabel="Переглянути всі гайди →"
          onViewAll={onViewAllGuides}
        >
          {guides.map((g) => (
            <LibraryCard
              key={g.id}
              badge="Гайд"
                badgeIcon="guide"
              title={g.title}
              meta={guideMeta(g)}
              onClick={() => onOpenGuide(g)}
            />
          ))}
        </LibraryRow>

        {/* FINAL SECTION */}
        <div className="border-t border-white/10 pt-16 text-center">
          <h2 className="text-2xl font-semibold mb-4">
            Не знайшли те, що шукали?
          </h2>

          <p className="text-white/60 max-w-lg mx-auto mb-8 leading-relaxed">
            Ви завжди можете переглянути всю бібліотеку матеріалів або
            змінити фільтри.
          </p>

          <button
            onClick={onViewEntireLibrary}
            className="
              px-8 py-4
              rounded-2xl
              bg-white
              text-black
              font-semibold
              hover:scale-[1.02]
              transition
            "
          >
            Переглянути всю бібліотеку
          </button>
        </div>
      </div>
    </div>
  );
}
