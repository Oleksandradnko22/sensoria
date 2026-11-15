// Author cabinet: guided editor for the public «Про мене» page. Six
// collapsible sections (all of them required, each with min/max counters),
// examples on demand, a live preview that uses the SAME component as the
// public page, a local draft that survives reloads and an explicit, validated
// save. Hiding an optional block keeps its content. Nothing is pre-filled:
// suggestions are inserted only by the author's click. Education,
// certificates and experience are edited in the block below this one.
import { useEffect, useRef, useState } from "react";
import { DEFAULT_OFFER_ICON, DEFAULT_PRINCIPLE_ICONS, DEFAULT_STEP_ICONS, STORY_ICONS, iconPath, type StoryIconId } from "../../utils/storyIcons";
import { fetchAuthorStory, saveAuthorStory, uploadStoryPortrait } from "../../lib/authorStory";
import { parseVideoUrl } from "../../utils/authorPosts";
import {
  EMPTY_STORY,
  STORY_LIMITS as L,
  STORY_MIN as M,
  missingParts,
  type SectionId,
  normalizeStory,
  validateStory,
  paragraphs,
  introLines,
  INTRO_MAX_LINES,
  type AuthorStory,
  type StoryStep,
} from "../../utils/authorStory";

type Props = { authorId: string };

const input = "w-full rounded-xl bg-[#faf9ff] px-4 py-3 text-[15px] ring-1 ring-[#e3def9] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#7c5cf0]";
const inputW = "w-full rounded-xl bg-white px-4 py-3 text-[15px] ring-1 ring-[#b9adf7] focus:outline-none focus:ring-2 focus:ring-[#7c5cf0]";
const label = "text-[13px] font-semibold text-[#2d2a5c] mb-2";
const hint = "text-[12px] text-black/45 mt-1.5";
const ghost = "inline-flex min-h-[40px] items-center rounded-xl bg-white px-4 text-[13px] font-semibold text-[#4338ca] ring-1 ring-[#e3def9] hover:ring-[#c9bff7] hover:bg-[#faf9ff] transition disabled:opacity-50";
const draftKey = (id: string) => `sensoria:about-draft:${id}`;
const sig = (s: AuthorStory) => JSON.stringify(normalizeStory(s));

function Counter({ n, max, min }: { n: number; max: number; min?: number }) {
  const low = min !== undefined && n < min;
  return (
    <span className={`text-[12px] ${low || n >= max ? "text-amber-600" : "text-black/40"}`}>
      {n}/{max}{min !== undefined ? ` · мін. ${min}` : ""}
    </span>
  );
}

