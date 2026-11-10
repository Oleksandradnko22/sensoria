// The guide builder: a full page where an author assembles an interactive guide
// from blocks (sections, text, scales, practices…). It edits the same block list
// (data/guideContent.ts) the participant's reader draws, so nothing is converted
// on the way. State lives in the course editor; this page only edits the list and
// hands it back through onChange. Pure rules are in utils/guideBuilder.ts.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Icon, type IconName } from "../ui/Icon";
import GuideInteractiveRenderer from "../participant/GuideInteractiveRenderer";
import { renderGuidePreviewPages } from "../../lib/guidePdfExport";
import { toStaticBlocks } from "../../data/guideStatic";
import { useGuideAnswers } from "../participant/useGuideAnswers";
import { MEDIA_MAX_RATIO, MEDIA_MAX_ZOOM, MEDIA_MIN_RATIO, clampWidth, mediaImageStyle } from "../participant/GuideMedia";
import type { GuideBlockType, GuideBlockV2, GuideContent, MediaCaptionPosition } from "../../data/guideContent";
import { isPaidFileRef, signPaidFileRefs, uploadContentFile, uploadPaidFile } from "../../lib/storage";
import {
  BUILDER_BLOCKS,
  GUIDE_BUILDER_MAX_BLOCKS,
  blockInfo,
  blockProblems,
  duplicate,
  guideBlocksProblems,
  insertAt,
  move,
  moveSection,
  newBlock,
  newId,
  removeAt,
  removeSection,
  sectionRanges,
  wordCount,
  type BuilderGroup,
} from "../../utils/guideBuilder";

type Props = {
  title: string;
  blocks: GuideContent;
  onChange: (next: GuideContent) => void;
  onClose: () => void;
  // «Вийти без збереження»: the editor puts the blocks back to how they were when the builder was opened, then closes it
  onDiscard: () => void;
  authorId: string;
  contentId: string;
  // the author's saved meditations that can be given to the reader as a gift (a draft only shows up for readers once it is published)
  giftOptions: { id: string; title: string; published: boolean }[];
  // Saves the guide (the editor owns storage). Returns an error text, or null when it is saved.
  onSave: () => Promise<string | null>;
  // the guide is already live: readers may have saved answers tied to the order of the blocks
  livePublished?: boolean;
  // the author lets readers download the PDF version (only changes the note in the PDF preview)
  allowDownload?: boolean;
  // a paid guide keeps its pictures private; the editor is told about every uploaded picture so it can tidy up unused ones after saving
  price: number;
  onImageUploaded: (url: string) => void;
};

const ICONS: Record<GuideBlockType, IconName> = {
  heading: "bookmark",
  rich_text: "note",
  callout: "bulb",
  flow: "bolt",
  media: "image",
  divider: "pause",
  checklist: "check",
  scale: "chart",
  reflection: "comment",
  timer_practice: "clock",
  decision_tree: "compass",
  action_plan: "star",
  recommendation: "sparkle",
  gift: "heart",
};

const GROUPS: { id: BuilderGroup; label: string; hint: string }[] = [
  { id: "text", label: "Текст і оформлення", hint: "З чого складається читання" },
  { id: "interactive", label: "Взаємодія з читачем", hint: "Те, що читач робить сам" },
  { id: "other", label: "Подарунок", hint: "Медитація від вас" },
];

const INPUT = "w-full rounded-xl border border-[#d9d4f5] bg-white px-4 py-3 text-[15px] text-[#1f1b4d] placeholder:text-black/55 focus:outline-none focus:border-[#5b3df5]";
const LABEL = "mb-2 block text-[13px] font-medium text-black/60";
const SMALL_BTN = "inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-[#d9d4f5] bg-white px-3 text-[14px] font-medium text-[#2d2a5c] transition hover:bg-[#f3efff] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50 disabled:opacity-40 disabled:hover:bg-white";

type Set = (patch: Record<string, unknown>) => void;

function Field({ label, children, hint, htmlFor }: { label: string; children: React.ReactNode; hint?: string; htmlFor?: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className={LABEL}>{label}</label>
      {children}
      {hint && <p className="mt-1.5 text-[13px] leading-snug text-black/60">{hint}</p>}
    </div>
  );
}

function TextInput({ label, value, onChange, placeholder, hint, max }: { label: string; value: string | undefined; onChange: (v: string) => void; placeholder?: string; hint?: string; max?: number }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <input id={id} value={value ?? ""} maxLength={max} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={INPUT} />
    </Field>
  );
}

function TextArea({ label, value, onChange, placeholder, rows = 4, hint }: { label: string; value: string | undefined; onChange: (v: string) => void; placeholder?: string; rows?: number; hint?: string }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <textarea id={id} value={value ?? ""} rows={rows} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={`${INPUT} leading-relaxed`} />
    </Field>
  );
}

// A row-by-row list the author extends with "+ Додати".
function Rows<T>({ label, items, onChange, make, render, addLabel, min = 1, max = 12 }: { label: string; items: T[]; onChange: (next: T[]) => void; make: () => T; render: (item: T, set: (patch: Partial<T>) => void, i: number) => React.ReactNode; addLabel: string; min?: number; max?: number }) {
  return (
    <div>
      <div className={LABEL}>{label}</div>
      <ul className="flex flex-col gap-2.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2">
            <span aria-hidden="true" className="mt-3 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#ece9fe] text-[12px] font-semibold text-[#4a2fd0]">{i + 1}</span>
            <div className="min-w-0 flex-1">{render(item, (patch) => onChange(items.map((x, j) => (j === i ? { ...x, ...patch } : x))), i)}</div>
            <button type="button" aria-label={`Прибрати ${i + 1}`} disabled={items.length <= min} onClick={() => onChange(items.filter((_, j) => j !== i))} className={`${SMALL_BTN} shrink-0 text-[18px]`}>×</button>
          </li>
        ))}
      </ul>
      {items.length < max && (
        <button type="button" onClick={() => onChange([...items, make()])} className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-xl px-3 text-[14px] font-semibold text-[#4a2fd0] hover:bg-[#f3efff] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50">
          <span aria-hidden="true" className="text-[18px] leading-none">+</span>
          {addLabel}
        </button>
      )}
    </div>
  );
}

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div>
      <div className={LABEL}>{label}</div>
      <div role="group" aria-label={label} className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button key={o.id} type="button" aria-pressed={value === o.id} onClick={() => onChange(o.id)} className={`min-h-[44px] rounded-xl px-4 text-[14px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50 ${value === o.id ? "bg-[#5b3df5] text-white" : "border border-[#d9d4f5] bg-white text-[#2d2a5c] hover:bg-[#f3efff]"}`}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const clampPct = (n: number) => Math.min(100, Math.max(0, n));
const clampNum = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const SIDE_LABEL: Record<MediaCaptionPosition, string> = { top: "зверху", bottom: "знизу", left: "ліворуч", right: "праворуч" };

// A dashed "+" next to the picture: where the caption can go.
function CaptionSlot({ at, moving, onPick, vertical }: { at: MediaCaptionPosition; moving: boolean; onPick: (p: MediaCaptionPosition) => void; vertical?: boolean }) {
  return (
    <button type="button" onClick={() => onPick(at)} aria-label={moving ? `Перенести підпис ${SIDE_LABEL[at]}` : `Додати підпис ${SIDE_LABEL[at]}`} title={moving ? `Перенести підпис ${SIDE_LABEL[at]}` : `Додати підпис ${SIDE_LABEL[at]}`} className={`flex items-center justify-center rounded-xl border border-dashed border-[#bfb3f5] text-[13px] font-semibold text-[#4a2fd0] transition hover:bg-[#f3efff] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50 ${vertical ? "min-h-[44px] w-11 self-stretch" : "min-h-[44px] w-full"}`}>
      {vertical ? <span aria-hidden="true" className="text-[18px] leading-none">+</span> : <><span aria-hidden="true" className="mr-1.5 text-[18px] leading-none">+</span>{moving ? "Перенести підпис сюди" : "Підпис"}</>}
    </button>
  );
}

