// The STATIC / print / PDF face of a structured guide (2026-10-06).
//
// Deliberately dumb: no hooks, no state, no effects, no event handlers, no
// browser APIs. It draws the pure StaticBlock list from data/guideStatic.ts
// and nothing else, so it is guaranteed to render identically with
// JavaScript interaction absent — on screen, on paper, or as a PDF.
// Everything an interactive block asks (a rating, a choice, a written
// practice, a branch, a blank for notes) is drawn here as something you can
// do with a pen.
import type { StaticBlock } from "../../data/guideStatic";

const BOX = "inline-block w-[15px] h-[15px] border-[1.5px] border-black/60 rounded-[3px] shrink-0 mt-[3px]";

function Block({ block }: { block: StaticBlock }) {
  switch (block.kind) {
    case "heading":
      return (
        <div className="mt-9 mb-3 break-after-avoid">
          <div className="text-[11px] font-semibold tracking-[0.18em] text-black/40">{block.number}</div>
          <h2 className="text-[22px] font-bold leading-tight text-black">{block.text}</h2>
          {block.summary && <p className="text-[13px] text-black/55 mt-1">{block.summary}</p>}
        </div>
      );
    case "paragraphs":
      return (
        <div className="flex flex-col gap-2.5">
          {block.paragraphs.map((p, i) => (
            <p key={i} className="text-[14px] leading-[1.65] text-black/80">
              {p}
            </p>
          ))}
        </div>
      );
    case "callout":
      return (
        <div className="border-l-[3px] border-black/30 pl-4 py-1 break-inside-avoid">
          {block.title && <div className="text-[13px] font-semibold text-black/85">{block.title}</div>}
          <p className="text-[13.5px] leading-relaxed text-black/70">{block.text}</p>
        </div>
      );
    case "flow":
      return (
        <div className="break-inside-avoid">
          {block.title && <div className="text-[13px] font-semibold text-black/85 mb-2">{block.title}</div>}
          <ol className="flex flex-col gap-1.5">
            {block.steps.map((step, i) => (
              <li key={i} className="text-[13.5px] text-black/75 flex gap-2">
                <span className="text-black/35">{i < block.steps.length - 1 ? "↓" : "•"}</span>
                <span>
                  <strong className="font-semibold text-black/90">{step.label}</strong>
                  {step.text ? ` — ${step.text}` : ""}
                </span>
              </li>
            ))}
          </ol>
          {block.caption && <p className="text-[12.5px] text-black/50 mt-2">{block.caption}</p>}
        </div>
      );
    case "checkboxes":
      return (
        <div className="break-inside-avoid">
          <div className="text-[14px] font-semibold text-black/90">{block.prompt}</div>
          {block.instructions && <div className="text-[12.5px] text-black/50 mb-2">{block.instructions}</div>}
          <ul className="flex flex-col gap-2 mt-1.5">
            {block.items.map((item, i) => (
              <li key={i} className="flex items-start gap-2.5 text-[13.5px] text-black/80">
                <span className={BOX} />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      );
    case "number_scale":
      return (
        <div className="break-inside-avoid">
          <div className="text-[14px] font-semibold text-black/90">{block.prompt}</div>
          <div className="text-[12.5px] text-black/50 mb-2.5">{block.instructions}</div>
          <div className="flex gap-1.5">
            {block.values.map((value) => (
              <span
                key={value}
                className="flex-1 min-w-0 h-8 border-[1.5px] border-black/50 rounded-[6px] text-[12.5px] font-medium text-black/75 inline-flex items-center justify-center"
              >
                {value}
              </span>
            ))}
          </div>
          {(block.lowLabel || block.highLabel) && (
            <div className="flex justify-between text-[11.5px] text-black/45 mt-1.5">
              <span>{block.lowLabel}</span>
              <span>{block.highLabel}</span>
            </div>
          )}
        </div>
      );
    case "writing_area":
      return (
        <div className="break-inside-avoid">
          <div className="text-[14px] font-semibold text-black/90 mb-1">{block.prompt}</div>
          {Array.from({ length: block.lines }).map((_, i) => (
            <div key={i} className="h-8 border-b border-black/30" />
          ))}
        </div>
      );
    case "instructions":
      return (
        <div className="break-inside-avoid">
          <div className="text-[14px] font-semibold text-black/90">{block.title}</div>
          {block.intro && <p className="text-[13px] text-black/55 mt-0.5 mb-2">{block.intro}</p>}
          <ol className="flex flex-col gap-1.5 mt-1.5">
            {block.steps.map((step, i) => (
              <li key={i} className="text-[13.5px] leading-relaxed text-black/80 flex gap-3">
                <span className="w-5 shrink-0 font-semibold text-black/50">{i + 1}.</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <p className="text-[13px] text-black/60 mt-2">{block.doneText}</p>
        </div>
      );
    case "tree":
      return (
        <div className="break-inside-avoid">
          <div className="text-[14px] font-semibold text-black/90 mb-2">{block.prompt}</div>
          <ul className="flex flex-col gap-2.5 border-l-2 border-black/15 pl-4">
            {block.branches.map((branch, i) => (
              <li key={i} className="text-[13.5px] leading-relaxed text-black/80">
                <span className="font-semibold text-black/90">Якщо — {branch.label}</span>
                <span className="text-black/40"> → </span>
                {branch.step}
              </li>
            ))}
          </ul>
        </div>
      );
    case "image":
      return (
        <figure className="break-inside-avoid">
          <img src={block.url} alt={block.alt} className="w-full rounded-md" />
          {block.caption && <figcaption className="text-[12px] text-black/50 mt-1">{block.caption}</figcaption>}
        </figure>
      );
    case "divider":
      return <hr className="border-black/15 my-2" />;
  }
}

export default function GuideStaticRenderer({
  title,
  subtitle,
  blocks,
}: {
  title: string;
  subtitle?: string;
  blocks: StaticBlock[];
}) {
  return (
    <article className="text-black">
      <header className="pb-4 border-b border-black/20">
        <div className="text-[10.5px] font-semibold tracking-[0.2em] text-black/40">SENSORIA</div>
        <h1 className="text-[30px] font-bold leading-tight mt-1">{title}</h1>
        {subtitle && <p className="text-[13.5px] text-black/55 mt-1.5">{subtitle}</p>}
      </header>
      <div className="flex flex-col gap-5 pt-3">
        {blocks.map((block, i) => (
          <Block key={i} block={block} />
        ))}
      </div>
    </article>
  );
}
