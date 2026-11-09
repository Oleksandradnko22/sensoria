// The INTERACTIVE face of a structured guide (2026-10-06): turns the guide's
// block list (data/guideContent.ts) into the web experience. It knows
// nothing about any particular guide — the same renderer serves every guide
// built on the block model. Its static counterpart is GuideStaticRenderer.
//
// Rhythm: Read → Notice → Try → Reflect → Choose. Each section is a numbered
// editorial chapter; interaction sits inside the text flow. Nothing counts,
// scores or rewards. A section is reported as "seen" (for the platform's
// existing section-based progress) when it has actually been on screen.
import { useEffect, useRef } from "react";
import type { GuideBlockV2, GuideContent, GuideSection } from "../../data/guideContent";
import { SECTIONS_PER_PAGE, groupIntoSections, paginateSections } from "../../data/guideContent";
import { isSectionAnswered } from "../../utils/guideInteraction";
import type { RelatedItem, RelatedKind } from "../../utils/guideRelated";
import { BookmarkIcon, CheckIcon } from "./GuideIcons";
import GuideRelatedTiles from "./GuideRelatedTiles";
import {
  Callout,
  Choices,
  DecisionTree,
  Flow,
  ReflectionField,
  RichText,
  Scale,
  TimerPractice,
  compareValueFor,
} from "./GuideInteractiveBlocks";
import { reflectionItemId, type GuideAnswersApi } from "./useGuideAnswers";

type Props = {
  guideId: string;
  // The person's answers — owned by the reader so it can also summarise them.
  guide: GuideAnswersApi;
  content: GuideContent;
  userId: string | null | undefined;
  related: RelatedItem[];
  onOpenRelated: (kind: RelatedKind, id: string) => void;
  // Called (once per section per mount) when a section has been on screen.
  onSectionSeen?: (sectionKey: string) => void;
  // Zero-based reading page; the reader owns it (it scrolls to the top and
  // decides where the closing feedback goes).
  page: number;
  onPageChange: (page: number) => void;
  // "Зберегти конкретну частину": bookmark one paragraph or note.
  fragments?: {
    isSaved: (blockId: string) => boolean;
    toggle: (blockId: string, text: string) => void;
  };
};

