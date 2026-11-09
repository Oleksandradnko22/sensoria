// The built-in cover editor (a small Canva): ready-made starts, layers (text, photos, shapes) that can be dragged,
// resized and rotated, backgrounds, undo/redo. The result is a normal JPEG that goes through the usual cover upload.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useModal } from "./public/useModal";
import { renderDoc, sizeOfEl, starterDoc } from "./coverRender";
import { CATEGORY_PALETTES, COVER_H, COVER_TEMPLATES, COVER_W, READY_BACKGROUNDS, paletteFor } from "../../utils/coverTemplates";
import {
  EMPTY_HISTORY, FONTS, addEl, centerOf, commit, cropEdge, cropOf, cropPan, cropRect, cropToRatio, cropZoom, duplicateEl, fitWithin, newImage, newShape, newSticker, newText, redo as redoH, removeEl, reorderEl, rotatePoint, snapToCenter, toLocal, topHit,
  undo as undoH, updateEl, type CoverDoc, type CoverEl, type History, type PhotoSource, type TextEl,
} from "../../utils/coverDoc";
import { categoryLabels } from "../../data/categoryLabels";
import { canFill, themedStickers } from "../../utils/coverStickers";

type Props = {
  title: string; // the program title: the starting text
  categoryId: string | null; // the primary category: sets the starting colours
  categoryIds?: string[]; // every chosen category: only elements that suit them are offered
  onDone: (file: File) => void;
  onClose: () => void;
};

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const MAX_PHOTO_SIDE = 2400; // longer photos are shrunk once when added
const SWATCHES = ["#ffffff", "#1d1a3b", "#5b3df5", "#f59e0b", "#10b981", "#ef4444", "#ec4899", "#0ea5e9", "#f3efff", "#fde68a"];
// Every place the cover is shown, cropped differently; the author confirms each crop before saving.
// The frame block has a fixed footprint: its height comes from the side cards, never from what is inside it.
const FRAME_BLOCK_MIN = 150;
const FRAMES = [
  { label: "Каталог 3:1", where: "Картка в каталозі", r: 3 },
  { label: "16:9", where: "Сторінка автора, головна", r: 16 / 9 },
  { label: "3:2", where: "Кошик", r: 1.5 },
  { label: "1:1", where: "Списки та мініатюри", r: 1 },
];

type Drag = {
  mode: "move" | "resize" | "rotate" | "pan" | "crop";
  handle: string;
  id: string;
  pt: { x: number; y: number };
  el: CoverEl;
  size: { w: number; h: number };
  before: CoverDoc;
  moved: boolean;
};

const chip = (on: boolean) => `rounded-lg border px-3 py-1.5 [@media(pointer:coarse)]:min-h-[44px] text-[13px] font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50 ${on ? "border-[#5b3df5] bg-[#f3efff] text-[#4a2fd0]" : "border-[#e3e6f4] bg-white text-black/70 hover:bg-[#faf9ff]"}`;
const tool = "inline-flex min-h-[38px] [@media(pointer:coarse)]:min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-[#e3e6f4] bg-white px-3 text-[13px] font-medium text-[#1d1a3b] transition hover:border-[#cfc6fb] hover:bg-[#f3efff] disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50";

function Section({ title, children, spread }: { title: string; children: React.ReactNode; spread?: boolean }) {
  return (
    <section className={`flex flex-col gap-2 ${spread ? "min-h-0 flex-1 justify-between gap-3" : ""}`}>
      <h3 className="text-[12px] font-bold uppercase tracking-[0.08em] text-[#6b5fc7]">{title}</h3>
      {children}
    </section>
  );
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (c: string) => void }) {
  return (
    <div>
      <div className="mb-1.5 text-[12px] text-black/70">{label}</div>
      <div className="flex flex-wrap items-center gap-1.5">
        {SWATCHES.map((c) => (
          <button key={c} type="button" aria-label={`Колір ${c}`} aria-pressed={value.toLowerCase() === c} onClick={() => onChange(c)} className={`h-7 w-7 rounded-full border-2 ${value.toLowerCase() === c ? "border-[#5b3df5]" : "border-white shadow-[0_0_0_1px_rgba(0,0,0,0.15)]"}`} style={{ background: c }} />
        ))}
        <label className="relative h-7 w-7 cursor-pointer overflow-hidden rounded-full border border-black/15" title="Свій колір" style={{ background: "conic-gradient(#ef4444,#f59e0b,#10b981,#0ea5e9,#8b5cf6,#ef4444)" }}>
          <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff"} onChange={(e) => onChange(e.target.value)} aria-label="Свій колір" className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
        </label>
      </div>
    </div>
  );
}

function Slider({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (n: number) => void }) {
  return (
    <label className="block text-[12px] text-black/70">
      <span className="flex justify-between"><span>{label}</span><span className="tabular-nums">{Math.round(value * 100) / 100}</span></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full" />
    </label>
  );
}

function StickerIcon({ d, size = 22 }: { d: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
  );
}

function Thumb({ doc, label, onPick }: { doc: CoverDoc; label: string; onPick: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { if (ref.current) renderDoc(ref.current, doc, new Map()); }, [doc]);
  return (
    <button type="button" onClick={onPick} className="flex flex-col gap-1 rounded-xl border border-[#e3e6f4] bg-white p-1.5 text-left transition hover:bg-[#faf9ff] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50">
      <canvas ref={ref} aria-hidden="true" className="block aspect-video w-full rounded-lg" />
      <span className="px-1 text-[12px] font-medium text-[#1d1a3b]">{label}</span>
    </button>
  );
}

function BgThumb({ doc, label, on, onPick }: { doc: CoverDoc; label: string; on: boolean; onPick: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { if (ref.current) renderDoc(ref.current, doc, new Map()); }, [doc]);
  return (
    <button type="button" title={label} aria-label={`Фон: ${label}`} aria-pressed={on} onClick={onPick} className={`overflow-hidden rounded-lg border-2 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50 ${on ? "border-[#5b3df5]" : "border-transparent hover:border-[#d9d4f5]"}`}>
      <canvas ref={ref} aria-hidden="true" className="block aspect-video w-full" />
    </button>
  );
}

