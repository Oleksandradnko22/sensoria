import { getContentAccent } from "../data/contentAccents";

type Props = {
  tags?: string[];
};

// The small floating glass circle in the upper-right of every content
// card's preview area — one shared component so courses, meditations,
// and guides all get identical treatment. Relies on the parent card
// already having `group` in its className (CourseCard, MeditationCard,
// and the Guides catalog cards all do) so the lift/glow/scale on hover
// responds to hovering the whole card, not just this small circle.
export default function CardAccent({ tags }: Props) {
  const accent = getContentAccent(tags);
  const Icon = accent.Icon;

  return (
    <div
      className={`
        absolute top-3 right-3
        w-14 h-14
        rounded-full
        flex items-center justify-center
        backdrop-blur-md
        border border-white/60
        transition-all duration-300 ease-out
        group-hover:-translate-y-1.5
        group-hover:scale-105
        ${accent.bg}
        ${accent.glow}
        ${accent.hoverGlow}
      `}
    >
      <Icon className={`w-6 h-6 ${accent.iconColor}`} />
    </div>
  );
}