export default function GuideInteractiveRenderer({
  guideId,
  guide,
  content,
  userId,
  related,
  onOpenRelated,
  onSectionSeen,
  page,
  onPageChange,
  fragments,
}: Props) {
  const allSections = groupIntoSections(content);
  const pages = paginateSections(allSections, SECTIONS_PER_PAGE);
  const sections = pages[Math.min(page, pages.length - 1)] ?? [];
  const lastPage = pages.length - 1;
  const { answers } = guide;

  // Report sections as they are actually reached.
  const seen = useRef<Set<string>>(new Set());
  const refs = useRef<(HTMLElement | null)[]>([]);
  useEffect(() => {
    if (!onSectionSeen) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const key = (entry.target as HTMLElement).dataset.sectionKey;
          if (!key || seen.current.has(key)) continue;
          seen.current.add(key);
          onSectionSeen(key);
        }
      },
      { threshold: 0.3 }
    );
    refs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [onSectionSeen, page, sections.length]);

  const renderBlock = (block: GuideBlockV2) => {
    switch (block.type) {
      case "heading":
        return null; // drawn by the section header
      case "rich_text":
        return <RichText text={block.text} />;
      case "callout":
        return <Callout block={block} />;
      case "flow":
        return <Flow block={block} />;
      case "checklist":
      case "action_plan":
        return (
          <Choices
            block={block}
            selected={answers.selections[block.id] ?? []}
            onToggle={(index) => guide.setChoice(block, index)}
          />
        );
      case "scale":
        return (
          <Scale
            block={block}
            value={answers.scales[block.id]}
            compareValue={compareValueFor(block, answers)}
            onChange={(value) => guide.setScale(block, value)}
          />
        );
      case "timer_practice":
        return (
          <TimerPractice
            block={block}
            done={answers.practices[block.id] === true}
            onDone={() => guide.markPractice(block.id)}
          />
        );
      case "decision_tree":
        return (
          <DecisionTree
            block={block}
            selectedBranchId={answers.branches[block.id]}
            onSelect={(branchId) => guide.setBranch(block.id, branchId)}
          />
        );
      case "reflection":
        return (
          <ReflectionField
            block={block}
            history={guide.reflectionHistory[block.id] ?? []}
            canSave={Boolean(userId)}
            onSave={(text) => guide.saveReflection(block, text)}
            draftKey={userId ? `sensoria:guide-draft:${userId}:${reflectionItemId(guideId, block.id)}` : undefined}
          />
        );
      case "recommendation":
        // Nothing real to recommend → nothing drawn (never a placeholder).
        if (related.length === 0) return null;
        return (
          <div>
            {block.prompt && <div className="text-[16px] text-black/60 mb-4">{block.prompt}</div>}
            <GuideRelatedTiles
              items={related.slice(0, block.limit ?? related.length)}
              onOpen={onOpenRelated}
              columns={1}
            />
          </div>
        );
      case "media":
        return (
          <figure>
            <img src={block.url} alt={block.alt} className="w-full rounded-[24px]" />
            {block.caption && <figcaption className="text-[13.5px] text-black/45 mt-2">{block.caption}</figcaption>}
          </figure>
        );
      case "divider":
        return <hr className="border-black/10" />;
    }
  };

  return (
    <div className="flex flex-col gap-16 md:gap-24">
      {sections.map((section: GuideSection, i) => (
        <section
          key={section.index}
          data-section-key={section.key}
          ref={(el) => {
            refs.current[i] = el;
          }}
          aria-labelledby={section.heading ? `guide-sec-${section.index}` : undefined}
        >
          {section.heading && (
            <header className="mb-7 md:mb-9">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-[13px] font-semibold tracking-[0.16em] text-indigo-400">{section.number}</span>
                {isSectionAnswered(section, answers) && (
                  <span className="text-indigo-400" title="Ви відповіли на запитання цього розділу">
                    <CheckIcon size={14} />
                  </span>
                )}
              </div>
              <h2
                id={`guide-sec-${section.index}`}
                className="text-[28px] md:text-[38px] leading-[1.1] font-bold tracking-tight text-black"
              >
                {section.heading.text}
              </h2>
            </header>
          )}
          <div className="flex flex-col gap-8 md:gap-10">
            {section.blocks.map(({ block, blockIndex }) => {
              const node = renderBlock(block);
              if (!node) return null;
              const savable = fragments && userId && (block.type === "rich_text" || block.type === "callout");
              if (!savable) return <div key={blockIndex} data-block-id={block.id} className="rounded-lg">{node}</div>;
              const saved = fragments.isSaved(block.id);
              return (
                <div key={blockIndex} data-block-id={block.id} className="group relative rounded-lg">
                  {node}
                  <button
                    type="button"
                    onClick={() => fragments.toggle(block.id, block.text)}
                    aria-pressed={saved}
                    aria-label={saved ? "Прибрати зі збережених" : "Зберегти цю частину"}
                    title={saved ? "Збережено" : "Зберегти цю частину"}
                    className={`absolute -right-1 top-0 md:-right-12 w-9 h-9 rounded-full inline-flex items-center justify-center transition ${
                      saved
                        ? "text-indigo-500"
                        : "text-black/25 hover:text-indigo-500 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100"
                    }`}
                  >
                    <BookmarkIcon filled={saved} size={17} />
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      ))}
      {pages.length > 1 && (
        <nav className="flex items-center justify-between gap-4 border-t border-black/[0.07] pt-8" aria-label="Сторінки гайду">
          {page > 0 ? (
            <button
              onClick={() => onPageChange(page - 1)}
              className="px-6 py-3 rounded-full border border-black/10 bg-white/70 text-[14px] font-medium text-black/70 hover:bg-white hover:border-black/20 transition"
            >
              ← Назад
            </button>
          ) : (
            <span />
          )}
          <span className="text-[13px] text-black/40">
            Сторінка {page + 1} з {pages.length}
          </span>
          {page < lastPage ? (
            <button
              onClick={() => onPageChange(page + 1)}
              className="px-7 py-3 rounded-full bg-gradient-to-r from-[#2f6bff] to-[#8b5cf6] text-white text-[14px] font-semibold shadow-[0_10px_28px_rgba(79,70,229,0.3)] hover:opacity-90 transition"
            >
              Далі →
            </button>
          ) : (
            <span />
          )}
        </nav>
      )}
      {guide.error && (
        <div role="alert" className="text-[13px] text-red-500">
          {guide.error}
        </div>
      )}
    </div>
  );
}