export default function CoverMaker({ title: initialTitle, categoryId, categoryIds, onDone, onClose }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const peek = useRef<HTMLCanvasElement>(null);
  const textBox = useRef<HTMLTextAreaElement>(null);
  const images = useRef(new Map<string, PhotoSource>());
  const urls = useRef<string[]>([]);
  const drag = useRef<Drag | null>(null);
  const lastEdit = useRef({ key: "", t: 0 });
  const lastTap = useRef({ id: "", t: 0, x: 0, y: 0 });

  const [doc, setDoc] = useState<CoverDoc>(() => starterDoc("waves", paletteFor(categoryId), initialTitle));
  // The newest document, readable in async callbacks (photo loading) and between two changes in one event.
  const docRef = useRef(doc);
  const setDocNow = (v: CoverDoc | ((d: CoverDoc) => CoverDoc)) => {
    const next = typeof v === "function" ? v(docRef.current) : v;
    docRef.current = next;
    setDoc(next);
  };
  const [history, setHistory] = useState<History>(EMPTY_HISTORY);
  const [selectedId, setSelectedId] = useState<string | null>(() => null);
  const [scale, setScale] = useState(1);
  const [tick, setTick] = useState(0);
  const [frameIdx, setFrameIdx] = useState(0);
  // A frame stays confirmed only while what it shows is unchanged (so edits outside a crop do not reset it).
  const [sigs, setSigs] = useState<string[]>(() => FRAMES.map(() => ""));
  const [okSigs, setOkSigs] = useState<(string | null)[]>(() => FRAMES.map(() => null));
  const confirmed = FRAMES.map((_, i) => okSigs[i] !== null && okSigs[i] === sigs[i]);
  const [showFrames, setShowFrames] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [hintGone, setHintGone] = useState(false);
  const [frameHint, setFrameHint] = useState(false);
  const confirmedCount = confirmed.filter(Boolean).length;
  const allConfirmed = confirmedCount === FRAMES.length;
  const [guides, setGuides] = useState({ x: false, y: false });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [bgOpen, setBgOpen] = useState(false);
  // The text layer being typed into directly on the cover.
  const [editingId, setEditingId] = useState<string | null>(null);
  // The photo being cropped right on the cover: drag to move it inside its frame, wheel or +/- to zoom.
  const [croppingId, setCroppingId] = useState<string | null>(null);

  const allowedStickers = themedStickers(categoryIds && categoryIds.length ? categoryIds : categoryId ? [categoryId] : [], 8);
  const sel = doc.elements.find((e) => e.id === selectedId) ?? null;
  const palette = doc.background.kind === "gradient" ? doc.background.palette : paletteFor(categoryId);
  const [pal0, pal1] = palette;
  const readyDocs = useMemo(() => READY_BACKGROUNDS.map((b): CoverDoc => ({ background: { kind: "gradient", palette: b.palette }, deco: b.deco, elements: [] })), []);
  // `tick` re-draws the thumbnails once the fonts are ready.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const thumbDocs = useMemo(() => COVER_TEMPLATES.map((t) => starterDoc(t.id, [pal0, pal1] as const, "")), [pal0, pal1, tick]);

  // ---- history-aware changes ----
  const act = (fn: (d: CoverDoc) => CoverDoc) => {
    const before = docRef.current;
    setHistory((h) => commit(h, before));
    setDocNow(fn(before));
  };
  // Many small changes in a row (a slider, typing) become one undo step.
  const edit = (key: string, fn: (d: CoverDoc) => CoverDoc) => {
    const now = Date.now();
    const before = docRef.current;
    if (lastEdit.current.key !== key || now - lastEdit.current.t > 900) setHistory((h) => commit(h, before));
    lastEdit.current = { key, t: now };
    setDocNow(fn(before));
  };
  const patch = (key: string, p: Partial<CoverEl>) => sel && edit(`${sel.id}:${key}`, (d) => updateEl(d, sel.id, p));
  const doUndo = () => { const r = undoH(history, docRef.current); if (r) { setHistory(r.history); setDocNow(r.doc); } };
  const doRedo = () => { const r = redoH(history, docRef.current); if (r) { setHistory(r.history); setDocNow(r.doc); } };
  const remove = () => { if (sel) { act((d) => removeEl(d, sel.id)); setSelectedId(null); } };
  // True circle: crop the photo to a square around its visible centre.
  const makeCircle = () => {
    if (!sel || sel.type !== "image") return;
    const r = cropToRatio(sel, 1);
    edit(`${sel.id}:circle`, (d) => updateEl(d, sel.id, { mask: "circle", crop: r.crop, h: r.h, y: sel.y + r.top }));
  };
  // Swap the picture but keep the place, the frame width and the look.
  const replacePhoto = (file: File | undefined) => {
    if (!file || !sel || sel.type !== "image") return;
    const id = sel.id;
    loadPhoto(file, (p) => {
      const before = docRef.current;
      setHistory((h) => commit(h, before));
      setDocNow((d) => {
        const cur = d.elements.find((e) => e.id === id);
        if (!cur || cur.type !== "image") return d;
        const h = cur.w * (p.h / p.w);
        return updateEl(d, id, { src: p.url, nw: p.w, nh: p.h, crop: undefined, h, y: cur.y + (cur.h - h) / 2 });
      });
    });
  };
  const duplicate = () => { if (!sel) return; const r = duplicateEl(doc, sel.id); act(() => r.doc); setSelectedId(r.id); };

  const requestClose = () => {
    if (editingId) return setEditingId(null);
    if (croppingId) return setCroppingId(null);
    if (bgOpen) return setBgOpen(false);
    if (confirmClose) return setConfirmClose(false);
    if (history.past.length > 0) return setConfirmClose(true);
    onClose();
  };
  const onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    const inField = t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); return e.shiftKey ? doRedo() : doUndo(); }
    if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); return doRedo(); }
    if (inField || !sel) return;
    // Shortcuts must not hijack keys meant for a focused button, link or slider.
    if (t.closest?.("button, a, [role='button'], [role='tab']")) return;
    if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); return duplicate(); }
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); return remove(); }
    const step = e.shiftKey ? 10 : 1;
    const move: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (move[e.key]) { e.preventDefault(); const [dx, dy] = move[e.key]; edit(`${sel.id}:nudge`, (d) => updateEl(d, sel.id, { x: sel.x + dx, y: sel.y + dy })); }
  };
  useModal(root, requestClose, onKey);
  // Closing the tab or reloading would lose the unsaved cover: ask the browser to confirm.
  const unsaved = history.past.length > 0;
  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  // ---- drawing ----
  // While typing on the cover, the text field itself shows that layer, so the canvas leaves it out.
  const editingEl = doc.elements.find((e): e is TextEl => e.type === "text" && e.id === editingId) ?? null;
  useEffect(() => {
    if (canvas.current) renderDoc(canvas.current, editingId ? { ...doc, elements: doc.elements.filter((e) => e.id !== editingId) } : doc, images.current, croppingId);
  }, [doc, tick, editingId, croppingId]);
  // A fingerprint of each frame's picture (tiny, coarse): tells whether an edit changed what that frame shows.
  useEffect(() => {
    const src = canvas.current;
    if (!src || editingId || croppingId) return;
    const next = FRAMES.map((f) => {
      const r = cropRect(f.r);
      const c = document.createElement("canvas");
      c.height = 24;
      c.width = Math.max(1, Math.round((24 * r.w) / r.h));
      const g = c.getContext("2d");
      if (!g) return "";
      g.drawImage(src, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let h = 2166136261;
      for (let i = 0; i < d.length; i += 4) {
        h = Math.imul(h ^ ((d[i] >> 4) | ((d[i + 1] >> 4) << 4)), 16777619);
        h = Math.imul(h ^ (d[i + 2] >> 4), 16777619);
      }
      return String(h >>> 0);
    });
    setSigs((prev) => (prev.join() === next.join() ? prev : next));
  }, [doc, tick, editingId, croppingId]);
  // Live thumbnail of the chosen crop: what readers will see in that place.
  useEffect(() => {
    const c = peek.current, src = canvas.current;
    if (!c || !src) return;
    const r = cropRect(FRAMES[frameIdx].r);
    c.height = 112;
    c.width = Math.round((112 * r.w) / r.h);
    c.getContext("2d")?.drawImage(src, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
  }, [doc, tick, editingId, frameIdx]);
  useEffect(() => {
    if (!editingEl) return;
    const t = textBox.current;
    if (t && document.activeElement !== t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); }
  }, [editingEl]);
  useEffect(() => { if (selectedId) setHintGone(true); }, [selectedId]);
  useEffect(() => { if (editingId && selectedId !== editingId) setEditingId(null); }, [selectedId, editingId]);
  useEffect(() => { if (croppingId && selectedId !== croppingId) setCroppingId(null); }, [selectedId, croppingId]);
  useEffect(() => {
    document.fonts?.ready.then(() => setTick((n) => n + 1)).catch(() => {});
    const list = urls.current;
    return () => list.forEach((u) => URL.revokeObjectURL(u));
  }, []);
  useEffect(() => {
    const el = wrap.current;
    const box = area.current;
    if (!el || !box) return;
    // The whole group (cover + frame bar) must fit the screen height; the side cards then match its height.
    const fit = () => {
      const wide = window.matchMedia("(min-width: 1280px)").matches;
      const room = box.clientHeight - 24 - (FRAME_BLOCK_MIN) - 12;
      const byHeight = wide ? room / COVER_H : Infinity;
      setScale(Math.max(0.1, Math.min(el.clientWidth / COVER_W, byHeight)));
    };
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    ro.observe(box);
    fit();
    return () => ro.disconnect();
  }, []);

  // ---- photos ----
  // Reads a photo file: rejects what cannot be drawn (SVG, zero size), shrinks very large pictures once, so dragging
  // stays smooth, and hands over the picture with its (possibly reduced) size.
  const loadPhoto = (file: File, done: (p: { url: string; w: number; h: number }) => void) => {
    if (!file.type.startsWith("image/") || file.type === "image/svg+xml") return setError("Оберіть фото у форматі JPG або PNG.");
    if (file.size > MAX_PHOTO_BYTES) return setError("Фото завелике: до 10 МБ.");
    setError(null);
    const url = URL.createObjectURL(file);
    urls.current.push(url);
    const img = new Image();
    img.onload = () => {
      if (!img.naturalWidth || !img.naturalHeight) return setError("Не вдалося відкрити це фото. Оберіть JPG або PNG.");
      const fit = fitWithin(img.naturalWidth, img.naturalHeight, MAX_PHOTO_SIDE);
      let source: PhotoSource = img;
      if (fit.scaled) {
        const small = document.createElement("canvas");
        small.width = fit.w;
        small.height = fit.h;
        const g = small.getContext("2d");
        if (g) {
          g.imageSmoothingQuality = "high";
          g.drawImage(img, 0, 0, fit.w, fit.h);
          source = small;
        }
      }
      images.current.set(url, source);
      done({ url, w: source === img ? img.naturalWidth : fit.w, h: source === img ? img.naturalHeight : fit.h });
      setTick((n) => n + 1);
    };
    img.onerror = () => setError("Не вдалося відкрити це фото. Оберіть JPG або PNG.");
    img.src = url;
  };
  const addPhoto = (file: File | undefined, asBackground: boolean) => {
    if (!file) return;
    loadPhoto(file, (p) => {
      const el = newImage(p.url, p.w, p.h, asBackground);
      const before = docRef.current;
      setHistory((h) => commit(h, before));
      setDocNow((d) => (asBackground ? { ...d, elements: [el, ...d.elements] } : addEl(d, el)));
      setSelectedId(el.id);
    });
  };

  // ---- pointer: select, move, resize, rotate ----
  const toScene = useCallback((e: { clientX: number; clientY: number }) => {
    const r = scene.current?.getBoundingClientRect();
    return { x: ((e.clientX - (r?.left ?? 0)) / (r?.width ?? 1)) * COVER_W, y: ((e.clientY - (r?.top ?? 0)) / (r?.height ?? 1)) * COVER_H };
  }, []);

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).tagName === "TEXTAREA") return;
    setEditingId(null);
    const pt = toScene(e);
    const handle = (e.target as HTMLElement).dataset?.handle;
    let target = sel;
    let mode: Drag["mode"] = "move";
    if (handle && sel) mode = handle === "rot" ? "rotate" : handle.startsWith("c-") ? "crop" : "resize";
    else if (croppingId && sel?.type === "image" && topHit(doc, sizeOfEl, pt)?.id === sel.id) mode = "pan";
    else {
      target = topHit(doc, sizeOfEl, pt);
      setSelectedId(target?.id ?? null);
      if (target?.id !== croppingId) setCroppingId(null);
    }
    if (!target) return;
    drag.current = { mode, handle: handle ?? "", id: target.id, pt, el: target, size: sizeOfEl(target), before: doc, moved: false };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const pt = toScene(e);
    const el = d.el;
    d.moved = true;
    if ((d.mode === "pan" || d.mode === "crop") && el.type === "image") {
      const a = (-el.rotation * Math.PI) / 180;
      const ddx = pt.x - d.pt.x, ddy = pt.y - d.pt.y;
      const lx = ddx * Math.cos(a) - ddy * Math.sin(a), ly = ddx * Math.sin(a) + ddy * Math.cos(a);
      if (d.mode === "pan") {
        setDocNow((cur) => updateEl(cur, d.id, { crop: cropPan(el, lx, ly) }));
      } else {
        // Drag an edge or corner of the crop frame; the photo stays put.
        const edges = d.handle.slice(2);
        let cur = el;
        let left = 0, top = 0;
        for (const ch of edges) {
          const edge = ch as "n" | "s" | "e" | "w";
          const r = cropEdge(cur, edge, edge === "e" || edge === "w" ? lx : ly);
          cur = { ...cur, crop: r.crop, w: r.w, h: r.h };
          left += r.left;
          top += r.top;
        }
        const c0 = centerOf(el, d.size);
        const shift = rotatePoint({ x: left + cur.w / 2 - el.w / 2, y: top + cur.h / 2 - el.h / 2 }, el.rotation);
        const ncx = c0.x + shift.x, ncy = c0.y + shift.y;
        setDocNow((c) => updateEl(c, d.id, { crop: cur.crop, w: cur.w, h: cur.h, x: ncx - cur.w / 2, y: ncy - cur.h / 2 }));
      }
    } else if (d.mode === "move") {
      const s = snapToCenter(el.x + pt.x - d.pt.x, el.y + pt.y - d.pt.y, d.size);
      setGuides({ x: s.guideX, y: s.guideY });
      setDocNow((cur) => updateEl(cur, d.id, { x: s.x, y: s.y }));
    } else if (d.mode === "rotate") {
      const c = centerOf(el, d.size);
      let deg = (Math.atan2(pt.y - c.y, pt.x - c.x) * 180) / Math.PI + 90;
      if (e.shiftKey) deg = Math.round(deg / 15) * 15;
      const near = Math.round(deg / 45) * 45;
      if (Math.abs(deg - near) < 3) deg = near;
      setDocNow((cur) => updateEl(cur, d.id, { rotation: Math.round(deg * 10) / 10 }));
    } else {
      const { w, h } = d.size;
      const c = centerOf(el, d.size);
      const local = toLocal(el, d.size, pt);
      const side = d.handle === "e" || d.handle === "w";
      if (side) {
        const sx = d.handle === "e" ? 1 : -1;
        const nw = Math.max(80, (local.x + (sx * w) / 2) * sx);
        const shift = rotatePoint({ x: (sx * (nw - w)) / 2, y: 0 }, el.rotation);
        const ncx = c.x + shift.x, ncy = c.y + shift.y;
        setDocNow((cur) => updateEl(cur, d.id, { w: nw, x: ncx - nw / 2, y: ncy - h / 2 }));
      } else {
        const sx = d.handle.includes("e") ? 1 : -1;
        const sy = d.handle.includes("s") ? 1 : -1;
        const dx = (local.x + (sx * w) / 2) * sx;
        const dy = (local.y + (sy * h) / 2) * sy;
        const lock = el.type !== "shape" || e.shiftKey;
        const k = Math.max(24 / Math.min(w, h), lock ? Math.max(dx / w, dy / h) : 0);
        const nw = lock ? w * k : Math.max(24, dx);
        const nh = lock ? h * k : Math.max(24, dy);
        const anchor = rotatePoint({ x: (-sx * w) / 2, y: (-sy * h) / 2 }, el.rotation);
        const off = rotatePoint({ x: (sx * nw) / 2, y: (sy * nh) / 2 }, el.rotation);
        const ncx = c.x + anchor.x + off.x, ncy = c.y + anchor.y + off.y;
        const next: Partial<CoverEl> = { w: nw, x: ncx - nw / 2, y: ncy - nh / 2 };
        if (el.type === "text") Object.assign(next, { fontSize: Math.min(300, Math.max(12, el.fontSize * k)) });
        else Object.assign(next, { h: nh });
        setDocNow((cur) => updateEl(cur, d.id, next));
      }
    }
  };

  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    setGuides({ x: false, y: false });
    if (d?.moved) setHistory((h) => commit(h, d.before));
    // Double tap (touch, pen) or double click on a text layer starts typing; works where dblclick never fires.
    if (d && !d.moved && d.mode === "move" && (d.el.type === "text" || d.el.type === "image")) {
      const now = Date.now();
      const last = lastTap.current;
      if (last.id === d.id && now - last.t < 450 && Math.hypot(d.pt.x - last.x, d.pt.y - last.y) < 30) {
        lastTap.current = { id: "", t: 0, x: 0, y: 0 };
        setSelectedId(d.id);
        if (d.el.type === "text") setEditingId(d.id);
        else setCroppingId(d.id);
      } else lastTap.current = { id: d.id, t: now, x: d.pt.x, y: d.pt.y };
    }
  };

  const confirmFrame = () => {
    const next = confirmed.map((c, i) => (i === frameIdx ? true : c));
    setOkSigs((prev) => prev.map((v, i) => (i === frameIdx ? sigs[i] : v)));
    setFrameHint(false);
    const after = [...next.keys()].map((k) => (frameIdx + 1 + k) % FRAMES.length).find((i) => !next[i]);
    if (after !== undefined) setFrameIdx(after);
  };

  const finish = () => {
    if (!allConfirmed) {
      setFrameIdx(Math.max(0, confirmed.indexOf(false)));
      setFrameHint(true);
      return;
    }
    setBusy(true);
    const out = document.createElement("canvas");
    renderDoc(out, doc, images.current);
    out.toBlob((blob) => {
      setBusy(false);
      if (!blob) return setError("Не вдалося створити зображення. Спробуйте ще раз.");
      onDone(new File([blob], "cover.jpg", { type: "image/jpeg" }));
    }, "image/jpeg", 0.92);
  };

  const firstText = doc.elements.find((e): e is TextEl => e.type === "text")?.text ?? initialTitle;
  const px = 1 / (scale || 1);
  const selSize = sel ? sizeOfEl(sel) : null;
  const coarse = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
  const hs = coarse ? 26 : 14; // handle size in screen px: bigger for fingers
  const handle = (id: string, x: number, y: number, cursor: string) => (
    <span key={id} data-handle={id} style={{ left: x - (hs / 2) * px, top: y - (hs / 2) * px, width: hs * px, height: hs * px, borderWidth: 2 * px, cursor }} className="absolute rounded-full border-[#5b3df5] bg-white" />
  );

  const iconBtn = "grid h-10 w-10 place-items-center rounded-full border border-[#e3e6f4] bg-white text-[#4a2fd0] transition hover:bg-[#f3efff] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50";
  const card = "rounded-2xl border border-[#e6e8f6] bg-white p-4 shadow-[0_10px_30px_-24px_rgba(60,50,140,0.5)]";

  return createPortal(
    <div className="fixed inset-0 z-[100] flex bg-[#f6f4ff]" onClick={requestClose}>
      <div ref={root} role="dialog" aria-modal="true" aria-labelledby="cover-maker-title" onClick={(e) => e.stopPropagation()} className="relative flex h-full w-full flex-col overflow-hidden text-[#1d1a3b]">
        <div className="flex flex-wrap items-center gap-3 border-b border-[#e6e8f6] bg-white px-4 py-2.5 sm:px-6">
          <h2 id="cover-maker-title" className="mr-2 text-[19px] font-bold">Створити обкладинку</h2>
          <button type="button" className={tool} onClick={doUndo} disabled={!history.past.length} aria-label="Скасувати (Ctrl+Z)">↶ Скасувати</button>
          <button type="button" className={tool} onClick={doRedo} disabled={!history.future.length} aria-label="Повернути (Ctrl+Shift+Z)">↷ Повернути</button>
          <a href="/guides/cover-editor-guide.pdf" target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex min-h-[38px] items-center gap-2 rounded-xl bg-gradient-to-r from-[#5b3df5] to-[#8a63f7] px-4 text-[13px] font-semibold text-white shadow-[0_8px_20px_-10px_rgba(91,61,245,0.8)] transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></svg>
            Інструкція (PDF)
          </a>
          <button type="button" onClick={requestClose} aria-label="Закрити" className={iconBtn}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <div ref={area} className="flex min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
        <div className="m-auto grid w-full gap-3 xl:grid-cols-[260px_minmax(0,1fr)_300px] xl:items-stretch">
          {/* LEFT: add, starts, background */}
          <div className={`order-2 flex flex-col justify-between gap-4 xl:order-1 ${card}`}>
            <Section title="Додати">
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className={tool} onClick={() => { const el = newText("title"); act((d) => addEl(d, el)); setSelectedId(el.id); setEditingId(el.id); }}>Заголовок</button>
                <button type="button" className={tool} onClick={() => { const el = newText("subtitle"); act((d) => addEl(d, el)); setSelectedId(el.id); setEditingId(el.id); }}>Підзаголовок</button>
                <button type="button" className={tool} onClick={() => { const el = newText("body"); act((d) => addEl(d, el)); setSelectedId(el.id); setEditingId(el.id); }}>Текст</button>
                <label className={`${tool} cursor-pointer`}>Фото
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => { addPhoto(e.target.files?.[0], false); e.target.value = ""; }} />
                </label>
                <label className={`${tool} col-span-2 cursor-pointer`}>Фото на весь фон
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => { addPhoto(e.target.files?.[0], true); e.target.value = ""; }} />
                </label>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(["rect", "round", "circle"] as const).map((s, i) => (
                  <button key={s} type="button" aria-label={["Прямокутник", "Заокруглений прямокутник", "Коло"][i]} title={["Прямокутник", "Заокруглений", "Коло"][i]} className={tool} onClick={() => { const el = newShape(s); act((d) => addEl(d, el)); setSelectedId(el.id); }}>
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">{s === "rect" ? <rect x="4" y="6" width="16" height="12" /> : s === "round" ? <rect x="4" y="6" width="16" height="12" rx="4" /> : <circle cx="12" cy="12" r="8" />}</svg>
                  </button>
                ))}
              </div>
            </Section>

            <Section title="Елементи за темою">
              <div className="grid grid-cols-4 gap-1.5">
                {allowedStickers.map((st) => (
                  <button key={st.id} type="button" title={st.label} aria-label={`Додати елемент: ${st.label}`} onClick={() => { const el = newSticker(st.id, { color: doc.background.kind === "solid" ? "#1d1a3b" : "#ffffff" }); act((d) => addEl(d, el)); setSelectedId(el.id); }} className="flex h-10 items-center justify-center rounded-lg border border-[#e3e6f4] bg-white text-[#5b3df5] transition hover:bg-[#f3efff] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50">
                    <StickerIcon d={st.d} />
                  </button>
                ))}
              </div>
            </Section>

            <Section title="Готові основи">
              <div className="grid grid-cols-2 gap-2">
                {COVER_TEMPLATES.map((t, i) => (
                  <Thumb key={t.id} label={t.label} doc={thumbDocs[i]} onPick={() => { act(() => starterDoc(t.id, palette, firstText)); setSelectedId(null); }} />
                ))}
              </div>
              <p className="text-[12px] leading-snug text-black/70">Замінює макет; можна скасувати.</p>
            </Section>
          </div>

          {/* CENTRE: toolbar + stage */}
          <div className="order-1 flex min-w-0 flex-col gap-3 xl:order-2">
            <div ref={wrap} className="flex w-full justify-center">
              <div className="relative rounded-2xl shadow-[0_18px_40px_-22px_rgba(60,50,140,0.6)]" style={{ width: COVER_W * scale, height: COVER_H * scale }}>
                <div
                  ref={scene}
                  onPointerDown={onDown}
                  onPointerMove={onMove}
                  onPointerUp={onUp}
                  onPointerCancel={onUp}
                  onDoubleClick={() => { if (sel?.type === "text") setEditingId(sel.id); else if (sel?.type === "image") setCroppingId(sel.id); }}
                  onWheel={(e) => { if (croppingId && sel?.type === "image") patch("crop", { crop: cropZoom(sel, Math.exp(-e.deltaY / 500)) }); }}
                  className="absolute left-0 top-0 touch-none select-none"
                  style={{ width: COVER_W, height: COVER_H, transform: `scale(${scale})`, transformOrigin: "top left" }}
                >
                  <canvas ref={canvas} role="img" aria-label="Попередній перегляд обкладинки" width={COVER_W} height={COVER_H} className="absolute left-0 top-0 block" style={{ width: COVER_W, height: COVER_H, borderRadius: 16 * px }} />
                  <div aria-hidden="true" className="pointer-events-none absolute left-0 top-0 overflow-hidden" style={{ width: COVER_W, height: COVER_H, borderRadius: 16 * px }}>
                    {(() => {
                      const f = FRAMES[frameIdx];
                      const r = cropRect(f.r);
                      return (
                        <div className="absolute border-dashed border-white" style={{ left: r.x, top: r.y, width: r.w, height: r.h, borderWidth: 2 * px, boxShadow: showFrames ? "0 0 0 4000px rgba(20,16,50,0.3)" : "none", opacity: showFrames ? 1 : 0.55 }}>
                          <span className="absolute left-1 top-1 rounded bg-black/55 px-1.5 text-white" style={{ fontSize: 12 * px }}>{f.label}</span>
                        </div>
                      );
                    })()}
                  </div>
                  {guides.x && <div aria-hidden="true" className="pointer-events-none absolute top-0 bg-[#ff4fa3]" style={{ left: COVER_W / 2 - px, width: 2 * px, height: COVER_H }} />}
                  {guides.y && <div aria-hidden="true" className="pointer-events-none absolute left-0 bg-[#ff4fa3]" style={{ top: COVER_H / 2 - px, height: 2 * px, width: COVER_W }} />}
                  {sel && selSize && (
                    <div className="pointer-events-none absolute" style={{ left: sel.x, top: sel.y, width: selSize.w, height: selSize.h, transform: `rotate(${sel.rotation}deg)`, transformOrigin: "center", outline: `${2 * px}px solid #5b3df5` }}>
                      {editingEl && (
                        <textarea
                          ref={textBox}
                          value={editingEl.text}
                          aria-label="Текст на обкладинці"
                          onChange={(e) => edit(`${editingEl.id}:text`, (d) => updateEl(d, editingEl.id, { text: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); setEditingId(null); } }}
                          className="pointer-events-auto absolute left-0 top-0 m-0 resize-none overflow-hidden border-0 bg-transparent p-0 outline-none"
                          style={{
                            width: selSize.w, height: selSize.h, opacity: editingEl.opacity, fontSize: editingEl.fontSize, lineHeight: 1.15, color: editingEl.color, caretColor: editingEl.color, textAlign: editingEl.align,
                            fontFamily: FONTS.find((f) => f.id === editingEl.family)?.stack, fontWeight: editingEl.bold ? 700 : 400, fontStyle: editingEl.italic ? "italic" : "normal",
                            textShadow: editingEl.shadow ? "0 2px 8px rgba(0,0,0,0.35)" : undefined,
                          }}
                        />
                      )}
                      {!editingEl && !croppingId && <span className="absolute bg-[#5b3df5]" style={{ left: selSize.w / 2 - px, top: -34 * px, width: 2 * px, height: 34 * px }} />}
                      {!editingEl && croppingId === sel.id && sel.type === "image" && (
                        <div className="pointer-events-auto contents">
                          {handle("c-nw", 0, 0, "nwse-resize")}
                          {handle("c-ne", selSize.w, 0, "nesw-resize")}
                          {handle("c-sw", 0, selSize.h, "nesw-resize")}
                          {handle("c-se", selSize.w, selSize.h, "nwse-resize")}
                          {handle("c-n", selSize.w / 2, 0, "ns-resize")}
                          {handle("c-s", selSize.w / 2, selSize.h, "ns-resize")}
                          {handle("c-w", 0, selSize.h / 2, "ew-resize")}
                          {handle("c-e", selSize.w, selSize.h / 2, "ew-resize")}
                        </div>
                      )}
                      {!editingEl && !croppingId && (
                        <div className="pointer-events-auto contents">
                          {handle("rot", selSize.w / 2, -40 * px, "grab")}
                          {handle("nw", 0, 0, "nwse-resize")}
                          {handle("ne", selSize.w, 0, "nesw-resize")}
                          {handle("sw", 0, selSize.h, "nesw-resize")}
                          {handle("se", selSize.w, selSize.h, "nwse-resize")}
                          {sel.type === "text" && handle("w", 0, selSize.h / 2, "ew-resize")}
                          {sel.type === "text" && handle("e", selSize.w, selSize.h / 2, "ew-resize")}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className={`absolute bottom-2 left-2 z-10 flex max-h-[calc(100%-16px)] flex-col items-start gap-2 transition-opacity ${dragging ? "pointer-events-none opacity-0" : ""}`}>
                  {bgOpen && (
                    <section aria-label="Фон обкладинки" className="flex max-h-full w-[min(340px,calc(100vw-48px))] flex-col gap-2 overflow-y-auto rounded-2xl bg-white p-3 shadow-[0_8px_24px_-8px_rgba(40,30,110,0.5)]">
              <div role="group" aria-label="Готові фони" className="grid grid-cols-4 gap-1.5">
                {READY_BACKGROUNDS.map((b, i) => (
                  <BgThumb key={b.id} doc={readyDocs[i]} label={b.label} on={doc.deco === b.deco && doc.background.kind === "gradient" && doc.background.palette[0] === b.palette[0] && doc.background.palette[1] === b.palette[1]} onPick={() => act((d) => ({ ...d, background: { kind: "gradient", palette: b.palette }, deco: b.deco }))} />
                ))}
              </div>
              <div role="group" aria-label="Градієнт за категорією" className="flex flex-wrap gap-1.5">
                {Object.entries(CATEGORY_PALETTES).map(([id, [a, b]]) => {
                  const on = doc.background.kind === "gradient" && doc.background.palette[0] === a;
                  return (
                    <button key={id} type="button" aria-pressed={on} aria-label={categoryLabels[id as keyof typeof categoryLabels]} title={categoryLabels[id as keyof typeof categoryLabels]} onClick={() => act((d) => ({ ...d, background: { kind: "gradient", palette: [a, b] } }))} className={`h-8 w-8 rounded-full border-2 ${on ? "border-[#5b3df5] ring-2 ring-[#5b3df5]/25" : "border-white shadow-[0_0_0_1px_rgba(0,0,0,0.12)]"}`} style={{ background: `linear-gradient(135deg, ${a}, ${b})` }} />
                  );
                })}
              </div>
              <ColorRow label="Однотонний фон" value={doc.background.kind === "solid" ? doc.background.color : ""} onChange={(c) => edit("bg", (d) => ({ ...d, background: { kind: "solid", color: c } }))} />
                    </section>
                  )}
                  <button type="button" aria-pressed={bgOpen} aria-expanded={bgOpen} onClick={() => setBgOpen((v) => !v)} className="inline-flex min-h-[36px] items-center gap-2 rounded-full bg-white px-3 text-[13px] font-medium text-[#1d1a3b] shadow-[0_6px_18px_-6px_rgba(40,30,110,0.5)] hover:bg-[#f3efff] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50">
                    <span aria-hidden="true" className="h-4 w-4 rounded-full border border-black/10" style={{ background: doc.background.kind === "solid" ? doc.background.color : `linear-gradient(135deg, ${doc.background.palette[0]}, ${doc.background.palette[1]})` }} />
                    Фон
                  </button>
                </div>
                {sel?.type === "image" && selSize && (() => {
                  const above = sel.y * scale - 56;
                  const top = above >= 4 ? above : Math.min((sel.y + selSize.h) * scale + 12, COVER_H * scale - 52);
                  const crop = croppingId === sel.id;
                  const left = Math.min(Math.max((sel.x + selSize.w / 2) * scale, crop ? 250 : 80), Math.max(crop ? 250 : 80, COVER_W * scale - (crop ? 250 : 80)));
                  const btn = "grid h-8 min-w-[32px] [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:min-w-[44px] place-items-center rounded-md px-2.5 text-[13px] font-medium text-[#1d1a3b] hover:bg-[#f3efff] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50";
                  return (
                    <div role="toolbar" aria-label="Фото на обкладинці" onMouseDown={(e) => e.preventDefault()} className="absolute z-10 flex -translate-x-1/2 flex-wrap items-center justify-center gap-0.5 rounded-xl bg-white p-1 shadow-[0_8px_24px_-8px_rgba(40,30,110,0.5)]" style={{ left, top, maxWidth: "calc(100% - 16px)" }}>
                      {!crop ? (
                        <button type="button" className={btn} onClick={() => setCroppingId(sel.id)}>✂ Обрізати</button>
                      ) : (
                        <>
                          <button type="button" className={btn} aria-label="Віддалити фото" onClick={() => patch("crop", { crop: cropZoom(sel, 0.85) })}>−</button>
                          <span className="px-1 text-[12px] text-black/70">Масштаб</span>
                          <button type="button" className={btn} aria-label="Наблизити фото" onClick={() => patch("crop", { crop: cropZoom(sel, 1.18) })}>+</button>
                          <button type="button" className={btn} disabled={!sel.crop} onClick={() => patch("crop", { crop: undefined, h: sel.w * (sel.nh / sel.nw), y: sel.y + (sel.h - sel.w * (sel.nh / sel.nw)) / 2 })}>Скинути</button>
                          <span className="mx-0.5 h-5 w-px bg-black/10" />
                          <button type="button" className={`${btn} bg-[#5b3df5] text-white hover:bg-[#4a2fd0]`} onClick={() => setCroppingId(null)}>Готово</button>
                        </>
                      )}
                    </div>
                  );
                })()}
                {croppingId && sel?.type === "image" && <p className="pointer-events-none absolute bottom-2 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-[12px] text-white">Тягніть краї рамки, щоб обрізати; тягніть фото, щоб посунути; колесо миші змінює масштаб</p>}
                <button type="button" aria-pressed={showFrames} onClick={() => setShowFrames((v) => !v)} className={`absolute bottom-2 right-2 z-10 inline-flex min-h-[36px] items-center rounded-full px-3 text-[13px] font-medium shadow-[0_6px_18px_-6px_rgba(40,30,110,0.5)] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50 [@media(pointer:coarse)]:min-h-[44px] ${dragging ? "pointer-events-none opacity-0" : ""} ${showFrames ? "bg-[#5b3df5] text-white" : "bg-white text-[#1d1a3b] hover:bg-[#f3efff]"}`}>Межі кадру</button>
                {!hintGone && !sel && <p className="pointer-events-none absolute left-1/2 top-2 z-10 max-w-[calc(100%-16px)] -translate-x-1/2 rounded-full bg-[#1d1a3b]/85 px-3 py-1 text-center text-[12px] text-white">Клікніть елемент, щоб змінити. Двічі клацніть текст, щоб писати</p>}
                {sel?.type === "text" && selSize && (() => {
                  const above = sel.y * scale - 52;
                  const top = above >= 4 ? above : Math.min((sel.y + selSize.h) * scale + 12, COVER_H * scale - 48);
                  const left = Math.min(Math.max((sel.x + selSize.w / 2) * scale, 130), Math.max(130, COVER_W * scale - 130));
                  const btn = "grid h-8 min-w-[32px] [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:min-w-[44px] place-items-center rounded-md px-2 text-[14px] font-medium text-[#1d1a3b] hover:bg-[#f3efff] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50";
                  const setSize = (n: number) => patch("size", { fontSize: Math.min(300, Math.max(12, Math.round(n))) });
                  return (
                    <div role="toolbar" aria-label="Текст на обкладинці" onMouseDown={(e) => { if ((e.target as HTMLElement).tagName !== "INPUT") e.preventDefault(); }} className="absolute z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-xl bg-white p-1 shadow-[0_8px_24px_-8px_rgba(40,30,110,0.5)]" style={{ left, top }}>
                      <button type="button" className={btn} onClick={() => setSize(sel.fontSize - 4)} aria-label="Менший шрифт">A−</button>
                      <input type="number" min={12} max={300} value={Math.round(sel.fontSize)} onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n) && n > 0) setSize(n); }} aria-label="Розмір шрифту" className="h-8 w-14 rounded-md border border-[#e3e6f4] bg-white text-center text-[13px] text-[#1d1a3b] focus:border-[#5b3df5] focus:outline-none" />
                      <button type="button" className={btn} onClick={() => setSize(sel.fontSize + 4)} aria-label="Більший шрифт">A+</button>
                      <span className="mx-0.5 h-5 w-px bg-black/10" />
                      <button type="button" aria-pressed={sel.bold} className={`${btn} ${sel.bold ? "bg-[#f3efff] text-[#4a2fd0]" : ""}`} onClick={() => patch("bold", { bold: !sel.bold })} aria-label="Жирний"><b>Ж</b></button>
                      <button type="button" aria-pressed={sel.italic} className={`${btn} ${sel.italic ? "bg-[#f3efff] text-[#4a2fd0]" : ""}`} onClick={() => patch("italic", { italic: !sel.italic })} aria-label="Курсив"><i>К</i></button>
                    </div>
                  );
                })()}
              </div>
            </div>
            <section aria-label="Перевірка кадрів" className={`flex min-h-[150px] flex-col justify-between gap-2.5 overflow-hidden rounded-2xl border p-4 xl:min-h-[150px] xl:flex-[1_1_0] ${frameHint && !allConfirmed ? "border-rose-300 bg-rose-50" : "border-[#e6e8f6] bg-white"}`}>
              <div className="flex items-center gap-2">
                <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Кадри показу">
                  {FRAMES.map((f, i) => (
                    <button key={f.label} type="button" onClick={() => setFrameIdx(i)} aria-current={i === frameIdx ? "step" : undefined} className={`flex min-w-0 items-center gap-2 rounded-xl border px-2.5 py-1.5 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50 ${i === frameIdx ? "border-[#5b3df5] bg-[#f3efff]" : "border-[#e3e6f4] bg-white hover:bg-[#faf9ff]"}`}>
                      <span aria-hidden="true" className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-bold ${confirmed[i] ? "bg-emerald-500 text-white" : i === frameIdx ? "bg-[#5b3df5] text-white" : "bg-[#ece8fd] text-[#4a2fd0]"}`}>{confirmed[i] ? "✓" : i + 1}</span>
                      <span className="min-w-0 leading-tight">
                        <span className="block truncate text-[13px] font-semibold">{f.label}</span>
                        <span className="sr-only">{confirmed[i] ? "підтверджено" : "не підтверджено"}</span>
                        <span aria-hidden="true" className="hidden truncate text-[11px] text-black/70 xl:block">{f.where}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex min-h-0 items-center gap-4 rounded-xl bg-[#f6f4ff] px-3 py-2.5">
                <canvas ref={peek} role="img" aria-label={`Так обкладинка виглядатиме: ${FRAMES[frameIdx].where}`} className="h-14 max-w-[34%] shrink-0 rounded-lg border border-[#e3e6f4] bg-white shadow-sm" />
                <div role={frameHint && !allConfirmed ? "alert" : undefined} aria-live="polite" className="min-w-0 flex-1 leading-snug">
                  <p className="truncate text-[14px] font-semibold text-[#1d1a3b]">{FRAMES[frameIdx].where} · {FRAMES[frameIdx].label}</p>
                  <p className={`text-[12px] ${frameHint && !allConfirmed ? "font-medium text-rose-700" : "text-black/70"}`}>
                    {allConfirmed ? "Усі кадри перевірено, можна зберігати." : frameHint ? `Підтвердьте решту кадрів: ${confirmedCount} з ${FRAMES.length}.` : `Усе потрібне видно у світлій частині? Перевірено ${confirmedCount} з ${FRAMES.length}.`}
                  </p>
                </div>
                <button type="button" onClick={confirmFrame} disabled={confirmed[frameIdx]} className="min-h-[44px] shrink-0 rounded-xl bg-[#5b3df5] px-5 text-[14px] font-semibold text-white transition hover:bg-[#4a2fd0] disabled:bg-emerald-100 disabled:text-emerald-800">{confirmed[frameIdx] ? "Підтверджено ✓" : confirmedCount === FRAMES.length - 1 ? "Готово" : "Усе добре, далі"}</button>
              </div>
            </section>
            {error && <p role="alert" className="text-[13px] text-rose-700">{error}</p>}
          </div>

          {/* RIGHT: properties of the selected layer */}
          <div className={`relative order-3 flex flex-col gap-4 xl:order-3 xl:gap-0 xl:p-0 ${card}`}>
            <div className="flex flex-col gap-4 xl:absolute xl:inset-0 xl:overflow-y-auto xl:p-4">
            <Section spread title={sel ? (sel.type === "text" ? "Текст" : sel.type === "image" ? "Фото" : sel.type === "sticker" ? "Елемент" : "Фігура") : "Властивості"}>
              {!sel && (
                <div className="flex flex-col gap-2 rounded-xl bg-[#f6f5ff] px-3 py-3 text-[13px] leading-snug text-black/70">
                  <p className="font-semibold text-[#1d1a3b]">Оберіть елемент на обкладинці</p>
                  <p>Двічі клацніть текст, щоб писати, а фото, щоб обрізати.</p>
                  <p>Кути рамки змінюють розмір, верхня точка обертає.</p>
                  <p>Стрілки зсувають, Delete видаляє, Ctrl+Z скасовує.</p>
                  <p>Порожнє місце знімає виділення.</p>
                </div>
              )}

              {sel?.type === "text" && (
                <div className="contents">
                  <p className="rounded-xl bg-[#f1eefe] px-3 py-2 text-[12px] leading-snug text-[#4a2fd0]">Двічі клацніть текст на обкладинці, щоб писати. Розмір: кути рамки або A− A+.</p>
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="Шрифт">
                    {FONTS.map((f) => (
                      <button key={f.id} type="button" aria-pressed={sel.family === f.id} onClick={() => patch("family", { family: f.id })} className={chip(sel.family === f.id)} style={{ fontFamily: f.stack }}>{f.label}</button>
                    ))}
                  </div>
                  <ColorRow label="Колір тексту" value={sel.color} onChange={(c) => patch("color", { color: c })} />
                  <div className="flex flex-wrap gap-1.5">
                    {(["left", "center", "right"] as const).map((a, i) => (
                      <button key={a} type="button" aria-pressed={sel.align === a} onClick={() => patch("align", { align: a })} className={chip(sel.align === a)}>{["Ліворуч", "Центр", "Праворуч"][i]}</button>
                    ))}
                  </div>
                  <label className="flex items-center gap-2 text-[13px] text-black/70"><input type="checkbox" checked={sel.shadow} onChange={(e) => patch("shadow", { shadow: e.target.checked })} /> Тінь під текстом</label>
                </div>
              )}

              {sel?.type === "image" && !sel.bg && (
                <div className="contents">
                  <label className={`${tool} w-full cursor-pointer`}>Замінити фото
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => { replacePhoto(e.target.files?.[0]); e.target.value = ""; }} />
                  </label>

                  <div>
                    <div className="mb-1.5 text-[12px] font-semibold text-black/70">Форма</div>
                    <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Форма фото">
                      {([
                        ["rect", "Квадрат", <rect key="a" x="4" y="5" width="16" height="14" />],
                        ["round", "М'яка", <rect key="b" x="4" y="5" width="16" height="14" rx="5" />],
                        ["circle", "Коло", <circle key="c" cx="12" cy="12" r="8" />],
                      ] as const).map(([k, l, icon]) => {
                        const on = (sel.mask ?? "rect") === k;
                        return (
                          <button key={k} type="button" aria-pressed={on} onClick={() => (k === "circle" ? makeCircle() : patch("mask", { mask: k }))} className={`flex flex-col items-center gap-1 rounded-xl border px-1 py-2 text-[12px] font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50 ${on ? "border-[#5b3df5] bg-[#f3efff] text-[#4a2fd0]" : "border-[#e3e6f4] bg-white text-black/70 hover:bg-[#faf9ff]"}`}>
                            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">{icon}</svg>
                            {l}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <div className="mb-1.5 text-[12px] font-semibold text-black/70">Колір</div>
                    <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Колір фото">
                      {([["none", "Кольорове"], ["bw", "Чорно-біле"]] as const).map(([k, l]) => (
                        <button key={k} type="button" aria-pressed={(sel.look === "bw" ? "bw" : "none") === k} onClick={() => patch("look", { look: k })} className={chip((sel.look === "bw" ? "bw" : "none") === k)}>{l}</button>
                      ))}
                    </div>
                  </div>

                  <Slider label="Затемнення (щоб текст читався)" value={sel.dim ?? 0} min={0} max={0.7} step={0.05} onChange={(n) => patch("dim", { dim: n })} />

                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" aria-pressed={!!sel.flip} onClick={() => patch("flip", { flip: !sel.flip })} className={chip(!!sel.flip)}>⇋ Дзеркально</button>
                    <button type="button" onClick={() => patch("rotation", { rotation: Math.round((sel.rotation + 90) % 360) })} className={chip(false)}>↻ Повернути</button>
                  </div>
                  <button type="button" disabled={!sel.crop && !sel.mask && !sel.look && !sel.dim && !sel.flip} onClick={() => patch("reset", { crop: undefined, mask: undefined, look: undefined, dim: undefined, flip: undefined, h: sel.w * (sel.nh / sel.nw), y: sel.y + (sel.h - sel.w * (sel.nh / sel.nw)) / 2 })} className="self-start rounded-lg px-1 py-1 text-[12px] font-medium text-[#4a2fd0] underline-offset-2 hover:underline disabled:text-black/30 disabled:no-underline">Скинути зміни фото</button>
                </div>
              )}

              {sel?.type === "image" && sel.bg && (() => {
                const cr = cropOf(sel);
                const zoomNow = 1 / Math.max(0.05, Math.max(1 - cr.l - cr.r, 1 - cr.t - cr.b));
                return (
                  <div className="contents">
                    <label className={`${tool} w-full cursor-pointer`}>Замінити фото
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => { replacePhoto(e.target.files?.[0]); e.target.value = ""; }} />
                    </label>
                    <div className="flex flex-col gap-2">
                      <Slider label="Масштаб" value={zoomNow} min={1} max={3} step={0.05} onChange={(n) => patch("crop", { crop: cropZoom(sel, n / zoomNow) })} />
                    </div>
                    <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Колір фото">
                      {([["none", "Кольорове"], ["bw", "Чорно-біле"]] as const).map(([k, l]) => (
                        <button key={k} type="button" aria-pressed={(sel.look === "bw" ? "bw" : "none") === k} onClick={() => patch("look", { look: k })} className={chip((sel.look === "bw" ? "bw" : "none") === k)}>{l}</button>
                      ))}
                    </div>
                    <div>
                      <div className="mb-1.5 text-[12px] text-black/70">Тонування</div>
                      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Тонування фото">
                        <button type="button" aria-label="Без тонування" aria-pressed={!sel.tint} onClick={() => patch("tint", { tint: undefined })} className={`grid h-7 w-7 place-items-center rounded-full border-2 bg-white text-[13px] text-black/70 ${!sel.tint ? "border-[#5b3df5]" : "border-white shadow-[0_0_0_1px_rgba(0,0,0,0.15)]"}`}>×</button>
                        {["#b9a6ff", "#8fb4ff", "#ffb8d0", "#ffd9a0", "#a8e6cf", "#c9c9d6"].map((c) => (
                          <button key={c} type="button" aria-label={`Тонування ${c}`} aria-pressed={sel.tint === c} onClick={() => patch("tint", { tint: c })} className={`h-7 w-7 rounded-full border-2 ${sel.tint === c ? "border-[#5b3df5]" : "border-white shadow-[0_0_0_1px_rgba(0,0,0,0.15)]"}`} style={{ background: c }} />
                        ))}
                      </div>
                    </div>
                    <Slider label="Розмиття (м'який фон)" value={sel.blur ?? 0} min={0} max={1} step={0.05} onChange={(n) => patch("blur", { blur: n })} />
                    <Slider label="Затемнення (щоб текст читався)" value={sel.dim ?? 0} min={0} max={0.7} step={0.05} onChange={(n) => patch("dim", { dim: n })} />
                    <Slider label="Прозорість" value={sel.opacity} min={0.05} max={1} step={0.05} onChange={(n) => patch("opacity", { opacity: n })} />
                    <div className="grid grid-cols-2 gap-1.5">
                      <button type="button" aria-pressed={!!sel.flip} onClick={() => patch("flip", { flip: !sel.flip })} className={chip(!!sel.flip)}>⇋ Дзеркально</button>
                      <button type="button" onClick={() => patch("rotation", { rotation: Math.round((sel.rotation + 90) % 360) })} className={chip(false)}>↻ Повернути</button>
                    </div>
                    <button type="button" className={`${tool} text-rose-700`} onClick={remove}>Видалити фото</button>
                  </div>
                );
              })()}

              {sel?.type === "shape" && (
                <div className="contents">
                  <ColorRow label="Колір" value={sel.fill} onChange={(c) => patch("fill", { fill: c })} />
                  {sel.shape === "round" && <Slider label="Заокруглення" value={sel.radius} min={0} max={200} onChange={(n) => patch("radius", { radius: n })} />}
                </div>
              )}

              {sel?.type === "sticker" && (
                <div className="contents">
                  <ColorRow label="Колір" value={sel.color} onChange={(c) => patch("color", { color: c })} />
                  <Slider label="Товщина лінії" value={sel.strokeWidth} min={0.6} max={3} step={0.1} onChange={(n) => patch("stroke", { strokeWidth: n })} />
                </div>
              )}

              {sel && !(sel.type === "image" && sel.bg) && <Slider label="Прозорість" value={sel.opacity} min={0.05} max={1} step={0.05} onChange={(n) => patch("opacity", { opacity: n })} />}

              {sel?.type === "sticker" && canFill(sel.kind) && (
                <label className="flex items-center gap-2 text-[13px] text-black/70"><input type="checkbox" checked={sel.filled} onChange={(e) => patch("filled", { filled: e.target.checked })} /> Легка заливка</label>
              )}

              {sel && !(sel.type === "image" && sel.bg) && (
                <div className="flex flex-col gap-2">
                      <div className="grid grid-cols-2 gap-2">
                        <button type="button" className={tool} onClick={() => act((d) => reorderEl(d, sel.id, "front"))}>На передній</button>
                        <button type="button" className={tool} onClick={() => act((d) => reorderEl(d, sel.id, "back"))}>На задній</button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button type="button" className={tool} onClick={duplicate}>Дублювати</button>
                        <button type="button" className={`${tool} text-rose-700`} onClick={remove}>Видалити</button>
                      </div>
                </div>
              )}
              <p className="text-[12px] leading-snug text-black/70">Фото лишаються у вашому браузері, доки ви не збережете обкладинку. Використовуйте лише ті зображення, на які маєте права.</p>
            </Section>
            </div>
          </div>
        </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-[#e6e8f6] bg-white px-4 py-2.5 sm:flex-row sm:items-center sm:justify-end sm:px-6">
          {confirmClose ? (
            <>
              <span className="mr-auto text-[13px] text-black/70">Закрити без збереження? Зміни в обкладинці буде втрачено.</span>
              <button type="button" onClick={() => setConfirmClose(false)} className="min-h-[44px] rounded-xl border border-black/[0.12] px-5 text-[14px] font-medium text-black/70 hover:bg-black/5">Продовжити редагування</button>
              <button type="button" onClick={onClose} className="min-h-[44px] rounded-xl border border-black/[0.12] px-5 text-[14px] font-medium text-rose-700 hover:bg-rose-50">Закрити</button>
            </>
          ) : (
            <>
              <button type="button" onClick={requestClose} className="min-h-[44px] rounded-xl border border-black/[0.12] px-5 text-[14px] font-medium text-black/70 hover:bg-black/5">Скасувати</button>
              <button type="button" data-autofocus onClick={finish} disabled={busy} className={`min-h-[44px] rounded-xl px-6 text-[14px] font-semibold transition disabled:opacity-60 ${allConfirmed ? "bg-[#5b3df5] text-white hover:bg-[#4a2fd0]" : "border-2 border-[#5b3df5] bg-white text-[#4a2fd0] hover:bg-[#f3efff]"}`}>{busy ? "Готуємо…" : allConfirmed ? "Використати обкладинку" : `Перевірте кадри: ${confirmedCount} з ${FRAMES.length}`}</button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