// The picture edited where it sits, like the cover: drag it to move the frame, turn the wheel to zoom,
// pull the corner to resize, and add a caption from any side with the "+" around it.
function ImageCanvas({ block, set, shownUrl }: { block: Extract<GuideBlockV2, { type: "media" }>; set: Set; shownUrl: string }) {
  const pos = block.captionPosition;
  const hasCaptionBox = Boolean(pos);
  const side = pos === "left" || pos === "right";
  const width = clampWidth(block.width, side);
  const zoom = block.zoom ?? 1;
  const focus = block.focus ?? { x: 50, y: 50 };
  const frameRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; fx: number; fy: number } | null>(null);
  const resize = useRef<{ x: number; y: number; w: number; h: number; area: number } | null>(null);
  const [grabbing, setGrabbing] = useState(false);
  const live = useRef({ block, set });
  live.current = { block, set };

  // the frame keeps its current shape once the author starts cropping
  const freezeRatio = () => {
    const r = frameRef.current?.getBoundingClientRect();
    if (r && r.height > 0 && !live.current.block.ratio) return clampNum(r.width / r.height, MEDIA_MIN_RATIO, MEDIA_MAX_RATIO);
    return live.current.block.ratio;
  };

  // wheel zoom: needs a non-passive listener to stop the page from scrolling meanwhile
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { block: b, set: st } = live.current;
      const z = clampNum((b.zoom ?? 1) * (1 - e.deltaY * 0.002), 1, MEDIA_MAX_ZOOM);
      st({ zoom: Math.round(z * 100) / 100, ratio: freezeRatio() });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [block.url]);

  const moveCaption = (p: MediaCaptionPosition) => set({ captionPosition: p, width: clampWidth(block.width, p === "left" || p === "right") });
  const removeCaption = () => set({ caption: "", captionPosition: undefined });

  const captionBox = (
    <div className="flex min-w-0 flex-1 items-start gap-2">
      <textarea
        autoFocus
        aria-label="Підпис до зображення"
        value={block.caption ?? ""}
        maxLength={200}
        rows={side ? 4 : 2}
        placeholder="Напишіть підпис"
        onChange={(e) => set({ caption: e.target.value })}
        className="min-w-0 flex-1 resize-none rounded-2xl bg-[#f3efff] px-5 py-4 text-[16px] font-medium leading-relaxed text-[#2d2a5c] placeholder:text-black/55 focus:outline-none focus:ring-2 focus:ring-[#5b3df5]/50"
      />
      <button type="button" aria-label="Прибрати підпис" title="Прибрати підпис" onClick={removeCaption} className={`${SMALL_BTN} shrink-0 text-[18px]`}>×</button>
    </div>
  );

  const frame = (
    <div className="relative" style={side ? { flexBasis: `${width}%`, flexShrink: 0 } : { width: `${width}%` }}>
      <div
        ref={frameRef}
        role="group"
        tabIndex={0}
        aria-label="Зображення: тягніть, щоб змінити кадр; коліщатко або + і − змінюють масштаб; стрілки зсувають кадр"
        className={`touch-none overflow-hidden rounded-[20px] bg-black/5 outline-none ring-1 ring-[#d9d4f5] focus-visible:ring-2 focus-visible:ring-[#5b3df5] ${grabbing ? "cursor-grabbing" : "cursor-grab"}`}
        style={block.ratio ? { aspectRatio: String(block.ratio) } : undefined}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, fx: focus.x, fy: focus.y };
          setGrabbing(true);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const r = e.currentTarget.getBoundingClientRect();
          const ratio = freezeRatio();
          set({ ratio, focus: { x: clampPct(d.fx - ((e.clientX - d.x) / r.width) * 100), y: clampPct(d.fy - ((e.clientY - d.y) / r.height) * 100) } });
        }}
        onPointerUp={() => { drag.current = null; setGrabbing(false); }}
        onPointerCancel={() => { drag.current = null; setGrabbing(false); }}
        onKeyDown={(e) => {
          const step = 5;
          const move = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
          if (move) {
            e.preventDefault();
            set({ ratio: freezeRatio(), focus: { x: clampPct(focus.x + move[0]), y: clampPct(focus.y + move[1]) } });
          } else if (e.key === "+" || e.key === "=" || e.key === "-") {
            e.preventDefault();
            set({ ratio: freezeRatio(), zoom: Math.round(clampNum(zoom + (e.key === "-" ? -0.2 : 0.2), 1, MEDIA_MAX_ZOOM) * 100) / 100 });
          }
        }}
      >
        <img src={shownUrl} alt="" draggable={false} className={`select-none ${block.ratio || zoom > 1 ? "h-full w-full object-cover" : "block h-auto w-full"}`} style={mediaImageStyle({ ratio: block.ratio, zoom, focus })} />
      </div>
      <div
        role="slider"
        tabIndex={0}
        aria-label="Розмір зображення"
        aria-valuemin={25}
        aria-valuemax={side ? 75 : 100}
        aria-valuenow={Math.round(width)}
        title="Потягніть, щоб змінити розмір"
        className="absolute -bottom-3 -right-3 flex h-11 w-11 cursor-nwse-resize touch-none items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]"
        onPointerDown={(e) => {
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          const r = frameRef.current?.getBoundingClientRect();
          const a = areaRef.current?.getBoundingClientRect();
          if (r && a) resize.current = { x: e.clientX, y: e.clientY, w: r.width, h: r.height, area: a.width };
        }}
        onPointerMove={(e) => {
          const d = resize.current;
          if (!d) return;
          const nw = Math.max(40, d.w + (e.clientX - d.x));
          const nh = Math.max(40, d.h + (e.clientY - d.y));
          set({ width: Math.round(clampWidth((nw / d.area) * 100, side)), ratio: Math.round(clampNum(nw / nh, MEDIA_MIN_RATIO, MEDIA_MAX_RATIO) * 100) / 100 });
        }}
        onPointerUp={() => { resize.current = null; }}
        onPointerCancel={() => { resize.current = null; }}
        onKeyDown={(e) => {
          const step = e.key === "ArrowRight" || e.key === "ArrowUp" ? 5 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -5 : 0;
          if (!step) return;
          e.preventDefault();
          set({ width: clampWidth(width + step, side) });
        }}
      >
        <span aria-hidden="true" className="h-5 w-5 rounded-full border-2 border-white bg-[#5b3df5] shadow-md" />
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      <div ref={areaRef} className="rounded-2xl bg-[#faf8ff] p-4 ring-1 ring-[#e4def9]">
        <div className="flex flex-col gap-3">
          {pos === "top" ? captionBox : <CaptionSlot at="top" moving={hasCaptionBox} onPick={moveCaption} />}
          <div className="flex items-center gap-3">
            {pos === "left" ? captionBox : <CaptionSlot at="left" moving={hasCaptionBox} onPick={moveCaption} vertical />}
            {side ? frame : <div className="flex min-w-0 flex-1 justify-center">{frame}</div>}
            {pos === "right" ? captionBox : <CaptionSlot at="right" moving={hasCaptionBox} onPick={moveCaption} vertical />}
          </div>
          {pos === "bottom" ? captionBox : <CaptionSlot at="bottom" moving={hasCaptionBox} onPick={moveCaption} />}
        </div>
      </div>
      <p className="text-[13px] leading-snug text-black/60">Тягніть фото, щоб змінити кадр. Коліщатко миші змінює масштаб, а фіолетовий куточок розмір. Плюси навколо додають підпис з потрібного боку.</p>
      {(block.ratio || zoom > 1 || block.width) && (
        <button type="button" onClick={() => set({ ratio: undefined, zoom: undefined, focus: undefined, width: undefined })} className="inline-flex min-h-[44px] w-fit items-center rounded-xl px-3 text-[14px] font-semibold text-[#4a2fd0] hover:bg-[#f3efff] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50">Скинути кадр і розмір</button>
      )}
    </div>
  );
}

