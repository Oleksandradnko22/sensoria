// A cover is shown in many frames (catalog card, home carousel, cart, author page, lists, program header), each
// with a different shape. The picture is always cropped to fill the frame ("cover"). The author picks a focal point:
// `x`/`y` is the point every frame uses, and `frames` may hold a point of its own for any single frame (the four
// shapes below), so one picture can be placed differently in the catalog card than in the cart. Old data has only
// x/y, which keeps working: a frame without its own point uses x/y.
export const MIN_COVER_ZOOM = 1;
export const MAX_COVER_ZOOM = 3;
/** `zoom` 1 = the picture just fills the frame; up to 3 = enlarged around the chosen point. */
/** `url`: a separate photo for this frame only (otherwise every frame shows the program cover). */
export type CoverFramePoint = { x: number; y: number; zoom?: number; url?: string };
export type CoverFrameId = "card" | "wide" | "cart" | "square";
export type CoverFocus = CoverFramePoint & { frames?: Partial<Record<CoverFrameId, CoverFramePoint>> };

export const DEFAULT_COVER_FOCUS: CoverFocus = { x: 50, y: 50 };
const FRAME_IDS: readonly CoverFrameId[] = ["card", "wide", "cart", "square"];

const clamp = (n: number) => Math.min(100, Math.max(0, Math.round(n)));
export const clampZoom = (z: number) => Math.min(MAX_COVER_ZOOM, Math.max(MIN_COVER_ZOOM, Math.round(z * 100) / 100));

function parsePoint(value: unknown): CoverFramePoint | undefined {
  if (!value || typeof value !== "object") return undefined;
  const { x, y, zoom, url } = value as { x?: unknown; y?: unknown; zoom?: unknown; url?: unknown };
  if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) return undefined;
  const z = typeof zoom === "number" && Number.isFinite(zoom) ? clampZoom(zoom) : 1;
  const out: CoverFramePoint = { x: clamp(x), y: clamp(y) };
  if (z > 1) out.zoom = z;
  if (typeof url === "string" && /^https?:\/\//.test(url) && url.length < 2000) out.url = url;
  return out;
}

export function parseCoverFocus(value: unknown): CoverFocus | undefined {
  const base = parsePoint(value);
  if (!base) return undefined;
  const raw = (value as { frames?: unknown }).frames;
  if (!raw || typeof raw !== "object") return base;
  const frames: Partial<Record<CoverFrameId, CoverFramePoint>> = {};
  for (const id of FRAME_IDS) {
    const pt = parsePoint((raw as Record<string, unknown>)[id]);
    if (pt) frames[id] = pt;
  }
  return Object.keys(frames).length > 0 ? { ...base, frames } : base;
}

/** The point used for one frame: its own when the author set one, otherwise the common point. */
export function focusForFrame(focus: CoverFocus | null | undefined, frame?: CoverFrameId): CoverFramePoint | undefined {
  if (!focus) return undefined;
  return (frame && focus.frames?.[frame]) || (focus.zoom && focus.zoom > 1 ? { x: focus.x, y: focus.y, zoom: focus.zoom } : { x: focus.x, y: focus.y });
}

/** `object-position` for a picture shown in `frame` (omit `frame` for the common point). */
export function coverObjectPosition(focus?: CoverFocus | null, frame?: CoverFrameId): string | undefined {
  const pt = focusForFrame(focus, frame);
  if (!pt) return undefined;
  return `${clamp(pt.x)}% ${clamp(pt.y)}%`;
}

/** A copy of `focus` with one frame's own point set. */
export function withFrameFocus(focus: CoverFocus, frame: CoverFrameId, point: CoverFramePoint): CoverFocus {
  const z = clampZoom(point.zoom ?? 1);
  const url = "url" in point ? point.url : focus.frames?.[frame]?.url;
  const pt: CoverFramePoint = { x: clamp(point.x), y: clamp(point.y) };
  if (z > 1) pt.zoom = z;
  if (url) pt.url = url;
  return { ...focus, frames: { ...(focus.frames ?? {}), [frame]: pt } };
}

/** A copy of `focus` where one frame has its own photo (`url`) or goes back to the program cover (`undefined`). */
export function withFrameImage(focus: CoverFocus, frame: CoverFrameId, url: string | undefined): CoverFocus {
  const prev = focus.frames?.[frame];
  const next: CoverFocus = { ...focus, frames: { ...(focus.frames ?? {}) } };
  const pt: CoverFramePoint = { x: prev?.x ?? 50, y: prev?.y ?? 50 };
  if (prev?.zoom) pt.zoom = prev.zoom;
  if (url) pt.url = url;
  // a new photo starts from the centre: the old point belonged to another picture
  if (url && url !== prev?.url) { pt.x = 50; pt.y = 50; delete pt.zoom; }
  if (!url && !prev) return focus;
  next.frames![frame] = pt;
  return next;
}

/** The picture a frame shows: its own photo when the author added one, otherwise the program cover. */
export function coverUrlForFrame<T extends string | null | undefined>(coverUrl: T, focus: CoverFocus | null | undefined, frame: CoverFrameId): T | string {
  return (focus?.frames?.[frame]?.url as string | undefined) || coverUrl;
}

/**
 * Inline style for a cover picture inside `frame`: where the picture is anchored and how much it is enlarged around that
 * point. Uses the separate CSS `scale` property so it never fights a hover `transform` on the same picture.
 */
// Safari before 14.1 / old Android WebViews do not know the separate `scale` property: they get `transform` instead.
const SCALE_PROPERTY: boolean = typeof CSS === "undefined" || typeof CSS.supports !== "function" || CSS.supports("scale", "1");

export function coverImageStyle(focus?: CoverFocus | null, frame?: CoverFrameId): { objectPosition?: string; scale?: string; transform?: string; transformOrigin?: string } {
  const pt = focusForFrame(focus, frame);
  if (!pt) return {};
  const pos = `${clamp(pt.x)}% ${clamp(pt.y)}%`;
  const z = clampZoom(pt.zoom ?? 1);
  if (z <= 1) return { objectPosition: pos };
  return SCALE_PROPERTY ? { objectPosition: pos, scale: String(z), transformOrigin: pos } : { objectPosition: pos, transform: `scale(${z})`, transformOrigin: pos };
}

// Every shape the cover appears in, for the author's preview.
export const COVER_FRAMES = [
  { id: "card", label: "Каталог", where: "Картка в каталозі", ratio: "3 / 1" },
  { id: "wide", label: "16:9", where: "Сторінка автора, головна", ratio: "16 / 9" },
  { id: "cart", label: "3:2", where: "Кошик", ratio: "3 / 2" },
  { id: "square", label: "1:1", where: "Списки та мініатюри", ratio: "1 / 1" },
] as const;

/**
 * A NEW main picture replaces the old one: positions and zoom that were set for the old picture no longer fit it, so they
 * start again from the centre. Separate photos added for single frames are other pictures and are kept as they were.
 */
export function focusForNewCover(focus: CoverFocus): CoverFocus {
  const kept: Partial<Record<CoverFrameId, CoverFramePoint>> = {};
  for (const id of FRAME_IDS) {
    const pt = focus.frames?.[id];
    if (pt?.url) kept[id] = pt;
  }
  return Object.keys(kept).length > 0 ? { x: 50, y: 50, frames: kept } : { x: 50, y: 50 };
}
