// Author cabinet: guided editor for the public «Про мене» page. Six
// collapsible sections (all of them required, each with min/max counters),
// examples on demand, a live preview that uses the SAME component as the
// public page, a local draft that survives reloads and an explicit, validated
// save. Hiding an optional block keeps its content. Nothing is pre-filled:
// suggestions are inserted only by the author's click. Education,
// certificates and experience are edited in the block below this one.
import { useEffect, useRef, useState } from "react";
import AuthorMe from "./public/AuthorMe";
import { DEFAULT_OFFER_ICON, DEFAULT_PRINCIPLE_ICONS, DEFAULT_STEP_ICONS, STORY_ICONS, iconPath, type StoryIconId } from "../../utils/storyIcons";
import { fetchAuthorStory, saveAuthorStory, uploadStoryAudio, uploadStoryPortrait } from "../../lib/authorStory";
import { parseVideoUrl } from "../../utils/authorPosts";
import {
  EMPTY_STORY,
  NOT_OFFER_EXAMPLES,
  OFFER_EXAMPLES,
  PRINCIPLE_SUGGESTIONS,
  STEP_EXAMPLES,
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

type Props = {
  authorId: string;
  name: string;
  initials: string;
  avatarUrl: string | null;
  role: string;
  approach: string;
};

const input = "w-full px-3.5 py-2.5 rounded-xl border border-black/10 text-[14px] focus:outline-none focus:border-black/30 bg-white";
const label = "text-[13px] font-medium text-black/60 mb-1.5";
const hint = "text-[12px] text-black/45 mt-1.5";
const ghost = "px-3.5 py-2 rounded-xl bg-black/5 hover:bg-black/10 text-[13px] font-medium transition disabled:opacity-50";
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

function Example({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="text-[12px] text-[#4338ca] hover:underline">
        {open ? "Сховати приклад" : "Показати приклад"}
      </button>
      {open && <div className="mt-1.5 rounded-lg bg-[#f4f5ff] px-3 py-2 text-[13px] text-black/60 leading-relaxed">{children}</div>}
    </div>
  );
}

// top-level (not nested) so inputs inside keep focus while typing
function Section({
  n, title, required, isOpen, onToggle, filled, invalid, hidden, onHiddenChange, status, children,
}: {
  n: number; title: string; required?: boolean; isOpen: boolean; onToggle: () => void; filled: boolean; invalid?: boolean;
  hidden?: boolean; onHiddenChange?: (hidden: boolean) => void; status: string | null; children: React.ReactNode;
}) {
  return (
    <div className={`rounded-2xl border bg-white ${invalid ? "border-rose-400 shadow-[0_0_0_3px_rgba(244,63,94,0.14)]" : "border-black/10"}`}>
      <button type="button" onClick={onToggle} aria-expanded={isOpen} className="w-full flex items-center gap-3 px-4 py-3.5 text-left min-h-[56px]">
        <span className="w-6 h-6 shrink-0 rounded-full bg-[#eef0fd] text-[#4338ca] text-[12px] font-semibold flex items-center justify-center">{filled ? "✓" : n}</span>
        <span className="flex-1 min-w-0">
          <span className="block text-[15px] font-semibold text-black/85">{title}</span>
          <span className="block text-[12px] text-black/45">{required ? "Обов’язково" : hidden ? "Необов’язково · приховано" : "Необов’язково"}</span>
          <span className={`block text-[12px] mt-0.5 ${status ? "text-amber-700" : "text-emerald-700"}`}>{status ?? "Показується на сторінці"}</span>
        </span>
        <span aria-hidden className={`text-black/40 transition-transform ${isOpen ? "rotate-180" : ""}`}>⌄</span>
      </button>
      {isOpen && (
        <div className="px-4 pb-5 pt-1 flex flex-col gap-4 border-t border-black/[0.06]">
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
function LineList({ items, onChange, max, placeholder, examples, min, invalid, need = 0 }: { items: string[]; onChange: (v: string[]) => void; max: number; placeholder: string; examples: string[]; min?: number; invalid?: boolean; need?: number }) {
  const rows = [...items, ...Array.from({ length: Math.max(0, max - items.length) }, () => "")].slice(0, max);
  return (
    <div className="flex flex-col gap-2">
      {rows.map((t, i) => (
        <div key={i}>
          <input value={t} maxLength={L.limit} onChange={(e) => onChange(rows.map((x, j) => (j === i ? e.target.value : x)))} className={input} placeholder={i === 0 ? placeholder : ""} aria-label={`${placeholder} ${i + 1}`} aria-invalid={invalid && i < need && t.trim().length < (min ?? 1) ? true : undefined} />
          {t && <div className="text-right mt-0.5"><Counter n={t.length} max={L.limit} min={min} /></div>}
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        {examples.filter((e) => !items.includes(e)).map((e) => (
          <button key={e} type="button" disabled={items.filter(Boolean).length >= max} onClick={() => onChange([...items.filter(Boolean), e])} className="px-3 py-1 rounded-full text-[12px] border border-black/10 text-black/55 hover:bg-black/5 text-left disabled:opacity-40">
            + {e}
          </button>
        ))}
      </div>
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
    <div className="shrink-0">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={`${aria}: обрати іконку`} title="Обрати іконку" className="w-11 h-11 rounded-full bg-[#f1f0fb] text-[#4338ca] flex items-center justify-center hover:bg-[#e7e5f8] focus-visible:outline-none focus-visible:ring-2 ring-[#4338ca]">
        <Glyph d={iconPath(value, fallback)} />
      </button>
      {open && (
        <div role="listbox" aria-label="Іконки" className="mt-2 grid grid-cols-6 sm:grid-cols-8 gap-1.5 rounded-xl border border-black/10 bg-white p-2 w-[280px] max-w-full">
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
  items, icons, onChange, max, textMax, fallback, placeholder, suggestions, addLabel, min, invalid, need = 0,
}: {
  min?: number; invalid?: boolean; need?: number;
  items: string[]; icons: string[]; onChange: (items: string[], icons: string[]) => void; max: number; textMax: number;
  fallback: (i: number) => StoryIconId; placeholder: string; suggestions: string[]; addLabel: string;
}) {
  const ics = items.map((_, i) => icons[i] ?? "");
  const full = items.filter((t) => t.trim()).length >= max || items.length >= max;
  return (
    <div className="flex flex-col gap-2.5">
      {items.map((t, i) => (
        <div key={i} className="flex gap-2.5 items-start">
          <IconPicker value={ics[i]} fallback={fallback(i)} label={`${placeholder} ${i + 1}`} onChange={(id) => onChange(items, ics.map((x, j) => (j === i ? id : x)))} />
          <div className="flex-1 min-w-0">
            <input value={t} maxLength={textMax} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)), ics)} className={input} placeholder={placeholder} aria-label={`${placeholder} ${i + 1}`} aria-invalid={invalid && t.trim().length < (min ?? 1) ? true : undefined} />
            <div className="flex justify-between mt-1">
              <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i), ics.filter((_, j) => j !== i))} className="text-[12px] text-red-500 hover:underline">Видалити</button>
              <Counter n={t.length} max={textMax} min={min} />
            </div>
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-2 items-center">
        <button type="button" disabled={full} aria-invalid={invalid && items.length < need ? true : undefined} onClick={() => onChange([...items, ""], [...ics, ""])} className={ghost}>{addLabel} ({items.length} з {max})</button>
        {suggestions.filter((e) => !items.includes(e)).map((e) => (
          <button key={e} type="button" disabled={full} onClick={() => onChange([...items.filter((x) => x.trim()), e], [...ics.filter((_, j) => items[j].trim()), ""])} className="px-3 py-1 rounded-full text-[12px] border border-black/10 text-black/55 hover:bg-black/5 text-left disabled:opacity-40">
            + {e}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function AuthorStoryEditor({ authorId, name, initials, avatarUrl, role, approach }: Props) {
  const [s, setS] = useState<AuthorStory>(EMPTY_STORY);
  const saved = useRef<string>(sig(EMPTY_STORY));
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<SectionId | "">("intro");
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  // after a save that did not pass: fields still missing are outlined in red
  const [tried, setTried] = useState(false);
  const [restored, setRestored] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
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
  const stepBad = (i: number, x: StoryStep) => !fullStep(x) && (!!(x.title.trim() || x.text.trim()) || (s.steps.filter(fullStep).length < M.steps && i < M.steps));
  const fullFaq = (x: { q: string; a: string }) => x.q.trim().length >= M.faqQ && x.a.trim().length >= M.faqA;
  const faqBad = (i: number, x: { q: string; a: string }) => !fullFaq(x) && (!!(x.q.trim() || x.a.trim()) || (s.faq.filter(fullFaq).length < M.faq && i < M.faq));
  const steps: StoryStep[] = [...s.steps, ...Array.from({ length: Math.max(0, stepRows - s.steps.length) }, () => ({ title: "", text: "", icon: "" }))].slice(0, stepRows);
  const setStep = (i: number, patch: Partial<StoryStep>) => set("steps", steps.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const mediaOf = (kind: "video" | "audio") => (s.media?.kind === kind ? s.media : { kind, url: "", caption: s.media?.caption ?? "", duration: s.media?.duration ?? "" });


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
    const problems = [...validateStory(s, { hasProfilePhoto: !!avatarUrl }), ...Object.entries(missingParts(s, !!avatarUrl)).flatMap(([, v]) => v.map((x) => `Потрібно: ${x}.`))];
    if (problems.length) {
      // no list of problems: open the first section that needs attention, its fields are outlined in red
      setTried(true);
      setErrors(["Заповніть поля, позначені червоним."]);
      const missingNow = missingParts(s, !!avatarUrl);
      const order: SectionId[] = ["intro", "media", "approach", "principles", "limits", "faq"];
      const v = validateStory(s, { hasProfilePhoto: !!avatarUrl }).join(" ");
      const first = order.find((id) => missingNow[id].length > 0)
        ?? (/фото|знайомства/.test(v) ? "intro" : /Особисте|Відео/.test(v) ? "media" : /Підхід|погляд/.test(v) ? "approach" : "faq");
      setOpen(first);
      window.setTimeout(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 80);
      return;
    }
    setErrors([]);
    setTried(false);
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
      setErrors([e instanceof Error ? e.message : "Не вдалося зберегти."]);
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
  const missing = missingParts(s, !!avatarUrl);
  const sec = (id: SectionId) => ({
    isOpen: open === id,
    onToggle: () => setOpen(open === id ? "" : id),
    filled: missing[id].length === 0,
    invalid: tried && missing[id].length > 0,
    status: missing[id].length ? `Потрібно заповнити: ${missing[id].join("; ")}.` : null,
  });

  return (
    <section className="flex flex-col gap-5" aria-label="Сторінка «Про мене»">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-[20px] font-semibold">Сторінка «Про мене»</h2>
          <p className="text-black/50 text-[14px] mt-1 max-w-[560px]">Кілька коротких відповідей замість біографії. Усі розділи обов’язкові: у кожному показано мінімум і максимум символів. Освіту, досвід і кількість матеріалів Sensoria бере з інших розділів. Вигляд створює Sensoria.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[13px]" aria-live="polite">
            {saving ? <span className="text-black/50">Зберігаємо…</span> : justSaved && !dirty ? <span className="text-emerald-600">Збережено ✓</span> : dirty ? <span className="text-amber-600">Є незбережені зміни</span> : null}
          </span>
          {restored && dirty && (
            <button onClick={discardDraft} className={ghost}>
              Скасувати чернетку
            </button>
          )}
          <button onClick={save} disabled={saving || !dirty} className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white text-[14px] font-medium hover:opacity-90 transition disabled:opacity-40">
            Зберегти
          </button>
        </div>
      </div>
      {restored && dirty && <p className="text-[13px] text-black/55 bg-[#f4f5ff] rounded-xl px-4 py-2.5">Відновлено вашу незбережену чернетку. Натисніть «Зберегти», щоб опублікувати.</p>}
      {errors.length > 0 && <p role="alert" className="text-[13px] font-medium text-rose-700">{errors[0]}</p>}

      <div className="grid lg:grid-cols-[minmax(0,540px)_minmax(0,1fr)] gap-8 items-start">
        <div className="flex flex-col gap-3">
          <Section n={1} title="Знайомство" required {...sec("intro")}>
            <div className="flex flex-col gap-4">
              <div>
                <div className={label}>Фото (обов’язково)</div>
                <div className="flex items-center gap-3 flex-wrap">
                  <label aria-invalid={tried && !s.portraitUrl && !avatarUrl ? true : undefined} className={`${ghost} cursor-pointer`}>
                    {uploading === "portrait" ? "Завантажуємо…" : s.portraitUrl ? "Замінити фото" : "Завантажити фото"}
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void upload("portrait", f, async (file) => set("portraitUrl", await uploadStoryPortrait(authorId, file))); }} />
                  </label>
                  {s.portraitUrl && <button type="button" onClick={() => set("portraitUrl", "")} className="text-[13px] text-red-500 hover:underline">Прибрати</button>}
                </div>
                <div className={`text-[12px] mt-1.5 ${s.portraitUrl || avatarUrl ? "text-emerald-700" : "text-amber-700"}`}>
                  {s.portraitUrl ? "Використовується це фото." : avatarUrl ? "Використовується фото профілю. Тут можна завантажити інше." : "Фото ще немає: без нього сторінку не можна зберегти."}
                </div>
                <div className={hint}>Справжнє фото обличчя, у гарній якості. Воно стоїть ліворуч у першому блоці сторінки.</div>
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
                <Example>«Я прийшла в цю сферу, коли помітила, як багато людей живуть у постійній напрузі й не мають слів для свого стану.» Ім’я, посада й теми вже є в шапці профілю.</Example>
              </div>
            </div>
          </Section>

          <Section n={2} title="Відеознайомство" required {...sec("media")}>
            <div className="flex flex-col gap-3">
              <p className="text-[13px] text-black/55">Коротке відео, де ви самі розповідаєте, хто ви, як працюєте, що для вас важливо й чого очікувати від ваших матеріалів. Лише ваше справжнє відео.</p>
              <div className="flex gap-2">
                {(["video", "audio"] as const).map((k) => {
                  const on = s.media?.kind === k;
                  return (
                    <button key={k} type="button" aria-pressed={on} aria-invalid={tried && !s.media ? true : undefined} onClick={() => set("media", on ? s.media : mediaOf(k))} className={`px-3.5 py-2 rounded-full text-[13px] border transition ${on ? "bg-[#eef2ff] border-[#4338ca]/30 text-[#4338ca]" : "border-black/10 text-black/60 hover:bg-black/5"}`}>
                      {k === "video" ? "Відео" : "Лише аудіо"}
                    </button>
                  );
                })}
              </div>
              {s.media?.kind === "video" && (
                <div>
                  <input value={s.media.url} onChange={(e) => set("media", { ...s.media!, url: e.target.value.trim() })} className={input} placeholder="Посилання YouTube або Vimeo" aria-label="Посилання на відео" aria-invalid={tried && !parseVideoUrl(s.media.url.trim()) ? true : undefined} />
                  <div className={`text-[12px] mt-1.5 ${s.media.url && parseVideoUrl(s.media.url) ? "text-emerald-700" : "text-black/45"}`}>
                    {s.media.url && parseVideoUrl(s.media.url) ? "Відео додано: на сторінці з’явиться плеєр із кадром з вашого відео." : "Відео ще немає: без посилання цей блок не показується."}
                  </div>
                  <div className={hint}>Відео лежить у вас на YouTube (можна «за посиланням»). Кадр для плеєра Sensoria бере з самого відео. Відтворюється воно прямо на сторінці.</div>
                </div>
              )}
              {s.media?.kind === "audio" && (
                <div className="flex flex-col gap-2">
                  <label aria-invalid={tried && !s.media.url ? true : undefined} className={`${ghost} cursor-pointer self-start`}>
                    {uploading === "audio" ? "Завантажуємо…" : s.media.url ? "Замінити запис" : "Завантажити аудіо"}
                    <input type="file" accept="audio/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void upload("audio", f, async (file) => set("media", { ...mediaOf("audio"), url: await uploadStoryAudio(authorId, file) })); }} />
                  </label>
                  {s.media.url ? (
                    <>
                      <div className="text-[12px] text-emerald-700">Запис завантажено: на сторінці з’явиться плеєр.</div>
                      <audio controls preload="metadata" src={s.media.url} className="w-full" aria-label="Попереднє прослуховування" />
                    </>
                  ) : (
                    <div className="text-[12px] text-black/45">Запису ще немає: без файлу цей блок не показується.</div>
                  )}
                  <div className={hint}>MP3, M4A, WAV або OGG, до 25 МБ.</div>
                </div>
              )}
              {s.media && (
                <>
                  <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3">
                    <div>

                      <div className={label}>Тривалість</div>
                      <input value={s.media.duration} maxLength={8} onChange={(e) => set("media", { ...s.media!, duration: e.target.value.replace(/[^\d:]/g, "") })} className={input} placeholder="3:20" aria-label="Тривалість, хвилини:секунди" />
                    </div>
                    <div>
                      <div className="flex justify-between"><div className={label}>Свій короткий вступ (необов’язково; без нього тексту поруч із відео не буде)</div><Counter n={s.media.caption.length} max={L.caption} /></div>
                      <input value={s.media.caption} maxLength={L.caption} onChange={(e) => set("media", { ...s.media!, caption: e.target.value })} className={input} placeholder="Розповім, як я працюю, що для мене важливо та чого очікувати від моїх матеріалів." />
                    </div>
                  </div>
                  <div className={hint}>Тривалість показуємо, лише якщо ви її вкажете (формат хв:сек).</div>
                  <button type="button" onClick={() => window.confirm("Видалити відео чи аудіо з профілю?") && set("media", null)} className="text-[13px] text-red-500 hover:underline self-start">
                    Видалити запис
                  </button>
                </>
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
                <Example>«Не кожну емоцію треба виправляти.» Пишіть своє, а не готову цитату.</Example>
              </div>
              <div>
                <div className="flex justify-between"><div className={label}>Підзаголовок</div><Counter n={s.viewpointNote.length} max={L.viewpointNote} min={M.viewpointNote} /></div>
                <textarea value={s.viewpointNote} maxLength={L.viewpointNote} rows={3} onChange={(e) => set("viewpointNote", e.target.value)} aria-invalid={tried && s.viewpointNote.trim().length < M.viewpointNote ? true : undefined} className={`${input} resize-none`} placeholder="Пояснення під заголовком." />
                <div className={hint}>Стоїть під заголовком, до {L.viewpointNote} символів. Без заголовка не показується.</div>
              </div>
              <div className="flex flex-col gap-3">
                <div className={label}>Як відбувається робота (від {M.steps} до {L.steps} етапів)</div>
                {steps.map((x, i) => (
                  <div key={i} className="rounded-xl border border-black/10 p-3 flex gap-2.5 items-start">
                    <IconPicker value={x.icon ?? ""} fallback={DEFAULT_STEP_ICONS[i % DEFAULT_STEP_ICONS.length]} label={`Етап ${i + 1}`} onChange={(id) => setStep(i, { icon: id })} />
                    <div className="flex-1 min-w-0 flex flex-col gap-2">
                      <div>
                        <input value={x.title} maxLength={L.stepTitle} onChange={(e) => setStep(i, { title: e.target.value })} aria-invalid={tried && stepBad(i, x) && x.title.trim().length < M.stepTitle ? true : undefined} className={input} placeholder={`Назва, напр.: ${(STEP_EXAMPLES[i] ?? { title: "Свій етап" }).title}`} aria-label={`Етап ${i + 1}: назва`} />
                        <div className="text-right mt-0.5"><Counter n={x.title.length} max={L.stepTitle} min={M.stepTitle} /></div>
                      </div>
                      <div>
                        <textarea value={x.text} maxLength={L.stepText} rows={2} onChange={(e) => setStep(i, { text: e.target.value })} aria-invalid={tried && stepBad(i, x) && x.text.trim().length < M.stepText ? true : undefined} className={`${input} resize-none`} placeholder={(STEP_EXAMPLES[i] ?? { text: "Коротко: що відбувається на цьому етапі." }).text} aria-label={`Етап ${i + 1}: пояснення`} />
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
                <button type="button" className={`${ghost} self-start`} onClick={() => set("steps", steps.map((x, i) => ({ ...x, title: x.title.trim() ? x.title : (STEP_EXAMPLES[i]?.title ?? ""), text: x.text.trim() ? x.text : (STEP_EXAMPLES[i]?.text ?? "") })))}>
                  Підставити приклад у порожні поля
                </button>
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
                suggestions={PRINCIPLE_SUGGESTIONS}
                addLabel="Додати принцип"
              />
            </div>
          </Section>

          <Section n={5} title="Чого очікувати і межі" required {...sec("limits")}>
            <div className="flex flex-col gap-5">
              <p className="text-[13px] text-black/55">Допомагає учаснику вирішити, чи це для нього.</p>
              <div>
                <div className={label}>Чого очікувати від моїх матеріалів (від {M.offers} до {L.limits} пунктів, текст від {M.offer} до {L.limit} символів, іконка на ваш вибір)</div>
                <IconItems
                  items={s.offers}
                  icons={s.offerIcons}
                  onChange={(t, ic) => { setJustSaved(false); setS((p) => ({ ...p, offers: t, offerIcons: ic })); }}
                  max={L.limits}
                  textMax={L.limit}
                  fallback={() => DEFAULT_OFFER_ICON}
                  placeholder="Наприклад: короткі практики"
                  min={M.offer}
                  invalid={tried && s.offers.filter((x) => x.trim().length >= M.offer).length < M.offers}
                  need={M.offers}
                  suggestions={OFFER_EXAMPLES}
                  addLabel="Додати пункт"
                />
              </div>
              <div>
                <div className={label}>Межі моєї роботи (від {M.notOffers} до {L.limits} пунктів, текст від {M.notOffer} до {L.limit} символів)</div>
                <LineList items={s.notOffers} onChange={(v) => set("notOffers", v)} max={L.limits} placeholder="Наприклад: не замінюю лікування" examples={NOT_OFFER_EXAMPLES} min={M.notOffer} invalid={tried && s.notOffers.filter((x) => x.trim().length >= M.notOffer).length < M.notOffers} need={M.notOffers} />
                <div className={hint}>Не пишіть про діагнози чи лікування як про те, що ви надаєте.</div>
              </div>
            </div>
          </Section>

          <Section n={6} title="Запитання та відповіді" required {...sec("faq")}>
            <div className="flex flex-col gap-3">
              <p className="text-[13px] text-black/55">Від {M.faq} до {L.faq} запитань, які вам справді ставлять учасники, і ваші відповіді. Показуються списком, що розкривається.</p>
              {s.faq.map((x, i) => (
                <div key={i} className="rounded-xl border border-black/10 p-3 flex flex-col gap-2">
                  <div>
                    <input value={x.q} maxLength={L.faqQ} aria-invalid={tried && faqBad(i, x) && x.q.trim().length < M.faqQ ? true : undefined} onChange={(e) => set("faq", s.faq.map((y, j) => (j === i ? { ...y, q: e.target.value } : y)))} className={input} placeholder="Запитання" aria-label={`Запитання ${i + 1}`} />
                    <div className="text-right mt-0.5"><Counter n={x.q.length} max={L.faqQ} min={M.faqQ} /></div>
                  </div>
                  <div>
                    <textarea value={x.a} maxLength={L.faqA} aria-invalid={tried && faqBad(i, x) && x.a.trim().length < M.faqA ? true : undefined} rows={3} onChange={(e) => set("faq", s.faq.map((y, j) => (j === i ? { ...y, a: e.target.value } : y)))} className={`${input} resize-none`} placeholder="Ваша відповідь" aria-label={`Відповідь ${i + 1}`} />
                    <div className="flex justify-between mt-0.5">
                      <button type="button" onClick={() => set("faq", s.faq.filter((_, j) => j !== i))} className="text-[12px] text-red-500 hover:underline">Видалити</button>
                      <Counter n={x.a.length} max={L.faqA} min={M.faqA} />
                    </div>
                  </div>
                </div>
              ))}
              {s.faq.length < L.faq && (
                <button type="button" aria-invalid={tried && s.faq.length < M.faq ? true : undefined} className={`${ghost} self-start`} onClick={() => set("faq", [...s.faq, { q: "", a: "" }])}>
                  Додати запитання ({s.faq.length} з {L.faq})
                </button>
              )}
            </div>
          </Section>

          <button type="button" onClick={() => setShowPreview((v) => !v)} aria-expanded={showPreview} className={`${ghost} lg:hidden self-start`}>
            {showPreview ? "Сховати перегляд" : "Показати перегляд"}
          </button>
        </div>

        <div className={`${showPreview ? "block" : "hidden"} lg:block lg:sticky lg:top-6`}>
          <div className="text-[12px] text-black/40 mb-2 px-1">Так це бачитимуть учасники (освіта й досвід додаються в блоці нижче)</div>
          <div className="rounded-2xl border border-black/10 bg-[#f4f5fb] p-5 sm:p-6 max-h-[78vh] overflow-y-auto">
            <AuthorMe name={name} initials={initials} avatarUrl={avatarUrl} role={role} approach={approach} story={s} videoSlotHint />
          </div>
        </div>
      </div>
    </section>
  );
}