// top-level (not nested) so inputs inside keep focus while typing
function Section({
  n, title, required, filled, invalid, hidden, onHiddenChange, status, children,
}: {
  n: number; title: string; required?: boolean; filled: boolean; invalid?: boolean;
  hidden?: boolean; onHiddenChange?: (hidden: boolean) => void; status: string | null; children: React.ReactNode;
}) {
  return (
    <div className={`rounded-[26px] bg-white shadow-[0_14px_36px_-30px_rgba(60,50,140,0.55)] ${invalid ? "ring-2 ring-rose-400" : "ring-1 ring-[#ece8fb]"}`}>
      <div className="w-full flex items-start gap-3 px-5 pt-5 sm:px-7 sm:pt-7 text-left">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[15px] font-bold ${filled ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100" : "bg-gradient-to-br from-[#3b6df0] to-[#7c5cf0] text-white"}`}>{filled ? "✓" : n}</span>
        <span className="flex-1 min-w-0">
          <span className="block text-[18px] font-bold leading-tight text-[#12172b]">{title}</span>
          <span className="mt-0.5 block text-[13px] text-black/55">{required ? "Обов’язково" : hidden ? "Необов’язково · приховано" : "Необов’язково"}</span>
          {invalid && status && <span className="mt-1.5 inline-block rounded-lg bg-rose-50 px-2.5 py-1 text-[12px] font-medium text-rose-700">{status}</span>}
        </span>
              </div>
      {(
        <div className="px-5 pb-6 pt-4 sm:px-7 sm:pb-7 flex flex-col gap-4">
          {onHiddenChange && (
            <label className="flex items-center gap-2 text-[13px] text-black/65 cursor-pointer pt-3">
              <input type="checkbox" checked={!hidden} onChange={(e) => onHiddenChange(!e.target.checked)} className="w-4 h-4 accent-[#4338ca]" />
              Показувати на сторінці
              {hidden && <span className="text-[12px] text-black/40">(текст збережено)</span>}
            </label>
          )}
          <div className={onHiddenChange ? "" : "pt-3"}>{children}</div>
        </div>
      )}
    </div>
  );
}

// a short list of lines (offers / not offers) with optional click-to-add examples
function LineList({ items, onChange, max, placeholder, min, invalid, need = 0 }: { items: string[]; onChange: (v: string[]) => void; max: number; placeholder: string; min?: number; invalid?: boolean; need?: number }) {
  const rows = [...items, ...Array.from({ length: Math.max(0, max - items.length) }, () => "")].slice(0, max);
  return (
    <div className="flex flex-col gap-2">
      {rows.map((t, i) => (
        <div key={i}>
          <input value={t} maxLength={L.limit} onChange={(e) => onChange(rows.map((x, j) => (j === i ? e.target.value : x)))} className={input} placeholder={i === 0 ? placeholder : ""} aria-label={`${placeholder} ${i + 1}`} aria-invalid={invalid && (i < need ? t.trim().length < (min ?? 1) : !!t.trim() && t.trim().length < (min ?? 1)) ? true : undefined} />
          {t && <div className="text-right mt-0.5"><Counter n={t.length} max={L.limit} min={min} /></div>}
        </div>
      ))}
    </div>
  );
}


function Glyph({ d, size = 20 }: { d: string; size?: number }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

// the author picks an icon from the curated set; "" = the default for this position
function IconPicker({ value, fallback, onChange, label: aria }: { value: string; fallback: StoryIconId; onChange: (id: string) => void; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative shrink-0">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={`${aria}: обрати іконку`} title="Обрати іконку" className="w-11 h-11 rounded-full bg-[#f1f0fb] text-[#4338ca] flex items-center justify-center hover:bg-[#e7e5f8] focus-visible:outline-none focus-visible:ring-2 ring-[#4338ca]">
        <Glyph d={iconPath(value, fallback)} />
      </button>
      {open && (
        <div role="listbox" aria-label="Іконки" className="absolute left-0 top-full z-30 mt-2 grid grid-cols-6 sm:grid-cols-8 gap-1.5 rounded-2xl bg-white p-2 w-[300px] max-w-[80vw] ring-1 ring-[#e3def9] shadow-[0_18px_40px_-18px_rgba(60,50,140,0.45)]">
          {STORY_ICONS.map((ic) => (
            <button key={ic.id} type="button" role="option" aria-selected={value === ic.id} title={ic.label} aria-label={ic.label} onClick={() => { onChange(ic.id); setOpen(false); }} className={`w-9 h-9 rounded-lg flex items-center justify-center ${value === ic.id ? "bg-[#4338ca] text-white" : "text-black/65 hover:bg-black/5"}`}>
              <Glyph d={ic.path} size={18} />
            </button>
          ))}
          <button type="button" onClick={() => { onChange(""); setOpen(false); }} className="col-span-full text-[12px] text-[#4338ca] hover:underline text-left px-1 pt-1">Стандартна іконка</button>
        </div>
      )}
    </div>
  );
}

// rows of «icon + text» (principles, expectations); text and icons are kept as aligned arrays
function IconItems({
  items, icons, onChange, max, textMax, fallback, placeholder, addLabel, min, invalid, need = 0, white = false,
}: {
  min?: number; invalid?: boolean; need?: number; white?: boolean;
  items: string[]; icons: string[]; onChange: (items: string[], icons: string[]) => void; max: number; textMax: number;
  fallback: (i: number) => StoryIconId; placeholder: string; addLabel: string;
}) {
  const ics = items.map((_, i) => icons[i] ?? "");
  const full = items.filter((t) => t.trim()).length >= max || items.length >= max;
  return (
    <div className="flex flex-col gap-2.5">
      {items.map((t, i) => (
        <div key={i} className="flex gap-2.5 items-start">
          <IconPicker value={ics[i]} fallback={fallback(i)} label={`${placeholder} ${i + 1}`} onChange={(id) => onChange(items, ics.map((x, j) => (j === i ? id : x)))} />
          <div className="flex-1 min-w-0">
            <input value={t} maxLength={textMax} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)), ics)} className={white ? inputW : input} placeholder={placeholder} aria-label={`${placeholder} ${i + 1}`} aria-invalid={invalid && (need > 0 ? t.trim().length < (min ?? 1) : !!t.trim() && t.trim().length < (min ?? 1)) ? true : undefined} />
            <div className="flex justify-between mt-1">
              <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i), ics.filter((_, j) => j !== i))} className="text-[12px] text-red-500 hover:underline">Видалити</button>
              <Counter n={t.length} max={textMax} min={min} />
            </div>
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-2 items-center">
        <button type="button" disabled={full} aria-invalid={invalid && items.length < need ? true : undefined} onClick={() => onChange([...items, ""], [...ics, ""])} className={ghost}>{addLabel} ({items.length} з {max})</button>
      </div>
    </div>
  );
}

