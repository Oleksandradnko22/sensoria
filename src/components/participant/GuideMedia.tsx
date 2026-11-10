// One picture of a guide with its crop, size and caption position. Pure (no hooks, no
// state), so the interactive reader, the printed version and the builder's canvas draw
// exactly the same thing.
import type { MediaCaptionPosition } from "../../data/guideContent";

export type GuideMediaProps = {
  url: string;
  alt: string;
  caption?: string;
  ratio?: number;
  zoom?: number;
  focus?: { x: number; y: number };
  width?: number;
  captionPosition?: MediaCaptionPosition;
};

export const MEDIA_MIN_WIDTH = 25;
export const MEDIA_MAX_ZOOM = 4;
export const MEDIA_MIN_RATIO = 0.5;
export const MEDIA_MAX_RATIO = 3;
// with the caption beside the picture, the text keeps at least a quarter of the row
export const MEDIA_SIDE_MAX_WIDTH = 75;

export const clampWidth = (w: number | undefined, side: boolean) => Math.min(side ? MEDIA_SIDE_MAX_WIDTH : 100, Math.max(MEDIA_MIN_WIDTH, w ?? 100));

// The picture inside its frame: crop focus and zoom (the frame itself is clipped by the parent).
export function mediaImageStyle(m: Pick<GuideMediaProps, "ratio" | "zoom" | "focus">): React.CSSProperties | undefined {
  const cropped = Boolean(m.ratio) || (m.zoom ?? 1) > 1;
  if (!cropped) return undefined;
  const f = m.focus ?? { x: 50, y: 50 };
  return { objectPosition: `${f.x}% ${f.y}%`, transformOrigin: `${f.x}% ${f.y}%`, transform: (m.zoom ?? 1) > 1 ? `scale(${m.zoom})` : undefined };
}

// With a caption the picture and the text are ONE card (no outline around the text): the picture runs
// to the card's edge, the text sits on the same soft background. Without a caption it is just the picture.
export default function GuideMedia({ url, alt, caption, ratio, zoom, focus, width, captionPosition = "bottom" }: GuideMediaProps) {
  if (!url) return null; // a private picture the person has no access to
  const hasCaption = Boolean(caption && caption.trim());
  const side = hasCaption && (captionPosition === "left" || captionPosition === "right");
  const w = clampWidth(width, side);
  const cropped = Boolean(ratio) || (zoom ?? 1) > 1;
  const picture = (
    <div className="overflow-hidden" style={ratio ? { aspectRatio: String(ratio) } : undefined}>
      <img src={url} alt={alt} className={cropped ? "h-full w-full object-cover" : "block h-auto w-full"} style={mediaImageStyle({ ratio, zoom, focus })} />
    </div>
  );

  if (!hasCaption) {
    return (
      <figure className="mx-auto overflow-hidden rounded-[24px]" style={{ width: `${w}%` }}>
        {picture}
      </figure>
    );
  }

  const text = (
    <figcaption className="flex min-w-0 flex-1 flex-col justify-center px-6 py-6 sm:px-8">
      <span aria-hidden="true" className="mb-3 h-1 w-10 rounded-full bg-gradient-to-r from-[#5232f4] to-[#774eff]" />
      <span className="text-[17px] font-medium leading-relaxed text-[#2d2a5c]">{caption}</span>
    </figcaption>
  );
  const card = "overflow-hidden rounded-[24px] bg-gradient-to-br from-[#f8f6ff] to-[#ece9fe]";

  if (side) {
    return (
      <figure className={`${card} flex flex-col ${captionPosition === "left" ? "sm:flex-row-reverse" : "sm:flex-row"}`}>
        <div className="w-full sm:w-auto sm:shrink-0" style={{ flexBasis: `${w}%` }}>
          <div className="h-full">{picture}</div>
        </div>
        {text}
      </figure>
    );
  }
  return (
    <figure className={`${card} mx-auto flex flex-col`} style={{ width: `${w}%` }}>
      {captionPosition === "top" && text}
      {picture}
      {captionPosition !== "top" && text}
    </figure>
  );
}
