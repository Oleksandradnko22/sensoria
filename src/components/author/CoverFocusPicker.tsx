// Step "cover": the author drags the picture inside a frame (like repositioning a cover photo) until the important part
// is visible. The chosen position is shared by every frame of the site; the four small frames below show the result at
// once and also switch which frame is being edited. No sliders, no dots: the picture itself moves. Arrow keys work too.
import { useRef, useState } from "react";
import { COVER_FRAMES, MAX_COVER_ZOOM, MIN_COVER_ZOOM, clampZoom, coverImageStyle, coverUrlForFrame, focusForFrame, withFrameFocus, withFrameImage, type CoverFocus, type CoverFrameId } from "../../utils/coverFocus";

type Props = {
  url: string;
  focus: CoverFocus;
  onChange: (next: CoverFocus) => void;
  /** uploads a separate photo for one frame and returns its link (the editor owns storage and errors) */
  onUploadFrame?: (frame: CoverFrameId, file: File) => Promise<{ url: string; warning?: string } | { error: string }>;
};
type FrameId = CoverFrameId;

// The four small frames share one height and fill the whole row: column widths follow the frames' shapes.
const FRAME_COLS = COVER_FRAMES.map((f) => f.ratio.split("/").map(Number)).map(([w, h]) => `${(w / h).toFixed(3)}fr`).join(" ");
const frameRow = "mt-2 grid grid-cols-2 gap-x-4 gap-y-3 sm:[grid-template-columns:var(--cols)]";
const MAX_W: Record<FrameId, number> = { card: 640, wide: 640, cart: 480, square: 340 };
const clamp = (n: number) => Math.min(100, Math.max(0, n));