export default function AuthorStoryEditor({ authorId }: Props) {
  const [portraitErr, setPortraitErr] = useState<string | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [s, setS] = useState<AuthorStory>(EMPTY_STORY);
  const saved = useRef<string>(sig(EMPTY_STORY));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  // after a save that did not pass: fields still missing are outlined in red
  const [tried, setTried] = useState(false);
  const [restored, setRestored] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [extraStepRows, setExtraStepRows] = useState(0);

  useEffect(() => {
    let off = false;
    fetchAuthorStory(authorId).then((r) => {
      if (off) return;
      saved.current = sig(r);
      let next = r;
      try {
        const raw = window.localStorage.getItem(draftKey(authorId));
        if (raw) {
          const d = normalizeStory(JSON.parse(raw));
          if (sig(d) !== saved.current) {
            next = d;
            setRestored(true);
          }
        }
      } catch {
        /* storage unavailable — no draft, no problem */
      }
      setS(next);
      setLoading(false);
    });
    return () => {
      off = true;
    };
  }, [authorId]);

  const dirty = !loading && sig(s) !== saved.current;

  // local draft (debounced); cleared when it equals the saved version
  useEffect(() => {
    if (loading) return;
    const t = window.setTimeout(() => {
      try {
        if (dirty) window.localStorage.setItem(draftKey(authorId), JSON.stringify(s));
        else window.localStorage.removeItem(draftKey(authorId));
      } catch {
        /* ignore */
      }
    }, 500);
    return () => window.clearTimeout(t);
  }, [s, dirty, loading, authorId]);

  const set = <K extends keyof AuthorStory>(k: K, v: AuthorStory[K]) => {
    setJustSaved(false);
    setS((p) => ({ ...p, [k]: v }));
  };
  // three rows to start with; «Додати етап» adds more, up to the limit
  const stepRows = Math.min(L.steps, Math.max(3, s.steps.length, extraStepRows));
  // a step row is outlined when it is half filled, or when there are too few full steps and it is among the first ones
  const fullStep = (x: StoryStep) => x.title.trim().length >= M.stepTitle && x.text.trim().length >= M.stepText;
  const stepBad = (_i: number, x: StoryStep) => !fullStep(x) && !!(x.title.trim() || x.text.trim());
  const fullFaq = (x: { q: string; a: string }) => x.q.trim().length >= M.faqQ && x.a.trim().length >= M.faqA;
  const faqBad = (_i: number, x: { q: string; a: string }) => !fullFaq(x) && !!(x.q.trim() || x.a.trim());
  const steps: StoryStep[] = [...s.steps, ...Array.from({ length: Math.max(0, stepRows - s.steps.length) }, () => ({ title: "", text: "", icon: "" }))].slice(0, stepRows);
  const setStep = (i: number, patch: Partial<StoryStep>) => set("steps", steps.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const mediaOf = (kind: "video") => (s.media?.kind === kind ? s.media : { kind, url: "", caption: s.media?.caption ?? "", duration: s.media?.duration ?? "" });


  const upload = async (kind: string, file: File | undefined, run: (f: File) => Promise<void>) => {
    if (!file) return;
    setUploading(kind);
    setErrors([]);
    try {
      await run(file);
    } catch (e) {
      setErrors([e instanceof Error ? e.message : "Не вдалося завантажити файл."]);
    } finally {
      setUploading(null);
    }
  };

  const save = async () => {
    const problems = [...validateStory(s), ...Object.entries(missingParts(s, false)).flatMap(([, v]) => v.map((x) => `Потрібно: ${x}.`))];
    if (problems.length) {
      // no list of problems: open the first section that needs attention, its fields are outlined in red
      setTried(true);
      setErrors(["Заповніть поля, позначені червоним."]);
      window.setTimeout(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 80);
      return;
    }
    setErrors([]);
    setTried(false);
    if (!dirty) { setJustSaved(true); return; } // nothing changed and everything is filled
    setSaving(true);
    try {
      await saveAuthorStory(authorId, s);
      saved.current = sig(s);
      setS(normalizeStory(s));
      setRestored(false);
      setJustSaved(true);
      try {
        window.localStorage.removeItem(draftKey(authorId));
      } catch {
        /* ignore */
      }
    } catch (e) {
      const m = (e as { message?: string } | null)?.message ?? "";
      setErrors([/^Посилання/.test(m) ? m : e instanceof Error ? e.message : "Не вдалося зберегти."]);
    } finally {
      setSaving(false);
    }
  };

  const discardDraft = () => {
    fetchAuthorStory(authorId).then((r) => {
      saved.current = sig(r);
      setS(r);
      setRestored(false);
      setErrors([]);
      try {
        window.localStorage.removeItem(draftKey(authorId));
      } catch {
        /* ignore */
      }
    });
  };

  if (loading) return null;

  // every personalised block is required: the status lists exactly what is still missing
  const missing = missingParts(s, false);
  const sec = (id: SectionId) => ({
    filled: missing[id].length === 0,
    invalid: tried && missing[id].length > 0,
    status: missing[id].length ? `Потрібно заповнити: ${missing[id].join("; ")}.` : null,
  });

  return (
    <section className="flex flex-col gap-5" aria-label="Сторінка «Про мене»">
      {cropFile && (
        <PortraitCropper
          file={cropFile}
          onCancel={() => setCropFile(null)}
          onDone={(f) => { setCropFile(null); void upload("portrait", f, async (file) => set("portraitUrl", await uploadStoryPortrait(authorId, file))); }}
        />
      )}
      {restored && dirty && <p className="text-[13px] text-black/55 bg-[#f4f5ff] rounded-xl px-4 py-2.5">Відновлено вашу незбережену чернетку. Натисніть «Зберегти зміни» внизу, щоб опублікувати.</p>}
      {errors.length > 0 && <p role="alert" className="text-[13px] font-medium text-rose-700">{errors[0]}</p>}

      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-5">
          <Section n={1} title="Знайомство" required {...sec("intro")}>
            <div className="flex flex-col gap-4">
              <div>
                <div className={label}>Портрет</div>
                <div className="flex flex-wrap items-start gap-4">
                  <div className="relative aspect-[4/5] w-[140px] shrink-0 overflow-hidden rounded-2xl bg-[#f6f5fb] ring-1 ring-[#e3def9]">
                    {s.portraitUrl ? <img src={s.portraitUrl} alt="" className="absolute inset-0 h-full w-full object-cover object-[50%_25%]" /> : <span className="absolute inset-0 flex items-center justify-center px-3 text-center text-[12px] text-[#4338ca]/50">4:5</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] text-black/60">Окреме фото для цієї сторінки, вертикальне <b className="text-[#12172b]">4:5</b>. Після вибору ви обріжете його в рамці. Щонайменше 800 × 1000 px, не більше 6000 px по стороні й 15 МБ. Справжнє фото, обличчя у верхній третині. JPG, PNG або WebP.</div>
                    <div className="mt-3 flex items-center gap-3 flex-wrap">
                      <label aria-invalid={tried && !s.portraitUrl ? true : undefined} className="min-h-[40px] inline-flex items-center rounded-xl bg-white px-4 text-[13px] font-medium ring-1 ring-[#e3def9] hover:ring-[#c9bff7] cursor-pointer">
                        {uploading === "portrait" ? "Завантажуємо…" : s.portraitUrl ? "Замінити портрет" : "Завантажити портрет"}
                        <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; void portraitSizeProblem(f).then((bad) => { if (bad) { setPortraitErr(bad); return; } setPortraitErr(null); setCropFile(f); }); }} />
                      </label>
                      {s.portraitUrl && <button type="button" onClick={() => set("portraitUrl", "")} className="text-[13px] text-black/50 hover:text-black">Прибрати</button>}
                    </div>
                    {portraitErr && <p role="alert" className="mt-2 text-[12px] font-medium text-rose-700">{portraitErr}</p>}
                  </div>
                </div>
              </div>
              <div>
                <div className="flex justify-between"><div className={label}>Про вас (до двох абзаців, має вміститися біля фото)</div><Counter n={s.intro.length} max={L.intro} min={M.intro} /></div>
                <textarea value={s.intro} maxLength={L.intro} rows={6} onChange={(e) => set("intro", e.target.value)} aria-invalid={tried && (s.intro.trim().length < M.intro || paragraphs(s.intro).length > L.introParagraphs || introLines(s.tagline, s.intro) > INTRO_MAX_LINES) ? true : undefined} className={`${input} resize-none`} placeholder="Що привело вас у цю сферу, що для вас важливо, на що ви звертаєте увагу в людях." />
                <div className={`text-[12px] mt-1.5 ${paragraphs(s.intro).length > L.introParagraphs ? "text-red-500" : "text-black/45"}`}>
                  Абзаців: {paragraphs(s.intro).length} з {L.introParagraphs}. Новий абзац — після порожнього рядка.
                </div>
                <div className="mt-2" aria-live="polite">
                  <div className="flex justify-between text-[12px]">
                    <span className={introLines(s.tagline, s.intro) > INTRO_MAX_LINES ? "text-red-500" : "text-black/45"}>
                      {introLines(s.tagline, s.intro) > INTRO_MAX_LINES ? "Не вміщується біля фото: скоротіть текст" : "Вміщується біля фото"}
                    </span>
                    <span className="text-black/40 tabular-nums">{Math.min(99, introLines(s.tagline, s.intro))} / {INTRO_MAX_LINES} рядків</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-black/[0.07] overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${introLines(s.tagline, s.intro) > INTRO_MAX_LINES ? "bg-red-400" : "bg-[#4338ca]/60"}`} style={{ width: `${Math.min(100, (introLines(s.tagline, s.intro) / INTRO_MAX_LINES) * 100)}%` }} />
                  </div>
                </div>
              </div>
            </div>
          </Section>

          <Section n={2} title="Відеознайомство" {...sec("media")} filled={!!s.media?.url && !!parseVideoUrl(s.media.url)}>
            <div className="flex flex-col gap-4">
              <p className="text-[14px] text-black/60">Коротке відео, де ви самі розповідаєте, хто ви й як працюєте. За бажанням — без нього блок просто не показується.</p>
              {s.media?.kind === "audio" && (
                <div className="flex flex-wrap items-center gap-3 rounded-xl bg-amber-50 px-4 py-3 text-[13px] text-amber-900 ring-1 ring-amber-100">
                  Зараз на сторінці аудіо. Аудіо більше не додається: вставте посилання на відео або приберіть запис.
                  <button type="button" onClick={() => set("media", null)} className="font-semibold underline">Прибрати аудіо</button>
                </div>
              )}
              <div>
                <div className={label}>Посилання на відео YouTube або Vimeo</div>
                <input value={s.media?.kind === "video" ? s.media.url : ""} onChange={(e) => { const url = e.target.value.trim(); set("media", url ? { ...mediaOf("video"), url } : null); }} className={input} placeholder="https://youtu.be/…" aria-label="Посилання на відео" aria-invalid={tried && !!s.media?.url && !parseVideoUrl(s.media.url) ? true : undefined} />
                {s.media?.url && <div className={`mt-1.5 text-[12px] ${parseVideoUrl(s.media.url) ? "text-emerald-700" : "text-rose-700"}`}>{parseVideoUrl(s.media.url) ? "Відео розпізнано: на сторінці з’явиться плеєр." : "Посилання не розпізнано: підійде YouTube або Vimeo."}</div>}
                <div className={hint}>Можна відео «за посиланням» (не публічне). Відтворюється прямо на сторінці.</div>
              </div>
              {s.media?.kind === "video" && s.media.url && (
                <div className="grid gap-4 sm:grid-cols-[140px_minmax(0,1fr)]">
                  <div>
                    <div className={label}>Тривалість</div>
                    <input value={s.media.duration} maxLength={8} onChange={(e) => set("media", { ...s.media!, duration: e.target.value.replace(/[^\d:]/g, "") })} className={input} placeholder="3:20" aria-label="Тривалість, хвилини:секунди" />
                  </div>
                  <div>
                    <div className="flex justify-between"><div className={label}>Короткий вступ поруч із відео</div><Counter n={s.media.caption.length} max={L.caption} /></div>
                    <input value={s.media.caption} maxLength={L.caption} onChange={(e) => set("media", { ...s.media!, caption: e.target.value })} className={input} placeholder="Про що це відео" />
                  </div>
                </div>
              )}
            </div>
          </Section>

          <Section n={3} title="Мій підхід" required {...sec("approach")}>
            <div className="flex flex-col gap-5">
              <p className="text-[13px] text-black/55">Блок «Підхід і напрями» збирається з того, що ви заповните; порожнє не показується. Усе, включно з іконками, ви обираєте самі.</p>
              <div>
                <div className="flex justify-between"><div className={label}>Заголовок</div><Counter n={s.viewpoint.length} max={L.viewpoint} min={M.viewpoint} /></div>
                <textarea value={s.viewpoint} maxLength={L.viewpoint} rows={2} onChange={(e) => set("viewpoint", e.target.value)} aria-invalid={tried && s.viewpoint.trim().length < M.viewpoint ? true : undefined} className={`${input} resize-none`} placeholder="Ваша головна думка про роботу з емоціями." />
                <div className={hint}>Показується найкрупніше, до {L.viewpoint} символів.</div>
              </div>
              <div>
                <div className="flex justify-between"><div className={label}>Підзаголовок</div><Counter n={s.viewpointNote.length} max={L.viewpointNote} min={M.viewpointNote} /></div>
                <textarea value={s.viewpointNote} maxLength={L.viewpointNote} rows={3} onChange={(e) => set("viewpointNote", e.target.value)} aria-invalid={tried && s.viewpointNote.trim().length < M.viewpointNote ? true : undefined} className={`${input} resize-none`} placeholder="Пояснення під заголовком." />
                <div className={hint}>Стоїть під заголовком, до {L.viewpointNote} символів. Без заголовка не показується.</div>
              </div>
              <div className="flex flex-col gap-3">
                <div className={label}>Як відбувається робота <span className="font-normal text-black/45">(необов’язково, до {L.steps} етапів)</span></div>
                {steps.map((x, i) => (
                  <div key={i} className="rounded-2xl bg-white p-4 ring-1 ring-[#ece8fb] flex gap-2.5 items-start">
                    <IconPicker value={x.icon ?? ""} fallback={DEFAULT_STEP_ICONS[i % DEFAULT_STEP_ICONS.length]} label={`Етап ${i + 1}`} onChange={(id) => setStep(i, { icon: id })} />
                    <div className="flex-1 min-w-0 flex flex-col gap-2">
                      <div>
                        <input value={x.title} maxLength={L.stepTitle} onChange={(e) => setStep(i, { title: e.target.value })} aria-invalid={tried && stepBad(i, x) && x.title.trim().length < M.stepTitle ? true : undefined} className={inputW} placeholder={`Назва етапу ${i + 1}`} aria-label={`Етап ${i + 1}: назва`} />
                        <div className="text-right mt-0.5"><Counter n={x.title.length} max={L.stepTitle} min={M.stepTitle} /></div>
                      </div>
                      <div>
                        <textarea value={x.text} maxLength={L.stepText} rows={2} onChange={(e) => setStep(i, { text: e.target.value })} aria-invalid={tried && stepBad(i, x) && x.text.trim().length < M.stepText ? true : undefined} className={`${inputW} resize-none`} placeholder="Коротко: що відбувається на цьому етапі." aria-label={`Етап ${i + 1}: пояснення`} />
                        <div className="text-right mt-0.5"><Counter n={x.text.length} max={L.stepText} min={M.stepText} /></div>
                      </div>
                      {i >= 3 && !x.title && !x.text && (
                        <button type="button" className="self-start text-[12px] text-red-500 hover:underline" onClick={() => { setExtraStepRows(steps.length - 1); set("steps", steps.filter((_, j) => j !== i)); }}>Прибрати етап</button>
                      )}
                    </div>
                  </div>
                ))}
                {steps.length < L.steps && (
                  <button type="button" className={`${ghost} self-start`} onClick={() => setExtraStepRows(steps.length + 1)}>
                    Додати етап ({steps.length} з {L.steps})
                  </button>
                )}
              </div>
            </div>
          </Section>

          <Section n={4} title="Що для мене важливо" required {...sec("principles")}>
            <div className="flex flex-col gap-3">
              <p className="text-[13px] text-black/55">Від {M.principles} до {L.principles} принципів, кожен зі своєю іконкою; текст від {M.principle} до {L.principle} символів. Пишіть лише те, що справді про вас.</p>
              <IconItems
                items={s.principles}
                icons={s.principleIcons}
                onChange={(t, ic) => { setJustSaved(false); setS((p) => ({ ...p, principles: t, principleIcons: ic })); }}
                max={L.principles}
                textMax={L.principle}
                fallback={(i) => DEFAULT_PRINCIPLE_ICONS[i % DEFAULT_PRINCIPLE_ICONS.length]}
                placeholder="Принцип"
                min={M.principle}
                invalid={tried && missing.principles.length > 0}
                need={M.principles}
                addLabel="Додати принцип"
              />
            </div>
          </Section>

          <Section n={5} title="Чого очікувати і межі" {...sec("limits")}>
            <div className="flex flex-col gap-5">
              <p className="text-[13px] text-black/55">Допомагає учаснику вирішити, чи це для нього.</p>
              <div>
                <div className={label}>Чого очікувати від моїх матеріалів (до {L.limits} пунктів, кожен від {M.offer} до {L.limit} символів)</div>
                <IconItems
                  items={s.offers}
                  icons={s.offerIcons}
                  onChange={(t, ic) => { setJustSaved(false); setS((p) => ({ ...p, offers: t, offerIcons: ic })); }}
                  max={L.limits}
                  textMax={L.limit}
                  fallback={() => DEFAULT_OFFER_ICON}
                  placeholder="Пункт"
                  white
                  min={M.offer}
                  invalid={tried}
                  addLabel="Додати пункт"
                />
              </div>
              <div>
                <div className={label}>Межі моєї роботи (до {L.limits} пунктів, кожен від {M.notOffer} до {L.limit} символів)</div>
                <LineList items={s.notOffers} onChange={(v) => set("notOffers", v)} max={L.limits} placeholder="Межа" min={M.notOffer} invalid={tried} />
                <div className={hint}>Не пишіть про діагнози чи лікування як про те, що ви надаєте.</div>
              </div>
            </div>
          </Section>

          <Section n={6} title="Запитання та відповіді" {...sec("faq")}>
            <div className="flex flex-col gap-3">
              <p className="text-[13px] text-black/55">До {L.faq} запитань, які вам справді ставлять учасники, і ваші відповіді. Показуються списком, що розкривається.</p>
              {s.faq.map((x, i) => (
                <div key={i} className="rounded-2xl bg-white p-4 ring-1 ring-[#ece8fb] flex flex-col gap-2">
                  <div>
                    <input value={x.q} maxLength={L.faqQ} aria-invalid={tried && faqBad(i, x) && x.q.trim().length < M.faqQ ? true : undefined} onChange={(e) => set("faq", s.faq.map((y, j) => (j === i ? { ...y, q: e.target.value } : y)))} className={inputW} placeholder="Запитання" aria-label={`Запитання ${i + 1}`} />
                    <div className="text-right mt-0.5"><Counter n={x.q.length} max={L.faqQ} min={M.faqQ} /></div>
                  </div>
                  <div>
                    <textarea value={x.a} maxLength={L.faqA} aria-invalid={tried && faqBad(i, x) && x.a.trim().length < M.faqA ? true : undefined} rows={3} onChange={(e) => set("faq", s.faq.map((y, j) => (j === i ? { ...y, a: e.target.value } : y)))} className={`${inputW} resize-none`} placeholder="Ваша відповідь" aria-label={`Відповідь ${i + 1}`} />
                    <div className="flex justify-between mt-0.5">
                      <button type="button" onClick={() => set("faq", s.faq.filter((_, j) => j !== i))} className="text-[12px] text-red-500 hover:underline">Видалити</button>
                      <Counter n={x.a.length} max={L.faqA} min={M.faqA} />
                    </div>
                  </div>
                </div>
              ))}
              {s.faq.length < L.faq && (
                <button type="button" className={`${ghost} self-start`} onClick={() => set("faq", [...s.faq, { q: "", a: "" }])}>
                  Додати запитання ({s.faq.length} з {L.faq})
                </button>
              )}
            </div>
          </Section>

        </div>

        {/* save at the end too: the author fills everything in, then saves */}
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={save} disabled={saving} className="px-5 py-3 rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-white text-[14px] font-semibold hover:opacity-90 transition disabled:opacity-40">
            {saving ? "Зберігаємо…" : "Зберегти зміни"}
          </button>
          <span className="text-[13px]" aria-live="polite">
            {justSaved && !dirty ? <span className="text-emerald-600">Збережено ✓</span> : dirty ? <span className="text-amber-600">Є незбережені зміни</span> : null}
          </span>
          {restored && dirty && (
            <button onClick={discardDraft} className={ghost}>
              Скасувати чернетку
            </button>
          )}
          {errors.length > 0 && <span role="alert" className="text-[13px] font-medium text-rose-700">{errors[0]}</span>}
        </div>
      </div>
    </section>
  );
}

// the «Про мене» portrait: any photo big enough to fill 800 × 1000; very large files are refused (the result is
// always a light 1200 × 1500 JPEG, cut out by the author in the cropper)
function portraitSizeProblem(file: File): Promise<string | null> {
  if (file.size > 15 * 1024 * 1024) return Promise.resolve("Файл завеликий: до 15 МБ.");
  return new Promise((res) => {
    const img = new Image();
    const src = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(src);
      const { naturalWidth: w, naturalHeight: h } = img;
      if (w > 6000 || h > 6000) return res(`Фото ${w} × ${h}: завелике. Не більше 6000 px по стороні.`);
      // the 4:5 frame must fit inside at 800 × 1000 or more
      res(Math.min(w, h * 0.8) < 800 ? `Фото ${w} × ${h}: замале для портрета. Потрібно щонайменше 800 × 1000.` : null);
    };
    img.onerror = () => { URL.revokeObjectURL(src); res("Не вдалося відкрити фото."); };
    img.src = src;
  });
}

const FW = 280, FH = 350; // the 4:5 frame on screen
function PortraitCropper({ file, onDone, onCancel }: { file: File; onDone: (f: File) => void; onCancel: () => void }) {
  const [src] = useState(() => URL.createObjectURL(file));
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  useEffect(() => () => URL.revokeObjectURL(src), [src]);
  const base = img ? Math.max(FW / img.naturalWidth, FH / img.naturalHeight) : 1;
  const k = base * zoom;
  const clamp = (o: { x: number; y: number }, kk = k) => img ? {
    x: Math.min(0, Math.max(FW - img.naturalWidth * kk, o.x)),
    y: Math.min(0, Math.max(FH - img.naturalHeight * kk, o.y)),
  } : o;
  const onLoad = (el: HTMLImageElement) => {
    setImg(el);
    const b = Math.max(FW / el.naturalWidth, FH / el.naturalHeight);
    setOff({ x: (FW - el.naturalWidth * b) / 2, y: (FH - el.naturalHeight * b) / 2 });
  };
  const changeZoom = (z: number) => {
    // keep the centre of the frame in place
    const cx = (FW / 2 - off.x) / k, cy = (FH / 2 - off.y) / k;
    const nk = base * z;
    setZoom(z);
    setOff(clamp({ x: FW / 2 - cx * nk, y: FH / 2 - cy * nk }, nk));
  };
  const finish = () => {
    if (!img) return;
    const c = document.createElement("canvas");
    c.width = 1200;
    c.height = 1500;
    c.getContext("2d")?.drawImage(img, -off.x / k, -off.y / k, FW / k, FH / k, 0, 0, 1200, 1500);
    c.toBlob((b) => b && onDone(new File([b], "portrait.jpg", { type: "image/jpeg" })), "image/jpeg", 0.88);
  };
  return (
    <div role="dialog" aria-modal="true" aria-label="Обрізати портрет" className="fixed inset-0 z-50 flex items-center justify-center bg-[#12172b]/50 p-4">
      <div className="w-full max-w-[420px] rounded-[26px] bg-white p-6 shadow-[0_30px_80px_-30px_rgba(20,16,60,0.6)]">
        <h3 className="text-[18px] font-bold text-[#12172b]">Обріжте портрет</h3>
        <p className="mt-1 text-[13px] text-black/55">Потягніть фото й наблизьте, щоб обличчя було у верхній третині рамки.</p>
        <div
          className="relative mx-auto mt-4 cursor-grab touch-none select-none overflow-hidden rounded-2xl bg-[#f6f5fb] ring-1 ring-[#e3def9] active:cursor-grabbing"
          style={{ width: FW, height: FH, maxWidth: "100%" }}
          onPointerDown={(e) => {
            const start = { x: e.clientX, y: e.clientY, o: off };
            e.currentTarget.setPointerCapture(e.pointerId);
            const move = (ev: PointerEvent) => setOff(clamp({ x: start.o.x + ev.clientX - start.x, y: start.o.y + ev.clientY - start.y }));
            const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
            window.addEventListener("pointermove", move);
            window.addEventListener("pointerup", up);
          }}
        >
          <img src={src} alt="" draggable={false} onLoad={(e) => onLoad(e.currentTarget)} className="absolute left-0 top-0 max-w-none origin-top-left" style={img ? { width: img.naturalWidth * k, height: img.naturalHeight * k, transform: `translate(${off.x}px, ${off.y}px)` } : { opacity: 0 }} />
          <span aria-hidden className="pointer-events-none absolute inset-x-0 top-1/3 border-t border-dashed border-white/70" />
        </div>
        <label className="mt-4 flex items-center gap-3 text-[13px] text-black/60">
          Масштаб
          <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => changeZoom(Number(e.target.value))} className="flex-1" />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className={ghost}>Скасувати</button>
          <button type="button" onClick={finish} disabled={!img} className="min-h-[40px] rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] px-5 text-[13px] font-semibold text-white disabled:opacity-50">Зберегти портрет</button>
        </div>
      </div>
    </div>
  );
}