function ImageEditor({ block, set, authorId, contentId, price, shownUrl, onUploaded }: { block: Extract<GuideBlockV2, { type: "media" }>; set: Set; authorId: string; contentId: string; price: number; shownUrl: string; onUploaded: (url: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setErr("Потрібне зображення (JPG, PNG або WebP).");
    if (file.size > 5 * 1024 * 1024) return setErr("Зображення до 5 МБ.");
    setErr("");
    setBusy(true);
    try {
      const name = `guide-${block.id}-${Date.now()}`;
      // paid guide → private storage (a reference), free guide → public link
      const url = price > 0 ? await uploadPaidFile(authorId, contentId, file, name) : await uploadContentFile(authorId, file, `${contentId}/${name}`);
      onUploaded(url);
      // a new picture starts with a clean frame
      set({ url, ratio: undefined, zoom: undefined, focus: undefined, width: undefined });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Не вдалося завантажити зображення.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-4">
      {block.url ? (
        shownUrl ? <ImageCanvas block={block} set={set} shownUrl={shownUrl} /> : <p className="rounded-2xl bg-[#faf8ff] px-4 py-6 text-center text-[14px] text-black/60 ring-1 ring-[#e4def9]">Готуємо зображення…</p>
      ) : (
        <label className="flex min-h-[160px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#bfb3f5] bg-[#faf8ff] p-6 text-center transition hover:bg-[#f3efff] focus-within:ring-2 focus-within:ring-[#5b3df5]/50">
          <span aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#ece9fe] text-[#5b3df5]"><Icon name="image" size={22} /></span>
          <span className="text-[15px] font-semibold text-[#1f1b4d]">{busy ? "Завантажуємо…" : "Завантажити зображення"}</span>
          <span className="text-[13px] text-black/60">JPG, PNG або WebP, до 5 МБ</span>
          <input type="file" accept="image/*" className="sr-only" disabled={busy} onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
      )}
      {block.url && (
        <label className={`${SMALL_BTN} w-fit cursor-pointer`}>
          {busy ? "Завантажуємо…" : "Замінити зображення"}
          <input type="file" accept="image/*" className="sr-only" disabled={busy} onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
      )}
      {err && <p role="alert" className="text-[13px] text-rose-700">{err}</p>}
    </div>
  );
}

function Editor({ block, set, authorId, contentId, giftOptions, price, shownUrl, onUploaded }: { block: GuideBlockV2; set: Set; authorId: string; contentId: string; giftOptions: { id: string; title: string; published: boolean }[]; price: number; shownUrl: (url: string) => string; onUploaded: (url: string) => void }) {
  switch (block.type) {
    case "heading":
      return (
        <div className="flex flex-col gap-4">
          <TextInput label="Назва розділу" value={block.text} onChange={(v) => set({ text: v })} placeholder="Наприклад, Що відбувається з тілом" max={120} />
          <TextInput label="Про що розділ (коротко)" value={block.summary} onChange={(v) => set({ summary: v })} placeholder="Одне речення для змісту гайду" max={200} hint="Необов’язково. Показується читачеві в змісті." />
        </div>
      );
    case "rich_text":
      return <TextArea label="Текст" value={block.text} onChange={(v) => set({ text: v })} rows={6} placeholder="Пишіть простими словами. Порожній рядок починає новий абзац." />;
    case "callout":
      return (
        <div className="flex flex-col gap-4">
          <Segmented label="Вигляд" value={block.tone ?? "calm"} onChange={(v) => set({ tone: v })} options={[{ id: "calm", label: "Спокійна" }, { id: "note", label: "Примітка" }, { id: "care", label: "Турбота про себе" }]} />
          <TextInput label="Заголовок" value={block.title} onChange={(v) => set({ title: v })} placeholder="Необов’язково" max={100} />
          <TextArea label="Текст" value={block.text} onChange={(v) => set({ text: v })} rows={3} />
        </div>
      );
    case "flow":
      return (
        <div className="flex flex-col gap-4">
          <TextInput label="Заголовок схеми" value={block.title} onChange={(v) => set({ title: v })} placeholder="Необов’язково" max={100} />
          <Rows label="Кроки" items={block.steps} min={2} max={8} addLabel="Додати крок" make={() => ({ label: "", text: "" })} onChange={(steps) => set({ steps })}
            render={(s, upd) => (
              <div className="flex flex-col gap-2">
                <input aria-label="Назва кроку" value={s.label} onChange={(e) => upd({ label: e.target.value })} placeholder="Назва кроку" className={INPUT} />
                <input aria-label="Пояснення кроку" value={s.text ?? ""} onChange={(e) => upd({ text: e.target.value })} placeholder="Пояснення (необов’язково)" className={INPUT} />
              </div>
            )} />
          <TextInput label="Підпис під схемою" value={block.caption} onChange={(v) => set({ caption: v })} placeholder="Необов’язково" max={200} />
        </div>
      );
    case "media":
      return (
        <div className="flex flex-col gap-4">
          <ImageEditor block={block} set={set} authorId={authorId} contentId={contentId} price={price} shownUrl={shownUrl(block.url)} onUploaded={onUploaded} />
          <TextInput label="Опис зображення словами" value={block.alt} onChange={(v) => set({ alt: v })} placeholder="Що зображено" max={200} hint="Для людей, які користуються озвучуванням екрана." />
        </div>
      );
    case "divider":
      return <p className="text-[14px] text-black/60">Тонка лінія між частинами. Налаштувань немає.</p>;
    case "checklist":
      return (
        <div className="flex flex-col gap-4">
          <TextInput label="Питання" value={block.prompt} onChange={(v) => set({ prompt: v })} placeholder="Наприклад, Що з цього ви помічаєте у собі?" max={200} />
          <Segmented label="Скільки можна вибрати" value={block.selection ?? "multiple"} onChange={(v) => set({ selection: v })} options={[{ id: "multiple", label: "Кілька варіантів" }, { id: "single", label: "Один варіант" }]} />
          <Rows label="Варіанти" items={block.items} min={2} max={10} addLabel="Додати варіант" make={() => ({ id: newId("i"), label: "" })} onChange={(items) => set({ items })}
            render={(it, upd) => <input aria-label="Варіант" value={it.label} onChange={(e) => upd({ label: e.target.value })} placeholder="Текст варіанта" className={INPUT} />} />
        </div>
      );
    case "scale":
      return (
        <div className="flex flex-col gap-4">
          <TextInput label="Що оцінює читач" value={block.prompt} onChange={(v) => set({ prompt: v })} placeholder="Наприклад, Наскільки сильна тривога зараз?" max={200} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput label="Підпис мінімуму" value={block.lowLabel} onChange={(v) => set({ lowLabel: v })} placeholder="Зовсім не відчуваю" max={60} />
            <TextInput label="Підпис максимуму" value={block.highLabel} onChange={(v) => set({ highLabel: v })} placeholder="Дуже сильно" max={60} />
          </div>
          <Segmented label="Коли вимірюємо" value={block.phase ?? "none"} onChange={(v) => set({ phase: v === "none" ? undefined : v })} options={[{ id: "none", label: "Один раз" }, { id: "before", label: "До вправи" }, { id: "after", label: "Після вправи" }]} />
          <p className="-mt-2 text-[13px] leading-snug text-black/60">«До» і «після» зберігаються, щоб читач побачив різницю. Шкала від {block.min} до {block.max}.</p>
        </div>
      );
    case "reflection":
      return (
        <div className="flex flex-col gap-4">
          <TextInput label="Питання" value={block.prompt} onChange={(v) => set({ prompt: v })} placeholder="Наприклад, Що я помітив(-ла) у цій ситуації?" max={200} />
          <TextInput label="Підказка в полі" value={block.placeholder} onChange={(v) => set({ placeholder: v })} placeholder="Необов’язково" max={120} hint="Відповідь бачить тільки сам читач." />
        </div>
      );
    case "timer_practice":
      return (
        <div className="flex flex-col gap-4">
          <TextInput label="Назва практики" value={block.title} onChange={(v) => set({ title: v })} placeholder="Наприклад, Хвилина дихання" max={100} />
          <TextArea label="Вступ" value={block.intro} onChange={(v) => set({ intro: v })} rows={2} placeholder="Необов’язково" />
          <Rows label="Кроки за часом" items={block.phases} min={1} max={10} addLabel="Додати крок" make={() => ({ seconds: 30, text: "" })} onChange={(phases) => set({ phases })}
            render={(p, upd) => (
              <div className="grid gap-2 sm:grid-cols-[130px_1fr]">
                <div className="relative">
                  <input aria-label="Секунд" inputMode="numeric" value={p.seconds || ""} onChange={(e) => upd({ seconds: Math.min(600, Number(e.target.value.replace(/[^\d]/g, "")) || 0) })} placeholder="30" className={`${INPUT} pr-12`} />
                  <span aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[14px] text-black/55">сек</span>
                </div>
                <input aria-label="Що робити" value={p.text} onChange={(e) => upd({ text: e.target.value })} placeholder="Що робити в цей час" className={INPUT} />
              </div>
            )} />
          <TextInput label="Фраза наприкінці" value={block.doneText} onChange={(v) => set({ doneText: v })} placeholder="Наприклад, Ви молодець. Повертайтеся, коли буде потрібно." max={200} />
        </div>
      );
    case "decision_tree":
      return (
        <div className="flex flex-col gap-4">
          <TextInput label="Питання" value={block.prompt} onChange={(v) => set({ prompt: v })} placeholder="Наприклад, Що зараз найближче до вашого стану?" max={200} />
          <Rows label="Відповіді" items={block.branches} min={2} max={6} addLabel="Додати відповідь" make={() => ({ id: newId("i"), label: "", step: "" })} onChange={(branches) => set({ branches })}
            render={(b, upd) => (
              <div className="flex flex-col gap-2">
                <input aria-label="Відповідь" value={b.label} onChange={(e) => upd({ label: e.target.value })} placeholder="Якщо…" className={INPUT} />
                <input aria-label="Наступний крок" value={b.step} onChange={(e) => upd({ step: e.target.value })} placeholder="…то зробіть це" className={INPUT} />
              </div>
            )} />
        </div>
      );
    case "action_plan":
      return (
        <div className="flex flex-col gap-4">
          <TextInput label="Вступ до плану" value={block.prompt} onChange={(v) => set({ prompt: v })} placeholder="Наприклад, Оберіть до двох маленьких кроків на сьогодні" max={200} />
          <Field label="Скільки дій можна вибрати">
            <input aria-label="Скільки дій можна вибрати" inputMode="numeric" value={block.max || ""} onChange={(e) => set({ max: Math.max(1, Math.min(10, Number(e.target.value.replace(/[^\d]/g, "")) || 1)) })} className={`${INPUT} max-w-[120px]`} />
          </Field>
          <Rows label="Дії на вибір" items={block.items} min={2} max={10} addLabel="Додати дію" make={() => ({ id: newId("i"), label: "" })} onChange={(items) => set({ items })}
            render={(it, upd) => <input aria-label="Дія" value={it.label} onChange={(e) => upd({ label: e.target.value })} placeholder="Маленька дія" className={INPUT} />} />
        </div>
      );
    case "gift":
      return (
        <div className="flex flex-col gap-4">
          <div>
            <div className={LABEL}>Яку медитацію подарувати</div>
            {giftOptions.length === 0 ? (
              <p className="rounded-xl bg-[#f6f4ff] px-4 py-3 text-[14px] leading-relaxed text-[#2d2a5c]">У вас ще немає збережених медитацій. Створіть медитацію, і її можна буде подарувати тут. Програму до гайду прикріпити не можна.</p>
            ) : (
              <div role="radiogroup" aria-label="Медитація-подарунок" className="flex flex-col gap-2">
                {giftOptions.map((o) => {
                  const on = block.meditationId === o.id;
                  return (
                    <button key={o.id} type="button" role="radio" aria-checked={on} onClick={() => set({ meditationId: o.id, meditationTitle: o.title })} className={`flex min-h-[56px] items-center gap-3 rounded-2xl border px-4 py-2 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50 ${on ? "border-[#5b3df5] bg-[#f3efff]" : "border-[#e4def9] bg-white hover:bg-[#faf8ff]"}`}>
                      <span aria-hidden="true" className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${on ? "border-[#5b3df5]" : "border-[#bfb3f5]"}`}>{on && <span className="h-2.5 w-2.5 rounded-full bg-[#5b3df5]" />}</span>
                      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-[#1f1b4d]">{o.title || "Без назви"}</span>
                      {!o.published && <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-0.5 text-[12px] font-semibold text-amber-900 ring-1 ring-amber-200">чернетка</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          {block.meditationId && giftOptions.find((o) => o.id === block.meditationId)?.published === false && (
            <p role="note" className="rounded-xl bg-amber-50 px-4 py-3 text-[14px] leading-relaxed text-amber-900">Ця медитація ще не опублікована. Читачі побачать подарунок, коли ви її опублікуєте.</p>
          )}
          <TextArea label="Слово від вас" value={block.text} onChange={(v) => set({ text: v })} rows={2} placeholder="Наприклад, Це коротка практика, яка допоможе закріпити те, про що ми говорили." hint="Необов’язково." />
        </div>
      );
    case "recommendation":
      return (
        <div className="flex flex-col gap-4">
          <TextInput label="Заголовок" value={block.prompt} onChange={(v) => set({ prompt: v })} max={120} />
          <p className="text-[14px] leading-relaxed text-black/60">Практики та гайди підбираються автоматично за темою вашого гайду.</p>
        </div>
      );
  }
}

// One-line preview of what a collapsed block says.
function summaryOf(block: GuideBlockV2): string {
  const any = block as unknown as Record<string, unknown>;
  const first = ["text", "prompt", "title"].map((k) => any[k]).find((v) => typeof v === "string" && v.trim());
  return typeof first === "string" ? first.trim() : "";
}

// "Перегляд": the very same reader the participant gets (colours, outlines, interactions),
// fed with the author's blocks. Nothing is saved: answers live only in this preview, and
// blocks that are not filled in yet are left out so the page never shows empty frames.
function GuidePreview({ title, blocks, guideId, allowDownload }: { title: string; blocks: GuideContent; guideId: string; allowDownload: boolean }) {
  const [view, setView] = useState<"site" | "pdf">("site");
  // the real A4 pages: the very layout the reader's PDF is built with (text is measured and flows page by page)
  const [pdfPages, setPdfPages] = useState<{ imageUrl: string }[] | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [skipped, setSkipped] = useState(0);
  const shown = useMemo(() => blocks.filter((b) => blockProblems(b).length === 0), [blocks]);
  const hidden = blocks.length - shown.length;
  const guide = useGuideAnswers({ guideId, guideTitle: title, content: shown, userId: null });
  const [page, setPage] = useState(0);
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (view !== "pdf" || shown.length === 0) return;
    let off = false;
    setPdfBusy(true);
    const t = window.setTimeout(() => {
      void renderGuidePreviewPages({ title, blocks: toStaticBlocks(shown), count: 80, onSkipped: (n) => { if (!off) setSkipped(n); } })
        .then((pages) => { if (!off) setPdfPages(pages); })
        .catch(() => { if (!off) setPdfPages([]); })
        .finally(() => { if (!off) setPdfBusy(false); });
    }, 250);
    return () => { off = true; window.clearTimeout(t); };
  }, [view, shown, title]);
  const goTo = (n: number) => {
    setPage(n);
    top.current?.scrollIntoView({ block: "start" });
  };
  return (
    <div ref={top}>
      <div role="group" aria-label="Що показати" className="mb-4 inline-flex rounded-xl bg-[#ece9fe] p-1">
        {([["site", "Читання на сайті"], ["pdf", "PDF-версія"]] as const).map(([id, label]) => (
          <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)} className={`min-h-[44px] rounded-lg px-4 text-[14px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50 ${view === id ? "bg-white text-[#4a2fd0] shadow-sm" : "text-[#4a2fd0]/80 hover:text-[#4a2fd0]"}`}>
            {label}
          </button>
        ))}
      </div>
      <p role="note" className="mb-4 rounded-xl bg-white px-4 py-3 text-[14px] leading-relaxed text-[#2d2a5c] ring-1 ring-[#e4def9]">
        {view === "site"
          ? "Так гайд побачить читач. Можна клікати й відповідати, але нічого не зберігається."
          : allowDownload
            ? "Так виглядатиме PDF, який завантажить читач: сторінки А4, текст переноситься сам. Інтерактивні блоки стають бланками. Водяний знак читача додається вже під час завантаження."
            : "Так виглядав би PDF, але завантаження вимкнено, і читач його не отримає. Увімкнути можна на кроці «PDF та про гайд»."}

        {hidden > 0 && ` Незаповнених блоків: ${hidden}. У перегляді їх не показано.`}
      </p>
      {view === "pdf" && (
        <p role="note" className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-[14px] font-semibold leading-relaxed text-rose-700 ring-1 ring-rose-200">
          Увага: зображення в PDF інколи можуть не завантажитися. Тоді їхній блок у файлі пропускається, а решта лишається. Не лишайте важливу думку лише в картинці чи підписі до неї.
        </p>
      )}
      {view === "pdf" ? (
        shown.length === 0 ? (
          <p className="rounded-[28px] bg-white p-10 text-center text-[15px] text-black/60 ring-1 ring-[#e4def9]">Поки що нічого показувати. Заповніть хоча б один розділ.</p>
        ) : (
          <div className="rounded-[28px] bg-[#e9e6f7] px-3 py-8 ring-1 ring-[#e4def9] sm:px-8" aria-busy={pdfBusy}>
            {pdfPages === null || (pdfBusy && pdfPages.length === 0) ? (
              <p role="status" className="py-10 text-center text-[15px] text-[#4a2fd0]">Готуємо сторінки…</p>
            ) : pdfPages.length === 0 ? (
              <p role="alert" className="py-10 text-center text-[15px] text-rose-700">Не вдалося показати PDF-версію. Спробуйте ще раз.</p>
            ) : (
              <>
                <p className="mb-5 text-center text-[15px] font-semibold text-[#2d2a5c]">Сторінок: {pdfPages.length}</p>
                {skipped > 0 && <p role="alert" className="mx-auto mb-5 max-w-[794px] rounded-xl bg-amber-50 px-4 py-3 text-[14px] leading-relaxed text-amber-900 ring-1 ring-amber-200">Зображень, які не вдалося завантажити: {skipped}. У PDF такі блоки пропускаються, решта лишається.</p>}
                <div className="flex flex-col items-center gap-6">
                  {pdfPages.map((pg, i) => (
                    <figure key={i} className="w-full max-w-[794px]">
                      <img src={pg.imageUrl} alt={`Сторінка ${i + 1} з ${pdfPages.length}`} className="block h-auto w-full bg-white shadow-[0_12px_30px_-18px_rgba(40,30,110,0.5)]" />
                      <figcaption className="mt-2 text-center text-[13px] text-black/60">Сторінка {i + 1} з {pdfPages.length}</figcaption>
                    </figure>
                  ))}
                </div>
              </>
            )}
          </div>
        )
      ) : (
      <div className="rounded-[28px] bg-[#f8f9fe] px-6 py-10 ring-1 ring-[#e4def9] md:px-12 md:py-14">
        {shown.length === 0 ? (
          <p className="text-center text-[15px] text-black/60">Поки що нічого показувати. Заповніть хоча б один розділ.</p>
        ) : (
          <GuideInteractiveRenderer guideId={guideId} guide={guide} content={shown} userId={null} related={[]} onOpenRelated={() => {}} page={page} onPageChange={goTo} />
        )}
      </div>
      )}
    </div>
  );
}

export default function GuideBuilder({ title, blocks, onChange, onClose, onDiscard, authorId, contentId, giftOptions, onSave, livePublished = false, price, onImageUploaded, allowDownload = true }: Props) {
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [activeSec, setActiveSec] = useState(0);
  // index of the section waiting for "yes, delete" (null = none)
  const [delSec, setDelSec] = useState<number | null>(null);
  // leaving is allowed only when every added block is filled in; then the guide is saved first
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // «До гайду» with unfilled blocks: first "leave without saving?", then "save only what is filled?"
  const [exitAsk, setExitAsk] = useState<null | "ask" | "partial">(null);
  const [openGroup, setOpenGroup] = useState<BuilderGroup>("text");
  const [openId, setOpenId] = useState<string | null>(blocks[0]?.id ?? null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [showHints, setShowHints] = useState(false);
  const scrollTo = useRef<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Like a page: the site behind does not scroll, focus moves in, Tab stays inside, focus returns on leaving.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    rootRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      const box = rootRef.current;
      if (e.key !== "Tab" || !box) return;
      const items = [...box.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])')].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === box || !box.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !box.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, []);

  useEffect(() => {
    if (!scrollTo.current) return;
    const el = document.getElementById(`gb-${scrollTo.current}`);
    scrollTo.current = null;
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  // private pictures (paid guide) are shown through short-lived signed links
  const [signed, setSigned] = useState<Map<string, string>>(new Map());
  const paidRefs = blocks.flatMap((b) => (b.type === "media" && isPaidFileRef(b.url) ? [b.url] : []));
  const paidKey = paidRefs.join("|");
  useEffect(() => {
    if (paidRefs.length === 0) return;
    let off = false;
    void signPaidFileRefs(paidRefs).then((m) => {
      if (!off) setSigned((prev) => new Map([...prev, ...m]));
    });
    return () => {
      off = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paidKey]);
  const shownUrl = (url: string) => (isPaidFileRef(url) ? signed.get(url) ?? "" : url);

  const problems = useMemo(() => guideBlocksProblems(blocks, price), [blocks, price]);
  const secs = useMemo(() => sectionRanges(blocks), [blocks]);
  const sec = Math.max(0, Math.min(activeSec, secs.length - 1));
  const range = secs[sec] ?? { start: 0, end: 0, heading: true };
  const secBad = (r: { start: number; end: number }) => blocks.slice(r.start, r.end).some((b) => blockProblems(b, price).length > 0);
  const badCount = useMemo(() => blocks.filter((b) => blockProblems(b, price).length > 0).length, [blocks, price]);
  const words = useMemo(() => wordCount(blocks), [blocks]);
  const full = blocks.length >= GUIDE_BUILDER_MAX_BLOCKS;

  // a new block goes right after the open block of this section; with none open, to the end of the section
  const openIdx = openId ? blocks.findIndex((b) => b.id === openId) : -1;
  const anchorIndex = openIdx >= range.start && openIdx < range.end ? openIdx : -1;
  const anchorLabel = anchorIndex >= 0 ? summaryOf(blocks[anchorIndex]) || blockInfo(blocks[anchorIndex].type).label : "";
  const add = (type: GuideBlockType) => {
    if (full) return;
    const block = newBlock(type);
    if (type === "heading") {
      // a new section opens right after the current one, in its own tab
      onChange(insertAt(blocks, range.end, block));
      setActiveSec(secs.length === 0 ? 0 : sec + 1);
    } else {
      if (blocks.length === 0) return; // the guide starts with a section
      onChange(insertAt(blocks, anchorIndex >= 0 ? anchorIndex + 1 : range.end, block));
    }
    setOpenId(block.id);
    scrollTo.current = block.id;
  };
  const patch = (index: number, p: Record<string, unknown>) => onChange(blocks.map((b, i) => (i === index ? ({ ...b, ...p } as GuideBlockV2) : b)));

  const panel = (
    <section aria-label="Додати блок" className="rounded-[22px] border border-[#e4def9] bg-white p-5 shadow-[0_14px_30px_-22px_rgba(70,40,170,0.5)]">
      <div className="text-[18px] font-semibold text-[#1f1b4d]">Додати блок</div>
      <p role="status" className="mt-2 break-words rounded-xl bg-[#f6f4ff] px-3 py-2 text-[13px] leading-snug text-[#2d2a5c] [overflow-wrap:anywhere]">
        {blocks.length === 0 ? "Спершу додайте розділ: кнопка «+ Розділ» зверху." : anchorLabel ? <>Додасться після: <span className="font-semibold">«{anchorLabel.length > 30 ? `${anchorLabel.slice(0, 30)}…` : anchorLabel}»</span></> : "Додасться в кінець гайду."}
      </p>
      <div className="mt-3 flex flex-col divide-y divide-[#efeafc]">
        {GROUPS.map((g) => {
          const open = openGroup === g.id;
          // sections are added with the tabs above, not from this list
          const items = BUILDER_BLOCKS.filter((b) => b.group === g.id && b.type !== "heading");
          return (
            <div key={g.id}>
              <button type="button" aria-expanded={open} aria-controls={`gb-group-${g.id}`} onClick={() => setOpenGroup(open ? ("" as BuilderGroup) : g.id)} className="flex min-h-[52px] w-full items-center justify-between gap-3 rounded-xl text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50">
                <span>
                  <span className="block text-[15px] font-semibold text-[#1f1b4d]">{g.label}</span>
                  <span className="block text-[13px] text-black/60">{items.length === 1 ? "1 блок" : `${items.length} блоків`}</span>
                </span>
                <span aria-hidden="true" className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f3efff] text-[#4a2fd0] transition-transform ${open ? "rotate-180" : ""}`}>
                  <Icon name="chevron" size={16} />
                </span>
              </button>
              {open && (
                <div id={`gb-group-${g.id}`} className="flex flex-col gap-2 pb-3">
                  {items.map((b) => (
                    <button key={b.type} type="button" disabled={full || blocks.length === 0} onClick={() => add(b.type)} className="flex min-h-[56px] items-center gap-3 rounded-2xl border border-[#e4def9] bg-[#faf8ff] px-3 py-2 text-left transition hover:border-[#bfb3f5] hover:bg-[#f3efff] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50 disabled:opacity-40">
                      <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#ece9fe] text-[#5b3df5]"><Icon name={ICONS[b.type]} size={18} /></span>
                      <span className="min-w-0">
                        <span className="block text-[15px] font-semibold leading-tight text-[#1f1b4d]">{b.label}</span>
                        <span className="block text-[13px] leading-snug text-black/60">{b.hint}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );

  const showProblems = () => {
    setShowHints(true);
    setMode("edit");
    const i = blocks.findIndex((x) => blockProblems(x, price).length > 0);
    if (i >= 0) {
      const k = secs.findIndex((r) => i >= r.start && i < r.end);
      if (k >= 0) setActiveSec(k);
      setOpenId(blocks[i].id);
      scrollTo.current = blocks[i].id;
    }
  };

  const leave = async () => {
    if (saving) return;
    if (badCount > 0) {
      setNotice(`Заповніть усі додані блоки (не заповнено: ${badCount}), а потім зберігайте й виходьте.`);
      showProblems();
      return;
    }
    setNotice(null);
    setSaving(true);
    const err = await onSave();
    setSaving(false);
    if (err) {
      setNotice(err);
      return;
    }
    onClose();
  };
  const locked = badCount > 0;

  // «До гайду»: everything filled → save and leave; gaps → ask first
  const back = () => {
    if (saving) return;
    if (badCount === 0) {
      void leave();
      return;
    }
    setExitAsk("ask");
  };
  // keeps only the filled blocks (a section whose title was empty is dropped, its filled blocks join a «Вступ» if nothing is left on top)
  const savePartial = async () => {
    if (saving) return;
    let kept = blocks.filter((b) => blockProblems(b, price).length === 0);
    if (kept.length > 0 && kept[0].type !== "heading") kept = [{ ...newBlock("heading"), text: "Вступ" } as GuideBlockV2, ...kept];
    onChange(kept);
    setExitAsk(null);
    setNotice(null);
    setActiveSec(0);
    setSaving(true);
    const err = await onSave();
    setSaving(false);
    if (err) {
      setNotice(err);
      return;
    }
    onClose();
  };

  const overview = (
    <section aria-label="Розділи гайду" className="rounded-[22px] border border-[#e4def9] bg-white p-4 shadow-[0_14px_30px_-22px_rgba(70,40,170,0.5)] sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-[13px] text-black/60">
          <span className="text-[16px] font-semibold text-[#1f1b4d]">Ваш гайд</span> · розділів: {secs.length} · блоків: {blocks.length} · слів: {words}
        </div>
        {problems.length === 0 ? (
          <span role="status" className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-emerald-50 px-4 text-[14px] font-semibold text-emerald-800"><span aria-hidden="true">✓</span> Усе заповнено</span>
        ) : (
          <button type="button" title={problems.join(" ")} onClick={showProblems} className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-amber-50 px-4 text-[14px] font-semibold text-amber-900 ring-1 ring-amber-200 transition hover:bg-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50">
            {badCount > 0 ? `Не заповнено: ${badCount}` : "Ще потрібно"} · показати
          </button>
        )}
      </div>
      {mode === "edit" && (
      <div role="tablist" aria-label="Розділи" className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#efeafc] pt-3">
        {secs.map((r, n) => {
          const on = n === sec && mode === "edit";
          const head = r.heading ? (blocks[r.start] as { text: string }).text.trim() : "";
          const label = r.heading ? `Розділ ${n + 1}` : "Вступ";
          return (
            <div key={blocks[r.start].id} className={`inline-flex items-center rounded-full transition ${on ? "bg-gradient-to-r from-[#5232f4] to-[#774eff] text-white shadow-[0_8px_18px_-10px_rgba(91,61,245,0.9)]" : "bg-[#f3efff] text-[#2d2a5c] hover:bg-[#e8e1ff]"}`}>
              <button type="button" role="tab" aria-selected={on} title={head || undefined} onClick={() => { setMode("edit"); setDelSec(null); setActiveSec(n); setOpenId(blocks[r.start].id); }} className="relative inline-flex min-h-[44px] items-center gap-2 rounded-full pl-4 pr-2 text-[14px] font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50">
                {label}
                {showHints && secBad(r) && <span aria-label="Є незаповнені блоки" className={`h-2 w-2 rounded-full ${on ? "bg-amber-300" : "bg-amber-500"}`} />}
              </button>
              <button type="button" aria-label={`Видалити: ${label}`} title="Видалити розділ" onClick={() => setDelSec(delSec === n ? null : n)} className={`flex h-11 w-11 items-center justify-center rounded-full text-[18px] leading-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50 ${on ? "hover:bg-white/20" : "hover:bg-black/5"}`}>
                <span aria-hidden="true">×</span>
              </button>
            </div>
          );
        })}
        <button type="button" disabled={full} onClick={() => add("heading")} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-dashed border-[#bfb3f5] bg-white px-4 text-[14px] font-semibold text-[#4a2fd0] transition hover:bg-[#f3efff] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50 disabled:opacity-40">
          <span aria-hidden="true" className="text-[18px] leading-none">+</span> Розділ
        </button>
      </div>
      )}
      {mode === "edit" && delSec !== null && secs[delSec] && (() => {
        const r = secs[delSec];
        const label = r.heading ? `Розділ ${delSec + 1}` : "Вступ";
        const count = r.end - r.start;
        return (
          <div role="alertdialog" aria-label="Видалити розділ?" className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl bg-rose-50 px-4 py-3 text-[14px] text-rose-900 ring-1 ring-rose-200">
            <span className="min-w-0 flex-1">Видалити «{label}»{count > 1 ? ` разом із блоками (${count})` : ""}? Це не можна скасувати.</span>
            <button type="button" onClick={() => { onChange(removeSection(blocks, delSec)); setActiveSec(Math.max(0, delSec - 1)); setOpenId(null); setDelSec(null); }} className={`${SMALL_BTN} border-rose-200 text-rose-700 hover:bg-rose-100`}>Так, видалити</button>
            <button type="button" onClick={() => setDelSec(null)} className={SMALL_BTN}>Ні</button>
          </div>
        );
      })()}
      {livePublished && (
        <p role="note" className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-[14px] leading-relaxed text-amber-900 ring-1 ring-amber-200">
          Гайд уже опубліковано. Якщо переставити чи видалити блоки, збережені відповіді читачів можуть змішатися. Нові блоки краще додавати в кінець розділу.
        </p>
      )}
      {notice && (
        <div role="alert" className="mt-3 flex items-start justify-between gap-3 rounded-2xl bg-rose-50 px-4 py-3 text-[14px] text-rose-900 ring-1 ring-rose-200">
          <span>{notice}</span>
          <button type="button" aria-label="Закрити повідомлення" onClick={() => setNotice(null)} className="shrink-0 text-[18px] leading-none">×</button>
        </div>
      )}
    </section>
  );

  return (
    <div ref={rootRef} role="dialog" aria-modal="true" aria-label="Конструктор гайду" tabIndex={-1} className="fixed inset-0 z-[998] overflow-y-auto bg-[#f4f0ff] outline-none">
      {exitAsk && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#1f1b4d]/40 p-4" onKeyDown={(e) => { if (e.key === "Escape") setExitAsk(null); }}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="gb-exit-title" aria-describedby="gb-exit-text" className="w-full max-w-[480px] rounded-[24px] border border-[#e4def9] bg-white p-6 shadow-[0_24px_60px_-24px_rgba(70,40,170,0.6)]">
            {exitAsk === "ask" ? (
              <>
                <h2 id="gb-exit-title" className="text-[20px] font-semibold text-[#1f1b4d]">Вийти без збереження?</h2>
                <p id="gb-exit-text" className="mt-2 text-[15px] leading-relaxed text-black/70">У гайді є незаповнені блоки: {badCount}. Якщо вийти зараз, зміни, зроблені в конструкторі, не збережуться.</p>
                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  <button type="button" autoFocus onClick={() => { setExitAsk(null); onDiscard(); }} className="min-h-[44px] flex-1 rounded-xl bg-rose-600 px-5 text-[14px] font-semibold text-white transition hover:bg-rose-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2">Так, вийти</button>
                  <button type="button" onClick={() => setExitAsk("partial")} className={`${SMALL_BTN} flex-1`}>Ні</button>
                </div>
              </>
            ) : (
              <>
                <h2 id="gb-exit-title" className="text-[20px] font-semibold text-[#1f1b4d]">Зберегти лише заповнене?</h2>
                <p id="gb-exit-text" className="mt-2 text-[15px] leading-relaxed text-black/70">Заповнені блоки збережуться, а незаповнені ({badCount}) буде видалено з гайду.</p>
                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  <button type="button" autoFocus onClick={() => void savePartial()} className="min-h-[44px] flex-1 rounded-xl bg-gradient-to-r from-[#5232f4] to-[#774eff] px-5 text-[14px] font-semibold text-white transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#582edd] focus-visible:ring-offset-2">Зберегти й вийти</button>
                  <button type="button" onClick={() => setExitAsk(null)} className={`${SMALL_BTN} flex-1`}>Продовжити редагування</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      <header className="sticky top-0 z-10 border-b border-[#e4def9] bg-white/90 backdrop-blur">
        <div className={`mx-auto flex w-full flex-wrap items-center gap-3 px-4 py-3 sm:px-6 lg:px-8 ${mode === "edit" ? "max-w-[1320px]" : "max-w-[1100px]"}`}>
          <button type="button" onClick={back} aria-disabled={saving} title={locked ? "Є незаповнені блоки: можна вийти без збереження або зберегти лише заповнене" : "Зберегти гайд і повернутися"} className={`${SMALL_BTN} ${saving ? "opacity-50" : ""}`}>
            <span aria-hidden="true" className="mr-1.5">←</span> До гайду
          </button>
          <div className="min-w-0 flex-1">
            <div className="text-[16px] font-semibold leading-tight text-[#1f1b4d]">Конструктор гайду</div>
            <div className="truncate text-[13px] text-black/60">{title.trim() || "Гайд без назви"}</div>
          </div>
          <a href="https://youtu.be/ZLYGMK7Dz6o" target="_blank" rel="noopener noreferrer" aria-label="Відеоінструкція: як користуватися конструктором (відкриється в новій вкладці)" className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[#d9d4f5] bg-[#f3efff] px-3 text-[14px] font-semibold text-[#4a2fd0] transition hover:bg-[#ece9fe] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50 sm:px-4">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M10.5 9.3v5.4l4.5-2.7-4.5-2.7Z" /></svg>
            <span className="hidden sm:inline">Відеоінструкція</span>
          </a>
          <div className="flex w-full items-center gap-3 sm:w-auto">
            <div role="group" aria-label="Режим" className="flex flex-1 rounded-xl bg-[#ece9fe] p-1 sm:flex-none">
              {([["edit", "Редагувати"], ["preview", "Перегляд"]] as const).map(([id, label]) => (
                <button key={id} type="button" aria-pressed={mode === id} onClick={() => setMode(id)} className={`min-h-[44px] flex-1 rounded-lg px-4 text-[14px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50 sm:flex-none ${mode === id ? "bg-white text-[#4a2fd0] shadow-sm" : "text-[#4a2fd0]/80 hover:text-[#4a2fd0]"}`}>
                  {label}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => void leave()} aria-disabled={locked || saving} title={locked ? "Спершу заповніть усі додані блоки" : "Зберегти гайд і повернутися"} className={`min-h-[44px] flex-1 rounded-xl bg-gradient-to-r from-[#5232f4] to-[#774eff] px-5 text-[14px] font-semibold text-white transition focus:outline-none sm:flex-none focus-visible:ring-2 focus-visible:ring-[#582edd] focus-visible:ring-offset-2 ${locked || saving ? "opacity-50" : "hover:opacity-90"}`}>
              {saving ? "Зберігаємо…" : <>Зберегти<span className="hidden sm:inline"> й вийти</span></>}
            </button>
          </div>
        </div>
      </header>

      <div className={`mx-auto w-full px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-6 ${mode === "edit" ? "grid max-w-[1320px] gap-6 lg:grid-cols-[minmax(0,1fr)_380px]" : "max-w-[1100px]"}`}>
        <div className="min-w-0">
        {overview}
        <main className="mt-5 min-w-0">
          {mode === "preview" ? (
            <GuidePreview title={title.trim() || "Гайд без назви"} blocks={blocks.map((b) => (b.type === "media" ? { ...b, url: shownUrl(b.url) } : b))} guideId={`preview-${contentId}`} allowDownload={allowDownload} />
          ) : (
            <>
              {blocks.length === 0 && <div className="mb-4 rounded-[22px] border border-dashed border-[#cfc6f5] bg-white/60 p-8 text-center text-[15px] text-black/60">Гайд поки порожній. Додайте перший розділ кнопкою «+ Розділ» зверху.</div>}
              <ol className="flex flex-col gap-3">
                {blocks.map((block, i) => ({ block, i })).filter(({ i }) => i >= range.start && i < range.end).map(({ block, i }) => {
                  const info = blockInfo(block.type);
                  const open = openId === block.id;
                  const isHeading = block.type === "heading";
                  const probs = blockProblems(block, price);
                  const summary = summaryOf(block);
                  return (
                    <li key={block.id}>
                      <section id={`gb-${block.id}`} className={`rounded-[22px] border bg-white transition ${open ? "border-[#bfb3f5] shadow-[0_16px_34px_-22px_rgba(70,40,170,0.6)]" : "border-[#e4def9]"} ${isHeading ? "border-l-4 border-l-[#5b3df5]" : ""}`}>
                        <div className="flex items-center gap-2 p-3 sm:p-4">
                          <button type="button" aria-expanded={open} onClick={() => setOpenId(open ? null : block.id)} className="flex min-h-[44px] min-w-0 flex-1 items-center gap-3 rounded-xl text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50">
                            <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ece9fe] text-[#5b3df5]"><Icon name={ICONS[block.type]} size={18} /></span>
                            <span className="min-w-0">
                              <span className="block text-[13px] font-medium text-[#4a2fd0]">{isHeading ? `Розділ ${sec + 1}` : info.label}</span>
                              <span className={`block truncate text-[15px] ${summary ? "font-semibold text-[#1f1b4d]" : "text-black/60"}`}>{summary || "Ще порожньо"}</span>
                            </span>
                          </button>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <button type="button" aria-label={isHeading ? "Розділ раніше" : "Вгору"} disabled={isHeading ? sec === 0 : i <= range.start + (range.heading ? 1 : 0)} onClick={() => { if (isHeading) { onChange(moveSection(blocks, sec, -1)); setActiveSec(sec - 1); } else onChange(move(blocks, i, -1)); }} className={SMALL_BTN}><span aria-hidden="true">{isHeading ? "←" : "↑"}</span></button>
                            <button type="button" aria-label={isHeading ? "Розділ пізніше" : "Вниз"} disabled={isHeading ? sec === secs.length - 1 : i >= range.end - 1} onClick={() => { if (isHeading) { onChange(moveSection(blocks, sec, 1)); setActiveSec(sec + 1); } else onChange(move(blocks, i, 1)); }} className={SMALL_BTN}><span aria-hidden="true">{isHeading ? "→" : "↓"}</span></button>
                          </div>
                        </div>
                        {open && (
                          <div className="border-t border-[#efeafc] p-4 sm:p-5">
                            <Editor block={block} set={(p) => patch(i, p)} authorId={authorId} contentId={contentId} giftOptions={giftOptions} price={price} shownUrl={shownUrl} onUploaded={onImageUploaded} />
                            {showHints && probs.length > 0 && (
                              <ul role="status" className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-[14px] text-rose-800">
                                {probs.map((p) => <li key={p}>{p}</li>)}
                              </ul>
                            )}
                            <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-[#efeafc] pt-4">
                              {!isHeading && <button type="button" disabled={full} onClick={() => { const c = duplicate(block); onChange(insertAt(blocks, i + 1, c)); setOpenId(c.id); scrollTo.current = c.id; }} className={SMALL_BTN}>Дублювати</button>}
                              {confirmDel === block.id ? (
                                <>
                                  <span className="text-[14px] text-black/70">{isHeading ? "Видалити розділ разом з усіма його блоками?" : "Видалити цей блок?"}</span>
                                  <button type="button" onClick={() => { if (isHeading) { onChange(removeSection(blocks, sec)); setActiveSec(Math.max(0, sec - 1)); } else onChange(removeAt(blocks, i)); setConfirmDel(null); setOpenId(null); }} className={`${SMALL_BTN} border-rose-200 text-rose-700 hover:bg-rose-50`}>Так, видалити</button>
                                  <button type="button" onClick={() => setConfirmDel(null)} className={SMALL_BTN}>Ні</button>
                                </>
                              ) : (
                                <button type="button" onClick={() => setConfirmDel(block.id)} className={`${SMALL_BTN} text-rose-700`}>{isHeading ? "Видалити розділ" : "Видалити"}</button>
                              )}
                            </div>
                          </div>
                        )}
                      </section>
                    </li>
                  );
                })}
              </ol>
              {full && <p className="mt-3 text-[13px] text-black/60">Досягнуто ліміт: {GUIDE_BUILDER_MAX_BLOCKS} блоків.</p>}
            </>
          )}
        </main>
        </div>

        {mode === "edit" && <aside id="gb-panel" className="lg:sticky lg:top-[88px] lg:self-start">{panel}</aside>}
        {mode === "edit" && (
          <button type="button" onClick={() => document.getElementById("gb-panel")?.scrollIntoView({ behavior: "smooth", block: "start" })} className="fixed bottom-4 left-1/2 z-20 flex min-h-[52px] -translate-x-1/2 items-center gap-2 rounded-full bg-gradient-to-r from-[#5232f4] to-[#774eff] px-6 text-[15px] font-semibold text-white shadow-lg lg:hidden">
            <span aria-hidden="true" className="text-[20px] leading-none">+</span> Додати блок
          </button>
        )}
      </div>
    </div>
  );
}