// The four frames of the site with the current cover, same height, side by side (read-only); each uses its own point.
export function CoverFramesPreview({ url, focus }: { url: string; focus: CoverFocus }) {
  return (
    <div>
      <div className="text-[16px] font-bold text-[#1d1a3b]">Так обкладинку побачать</div>
      <div className={frameRow} style={{ "--cols": FRAME_COLS } as React.CSSProperties}>
        {COVER_FRAMES.map((fr) => (
          <figure key={fr.id} className="m-0 min-w-0">
            <div className="overflow-hidden rounded-lg border border-black/10 bg-black/5" style={{ aspectRatio: fr.ratio }}>
              <img src={coverUrlForFrame(url, focus, fr.id)} alt="" className="h-full w-full object-cover" style={coverImageStyle(focus, fr.id)} />
            </div>
            <figcaption className="mt-1.5 text-[13px] leading-tight text-[#4b4a66]">
              <span className="font-semibold text-[#1d1a3b]">{fr.label}</span>
              <br />
              {fr.where}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

export default function CoverFocusPicker({ url, focus, onChange, onUploadFrame }: Props) {
  const [frameId, setFrameId] = useState<FrameId>("card");
  const [moved, setMoved] = useState(false); // the "drag me" hint goes away after the first move
  const [grabbing, setGrabbing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadNote, setUploadNote] = useState<string | null>(null);
  const [, setLoaded] = useState(0); // re-measure once the picture is loaded
  const box = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const drag = useRef<{ x: number; y: number; fx: number; fy: number } | null>(null);
  const frame = COVER_FRAMES.find((f) => f.id === frameId) ?? COVER_FRAMES[0];
  // Every frame has its own point: dragging moves the picture in the selected frame only.
  const point = focusForFrame(focus, frameId) ?? { x: 50, y: 50 };
  const zoom = clampZoom(point.zoom ?? 1);
  const frameUrl = coverUrlForFrame(url, focus, frameId);
  const hasOwnPhoto = !!focus.frames?.[frameId]?.url;
  const isCentre = Math.round(point.x) === 50 && Math.round(point.y) === 50 && zoom === 1;
  const setPoint = (p: { x: number; y: number }) => onChange(withFrameFocus(focus, frameId, { ...p, zoom }));
  const setZoom = (z: number) => onChange(withFrameFocus(focus, frameId, { x: point.x, y: point.y, zoom: clampZoom(z) }));

  // How far the picture overflows the frame (px) on each axis: only that distance can be dragged.
  const overflow = () => {
    const b = box.current?.getBoundingClientRect();
    const nw = img.current?.naturalWidth ?? 0;
    const nh = img.current?.naturalHeight ?? 0;
    if (!b || !nw || !nh) return { ow: 0, oh: 0 };
    const s = Math.max(b.width / nw, b.height / nh);
    // enlarging by `zoom` around the anchor point also moves the picture further per unit of position
    return { ow: Math.max(0, zoom * (nw * s - b.width) + (zoom - 1) * b.width), oh: Math.max(0, zoom * (nh * s - b.height) + (zoom - 1) * b.height) };
  };
  const { ow: ovX, oh: ovY } = overflow();

  const onKey = (e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget) return; // keys pressed on the zoom controls belong to those controls
    const step = e.shiftKey ? 10 : 3;
    if (e.key === "+" || e.key === "=") { e.preventDefault(); setZoom(zoom + 0.1); return; }
    if (e.key === "-") { e.preventDefault(); setZoom(zoom - 0.1); return; }
    const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const m = d[e.key];
    if (!m) return;
    e.preventDefault();
    setMoved(true);
    setPoint({ x: clamp(point.x + m[0]), y: clamp(point.y + m[1]) });
  };

  const fits = box.current != null && ovX < 1 && ovY < 1; // the whole picture is already visible in this frame

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="text-[16px] font-bold text-[#1d1a3b]">Покажіть головне на обкладинці</div>
        <p className="mt-1 text-[14px] leading-relaxed text-[#4b4a66]">
          Перетягніть зображення в рамці, щоб у кадрі лишилося найважливіше: обличчя, заголовок. Кожен формат налаштовується окремо: оберіть рамку внизу.
        </p>

        <div
          ref={box}
          role="group"
          tabIndex={0}
          aria-label={`Рамка ${frame.label}, ${frame.where}. Стрілки на клавіатурі зсувають зображення, + і − змінюють масштаб.`}
          onKeyDown={onKey}
          className={`relative mt-3 w-full touch-none select-none overflow-hidden rounded-xl border-2 border-[#5b3df5] bg-black/5 shadow-[0_8px_24px_-14px_rgba(91,61,245,0.7)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4f46e5]/50 ${grabbing ? "cursor-grabbing" : "cursor-grab"}`}
          style={{ aspectRatio: frame.ratio, maxWidth: MAX_W[frameId] }}
          onPointerDown={(e) => {
            drag.current = { x: e.clientX, y: e.clientY, fx: point.x, fy: point.y };
            e.currentTarget.setPointerCapture(e.pointerId);
            setGrabbing(true);
          }}
          onPointerMove={(e) => {
            const s = drag.current;
            if (!s) return;
            const { ow, oh } = overflow();
            // dragging the picture right shows more of its left part, so the focus moves left
            setPoint({
              x: ow > 0.5 ? clamp(s.fx - ((e.clientX - s.x) / ow) * 100) : point.x,
              y: oh > 0.5 ? clamp(s.fy - ((e.clientY - s.y) / oh) * 100) : point.y,
            });
            setMoved(true);
          }}
          onPointerUp={() => { drag.current = null; setGrabbing(false); }}
          onPointerCancel={() => { drag.current = null; setGrabbing(false); }}
        >
          <img ref={img} src={frameUrl} alt="" draggable={false} onLoad={() => setLoaded((n) => n + 1)} className="pointer-events-none h-full w-full object-cover" style={coverImageStyle(focus, frameId)} />
          {/* zoom lives inside the frame itself; pressing it must not start a drag */}
          <div
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute bottom-2.5 right-2.5 z-10 flex items-center gap-1 rounded-full bg-white/95 p-1 shadow-[0_6px_18px_-8px_rgba(30,20,110,0.55)] ring-1 ring-[#e3def9]"
          >
            <button type="button" onClick={() => setZoom(zoom - 0.1)} disabled={zoom <= MIN_COVER_ZOOM} aria-label="Зменшити масштаб" className="grid h-10 w-10 place-items-center rounded-full text-[22px] font-semibold leading-none text-[#4a2fd0] transition hover:bg-[#ece9fe] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50 disabled:opacity-35">−</button>
            <input
              type="range"
              min={MIN_COVER_ZOOM * 100}
              max={MAX_COVER_ZOOM * 100}
              step={5}
              value={Math.round(zoom * 100)}
              onChange={(e) => setZoom(Number(e.target.value) / 100)}
              aria-label={`Масштаб рамки ${frame.label}`}
              className="hidden h-2 w-24 cursor-pointer accent-[#5b3df5] sm:block"
            />
            <span className="w-12 text-center text-[14px] font-semibold tabular-nums text-[#2d2a5c]" aria-live="polite">{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => setZoom(zoom + 0.1)} disabled={zoom >= MAX_COVER_ZOOM} aria-label="Збільшити масштаб" className="grid h-10 w-10 place-items-center rounded-full text-[22px] font-semibold leading-none text-[#4a2fd0] transition hover:bg-[#ece9fe] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50 disabled:opacity-35">+</button>
          </div>
          {!moved && !fits && (
            <span aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full bg-black/60 px-3.5 py-2 text-[13px] font-medium text-white">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" /></svg>
              Перетягніть
            </span>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => { onChange(withFrameFocus(focus, frameId, { x: 50, y: 50, zoom: 1 })); setMoved(false); }}
            disabled={isCentre}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[#d9d4f5] bg-white px-4 text-[14px] font-semibold text-[#4a2fd0] transition hover:bg-[#f3efff] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50 disabled:opacity-40"
          >
            <span aria-hidden="true">↺</span> Скинути позицію і масштаб
          </button>
          {fits && <span className="text-[14px] text-[#4b4a66]">У цій рамці видно все зображення. Оберіть вужчу рамку нижче, щоб зсунути його.</span>}
        </div>

        {onUploadFrame && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-[#e3def9] bg-[#faf9ff] p-3.5">
            <div className="min-w-0 flex-1 basis-[260px]">
              <div className="text-[14px] font-semibold text-[#1d1a3b]">{hasOwnPhoto ? `Для формату «${frame.label}» вибрано окреме фото` : `Окреме фото для формату «${frame.label}»`}</div>
              <p className="mt-0.5 text-[14px] leading-snug text-[#4b4a66]">Можна додати інше фото саме для цієї рамки. Інші формати не зміняться.</p>
            </div>
            <label className="inline-flex min-h-[44px] cursor-pointer items-center rounded-xl border border-[#d9d4f5] bg-white px-4 text-[14px] font-semibold text-[#4a2fd0] transition hover:bg-[#f3efff] focus-within:ring-2 focus-within:ring-[#5b3df5]/50">
              {uploading ? "Завантаження…" : hasOwnPhoto ? "Замінити фото" : "Додати фото"}
              <input
                type="file"
                accept="image/jpeg,image/png"
                disabled={uploading}
                className="sr-only"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  setUploading(true);
                  setUploadError(null);
                  setUploadNote(null);
                  try {
                    const next = await onUploadFrame(frameId, file);
                    if ("url" in next) { onChange(withFrameImage(focus, frameId, next.url)); setMoved(false); setUploadNote(next.warning ?? null); }
                    else setUploadError(next.error);
                  } finally {
                    setUploading(false);
                  }
                }}
              />
            </label>
            {uploadNote && <p role="status" className="w-full rounded-xl bg-[#fff7e6] px-3.5 py-2.5 text-[14px] leading-snug text-[#7a4a00]">{uploadNote}</p>}
            {uploadError && <p role="alert" className="w-full text-[14px] leading-snug text-rose-700">{uploadError}</p>}
            {hasOwnPhoto && (
              <button type="button" onClick={() => { onChange(withFrameImage(focus, frameId, undefined)); setMoved(false); setUploadError(null); }} className="inline-flex min-h-[44px] items-center rounded-xl px-3 text-[14px] font-semibold text-[#4a2fd0] underline underline-offset-4 hover:text-[#2d2a5c] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50">
                Повернути спільне фото
              </button>
            )}
          </div>
        )}
      </div>

      <div>
        <div className="text-[16px] font-bold text-[#1d1a3b]">Так обкладинку побачать</div>
        <p className="mt-1 text-[14px] text-[#4b4a66]">Натисніть на рамку, щоб налаштувати саме її. Інші рамки не зміняться.</p>
        <div className={frameRow} style={{ "--cols": FRAME_COLS } as React.CSSProperties} role="group" aria-label="Рамки показу">
          {COVER_FRAMES.map((fr) => {
            const on = fr.id === frameId;
            return (
              <button key={fr.id} type="button" aria-pressed={on} onClick={() => { setFrameId(fr.id); setMoved(false); }} className="group m-0 min-w-0 text-left focus:outline-none">
                <div className={`overflow-hidden rounded-lg border-2 bg-black/5 transition group-focus-visible:ring-2 group-focus-visible:ring-[#4f46e5]/50 ${on ? "border-[#5b3df5] shadow-[0_8px_18px_-10px_rgba(91,61,245,0.9)]" : "border-black/10 group-hover:border-[#b8abf7]"}`} style={{ aspectRatio: fr.ratio }}>
                  <img src={coverUrlForFrame(url, focus, fr.id)} alt="" className="h-full w-full object-cover" style={coverImageStyle(focus, fr.id)} />
                </div>
                <div className="mt-1.5 text-[13px] leading-tight text-[#4b4a66]">
                  <span className={`font-semibold ${on ? "text-[#5b3df5]" : "text-[#1d1a3b]"}`}>{fr.label}</span>
                  <br />
                  {fr.where}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
