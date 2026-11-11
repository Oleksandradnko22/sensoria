// Meditation recording studio: the author reads the practice text fragment by fragment
// (a teleprompter, ← → between fragments), sets the pause after each one, adds background
// sounds and music (Sensoria's or their own), listens to the whole meditation and saves it
// as the meditation's audio. Everything is recorded and mixed in the browser; only the
// finished MP3 is uploaded (by the editor, as a file). On a desktop it fits one screen.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  STUDIO_DEFAULT_PAUSE,
  STUDIO_FRAGMENT_MAX_CHARS,
  STUDIO_LEAD_IN,
  STUDIO_PAUSES,
  formatClock,
  pauseLabel,
  splitTranscript,
  takeSeconds,
  totalSeconds,
  type BgChoice,
  type StudioState,
} from "../../utils/meditationStudio";
import { encodeMp3, makeTake, micLevel, mixMeditation, openMicrophone, previewBackground, startRecording, type BgSource } from "../../lib/meditationAudio";
import { BACKGROUND_TRACKS, findBackgroundTrack } from "../../data/meditationBackgroundSounds";
import { Icon, type IconName } from "../ui/Icon";

type Props = {
  title: string;
  transcript: string;
  maxChars: number;
  maxMinutes: number;
  store: { current: StudioState };
  onTranscriptChange: (text: string) => void;
  // uploads the finished file as the meditation's audio; returns an error text or null
  onDone: (file: File, info: { hasMusic: boolean }) => Promise<string | null>;
  onClose: () => void;
};

const BTN = "inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl px-4 text-[14px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50 disabled:opacity-50";
const PRIMARY = `${BTN} bg-gradient-to-r from-[#5232f4] to-[#774eff] text-white hover:opacity-90`;
const SECONDARY = `${BTN} border border-[#d9d4f5] bg-white text-[#2d2a5c] hover:bg-[#f6f4ff]`;
const CARD = "rounded-[22px] border border-[#e4def9] bg-white";
const CHIP = "min-h-[34px] rounded-full px-3.5 text-[13px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50";
const chipCls = (on: boolean) => `${CHIP} ${on ? "bg-gradient-to-r from-[#5232f4] to-[#774eff] text-white" : "border border-[#d9d4f5] bg-white text-[#2d2a5c] hover:bg-[#f6f4ff]"}`;
const ARROW = "grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#d9d4f5] bg-white text-[18px] text-[#4a2fd0] transition hover:bg-[#f3efff] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50 disabled:opacity-30";

const SOUND_TRACKS = BACKGROUND_TRACKS.filter((t) => t.group !== "music");
const MUSIC_TRACKS = BACKGROUND_TRACKS.filter((t) => t.group === "music");

// The text screen shows this many fragment fields at once; «Далі» / «Назад» page through the rest.
const TEXT_PAGE = 4;
const partsOf = (text: string) => splitTranscript(text).map((f) => f.text);
// fields on screen: always whole pages of TEXT_PAGE, so the block never changes its size
const slotsFor = (n: number) => Math.max(TEXT_PAGE, Math.ceil(n / TEXT_PAGE) * TEXT_PAGE);

// a calm voice reads about 12 characters a second
const estimateSeconds = (text: string) => Math.max(2, text.length / 12);

// the teleprompter text gets smaller as the fragment gets longer, so it always fits the card
const promptSize = (t: string) => (t.length <= 120 ? "text-[26px] leading-[1.55] sm:text-[30px]" : t.length <= 220 ? "text-[22px] leading-[1.55] sm:text-[25px]" : t.length <= 320 ? "text-[19px] leading-[1.55] sm:text-[21px]" : "text-[17px] leading-[1.5] sm:text-[19px]");

// short advice for a good recording, shown one at a time in the side panel
const TIPS = [
  { icon: "headphones" as IconName, title: "Навушники з мікрофоном", text: "Звучать чистіше за мікрофон ноутбука й не ловлять шум вентилятора." },
  { icon: "moon" as IconName, title: "Говоріть повільніше, ніж зазвичай", text: "Медитацію слухають у спокої: м’який темп і тихий голос допомагають розслабитися." },
  { icon: "heart" as IconName, title: "Посміхніться перед записом", text: "Легка посмішка робить голос теплішим, навіть якщо її не видно." },
  { icon: "pause" as IconName, title: "Паузи — частина практики", text: "Після вдиху чи завдання дайте 5–10 секунд тиші: людині потрібен час." },
  { icon: "refresh" as IconName, title: "Помилились — не страшно", text: "Перезапишіть лише цей фрагмент, решта залишиться як є." },
];

// the text screen and the recording screen have the same height on a desktop
const SCREEN_H = "lg:h-[min(640px,calc(100vh-150px))]";

const layerSource = (c: BgChoice): BgSource | null => (c.id === "own" ? c.own : c.id ? findBackgroundTrack(c.id)?.url ?? null : null);

export default function MeditationStudio({ title, transcript, maxChars, maxMinutes, store, onTranscriptChange, onDone, onClose }: Props) {
  const [state, setState] = useState<StudioState>(store.current);
  const set = (patch: Partial<StudioState>) => setState((s) => ({ ...s, ...patch }));
  useEffect(() => { store.current = state; }, [state, store]);

  const fragments = useMemo(() => splitTranscript(transcript), [transcript]);
  const [editingText, setEditingText] = useState(fragments.length === 0);
  const [parts, setParts] = useState<string[]>(() => partsOf(transcript));
  const [textPage, setTextPage] = useState(0);
  const [slots, setSlots] = useState(() => slotsFor(partsOf(transcript).length));
  const [showGaps, setShowGaps] = useState(false);
  const openText = () => { const p = partsOf(transcript); setParts(p); setSlots(slotsFor(p.length)); setTextPage(0); setShowGaps(false); setError(null); setEditingText(true); };
  const [cur, setCur] = useState(() => Math.max(0, fragments.findIndex((f) => !store.current.takes[f.id])));
  const [phase, setPhase] = useState<"record" | "listen">("record");
  const [error, setError] = useState<string | null>(null);

  // microphone
  const streamRef = useRef<MediaStream | null>(null);
  const meterRef = useRef<HTMLDivElement | null>(null);
  const meterNoteRef = useRef<HTMLParagraphElement | null>(null);
  const levelRef = useRef<{ read: () => number; close: () => void } | null>(null);
  const [micOn, setMicOn] = useState(false);
  const stopRef = useRef<null | (() => Promise<Blob>)>(null);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const ensureMic = async () => {
    if (streamRef.current) return streamRef.current;
    const s = await openMicrophone();
    streamRef.current = s;
    levelRef.current = micLevel(s);
    setMicOn(true);
    return s;
  };

  useEffect(() => {
    if (!micOn) return;
    let raf = 0;
    let peak = 0;
    let lastNote = 0;
    const loop = () => {
      const v = levelRef.current?.read() ?? 0;
      peak = Math.max(peak * 0.97, v);
      const now = performance.now();
      if (meterNoteRef.current && now - lastNote > 600) {
        lastNote = now;
        meterNoteRef.current.textContent = peak > 0.85 ? "Задто голосно: відсуньтеся трохи далі від мікрофона." : peak > 0.12 ? "Гучність добра" : peak > 0.03 ? "Тихувато: говоріть трохи ближче до мікрофона." : "Скажіть кілька слів…";
      }
      if (meterRef.current) {
        meterRef.current.style.width = `${Math.round(v * 100)}%`;
        meterRef.current.style.background = v > 0.85 ? "#e11d48" : v > 0.12 ? "#22a35a" : "#b9aef5";
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [micOn]);

  useEffect(() => () => {
    levelRef.current?.close();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    stopPlay.current?.();
    stopBg.current?.();
  }, []);

  useEffect(() => {
    if (!recording) return;
    const t0 = Date.now();
    const id = window.setInterval(() => setElapsed((Date.now() - t0) / 1000), 250);
    return () => window.clearInterval(id);
  }, [recording]);

  const idx = Math.min(cur, Math.max(0, fragments.length - 1));
  const fragment = fragments[idx];
  const take = fragment ? state.takes[fragment.id] : undefined;
  const isLast = idx === fragments.length - 1;
  const recordedCount = fragments.filter((f) => state.takes[f.id]).length;
  const allRecorded = fragments.length > 0 && recordedCount === fragments.length;
  const total = totalSeconds(fragments, state.takes, state.pauses, state.endPause);
  // the length the meditation will have: recorded fragments as they are, the rest estimated from the text
  const voicePlanned = fragments.reduce((n, f) => n + (state.takes[f.id] ? takeSeconds(state.takes[f.id]) : estimateSeconds(f.text)), 0);
  const [tip, setTip] = useState(0);
  const [tipVisible, setTipVisible] = useState(true);
  const showTip = (next: (t: number) => number) => { setTipVisible(false); window.setTimeout(() => { setTip(next); setTipVisible(true); }, 450); };
  // advice changes slowly and softly, and never while the author is reading aloud
  useEffect(() => {
    if (recording) return;
    const id = window.setInterval(() => showTip((t) => (t + 1) % TIPS.length), 15000);
    return () => window.clearInterval(id);
  }, [recording]);
  const planned = fragments.length === 0 ? 0 : STUDIO_LEAD_IN + fragments.reduce((n, f, i) => n + (state.takes[f.id] ? takeSeconds(state.takes[f.id]) : estimateSeconds(f.text)) + (i === fragments.length - 1 ? state.endPause : state.pauses[f.id] ?? STUDIO_DEFAULT_PAUSE), 0);

  const go = (n: number) => { if (!recording) { stopPlay.current?.(); setCur(Math.max(0, Math.min(fragments.length - 1, n))); } };

  const startRec = async () => {
    if (!fragment || busy) return;
    setError(null);
    stopPlay.current?.();
    stopBg.current?.();
    try {
      const s = await ensureMic();
      stopRef.current = startRecording(s);
      setElapsed(0);
      setRecording(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося увімкнути мікрофон.");
    }
  };

  const finishRec = async (keep: boolean) => {
    const stop = stopRef.current;
    stopRef.current = null;
    setRecording(false);
    if (!stop) return;
    const blob = await stop();
    if (!keep || !fragment) return;
    setBusy(true);
    try {
      const t = await makeTake(blob);
      if (!t) { setError("Не чути голосу. Перевірте мікрофон і запишіть фрагмент ще раз."); return; }
      const takes = { ...state.takes, [fragment.id]: t };
      set({ takes });
      // on to the next fragment that is not recorded yet (or simply stay on the last one)
      const next = fragments.findIndex((f, i) => i > idx && !takes[f.id]);
      const anyLeft = fragments.findIndex((f) => !takes[f.id]);
      setCur(next >= 0 ? next : anyLeft >= 0 ? anyLeft : idx);
    } catch {
      setError("Не вдалося обробити запис. Спробуйте ще раз.");
    } finally {
      setBusy(false);
    }
  };

  // Space: start / finish a fragment; ← →: previous / next (not while typing or on a focused control)
  const keyRef = useRef<(code: string) => void>(() => {});
  keyRef.current = (code) => {
    if (code === "Space") { if (recording) void finishRec(true); else void startRec(); }
    if (code === "ArrowLeft") go(idx - 1);
    if (code === "ArrowRight") go(idx + 1);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!["Space", "ArrowLeft", "ArrowRight"].includes(e.code) || editingText || phase !== "record") return;
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, button, a, audio")) return;
      e.preventDefault();
      keyRef.current(e.code);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editingText, phase]);

  // listening to one take
  const stopPlay = useRef<null | (() => void)>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const playTake = (id: string) => {
    const was = playing;
    stopPlay.current?.();
    if (was === id) return;
    const t = state.takes[id];
    if (!t) return;
    const url = URL.createObjectURL(t.blob);
    const a = new Audio(url);
    const stop = () => { a.pause(); URL.revokeObjectURL(url); setPlaying(null); stopPlay.current = null; };
    a.addEventListener("loadedmetadata", () => { a.currentTime = t.start; void a.play(); });
    a.addEventListener("timeupdate", () => { if (a.currentTime >= t.end) stop(); });
    a.addEventListener("ended", stop);
    stopPlay.current = stop;
    setPlaying(id);
  };

  // background preview (one layer at a time)
  const stopBg = useRef<null | (() => void)>(null);
  const [bgPlaying, setBgPlaying] = useState<null | "sound" | "music" | "loading">(null);
  const stopPreview = () => { stopBg.current?.(); stopBg.current = null; setBgPlaying(null); };
  const togglePreview = async (which: "sound" | "music") => {
    const was = bgPlaying;
    stopPreview();
    if (was === which) return;
    const src = layerSource(state[which]);
    if (!src) return;
    setBgPlaying("loading");
    try {
      stopBg.current = await previewBackground(src, state[which].volume * 0.35);
      setBgPlaying(which);
    } catch {
      setBgPlaying(null);
      setError("Не вдалося відтворити фон. Перевірте з’єднання або оберіть інший файл.");
    }
  };
  const setLayer = (which: "sound" | "music", patch: Partial<BgChoice>) => {
    stopPreview();
    set({ [which]: { ...state[which], ...patch } } as Partial<StudioState>);
  };

  // the whole meditation
  const [progress, setProgress] = useState<{ share: number; label: string } | null>(null);
  const [result, setResult] = useState<{ url: string; blob: Blob } | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url); }, [result]);

  const buildAll = async () => {
    setError(null);
    if (total > maxMinutes * 60) { setError(`Медитація довша за ${maxMinutes} хвилин. Скоротіть паузи або текст.`); return; }
    stopPlay.current?.();
    stopPreview();
    setPhase("listen");
    setResult(null);
    try {
      const layers = (["sound", "music"] as const).flatMap((w) => { const src = layerSource(state[w]); return src ? [{ src, volume: state[w].volume }] : []; });
      const mixed = await mixMeditation({ fragments, takes: state.takes, pauses: state.pauses, endPause: state.endPause, layers, onProgress: (share, label) => setProgress({ share, label }) });
      const blob = await encodeMp3(mixed, (s) => setProgress({ share: 0.5 + s * 0.5, label: "Пакуємо в MP3…" }));
      setResult({ url: URL.createObjectURL(blob), blob });
    } catch {
      setError("Не вдалося зібрати медитацію. Перевірте з’єднання й спробуйте ще раз.");
      setPhase("record");
    } finally {
      setProgress(null);
    }
  };

  const save = async () => {
    if (!result) return;
    setSaving(true);
    setError(null);
    const name = `${(title.trim() || "meditation").replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 60)}.mp3`;
    const err = await onDone(new File([result.blob], name, { type: "audio/mpeg" }), { hasMusic: !!layerSource(state.music) });
    setSaving(false);
    if (err) setError(err);
    else onClose();
  };

  // empty fields between filled ones are a mistake; empty fields after the last filled one are simply unused
  const lastFilled = parts.reduce((last, p, i) => (p.trim() ? i : last), -1);
  const gaps = parts.slice(0, lastFilled + 1).flatMap((p, i) => (p.trim() ? [] : [i]));

  const applyText = () => {
    if (gaps.length > 0) {
      setShowGaps(true);
      setTextPage(Math.floor(gaps[0] / TEXT_PAGE));
      const n = gaps.map((i) => i + 1);
      setError(`${n.length === 1 ? `Фрагмент ${n[0]} порожній` : `Фрагменти ${n.slice(0, -1).join(", ")} і ${n[n.length - 1]} порожні`}: заповніть або приберіть ✕.`);
      return;
    }
    const filled = parts.map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
    const t = filled.join("\n\n");
    if (t.length < 20) { setError("Додайте текст практики: хоча б одне речення."); return; }
    if (t.length > maxChars) { setError(`Текст практики задовгий: не більше ${maxChars} символів.`); return; }
    setError(null);
    setShowGaps(false);
    onTranscriptChange(t);
    const next = splitTranscript(t);
    setCur(Math.max(0, next.findIndex((f) => !state.takes[f.id])));
    setEditingText(false);
  };

  // pasting a whole text (with blank lines) into one field spreads it over the fields from there on
  const pasteInto = (i: number, e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData.getData("text");
    const pieces = splitTranscript(text).map((f) => f.text);
    if (pieces.length < 2) return;
    e.preventDefault();
    const next = [...parts.slice(0, i), ...Array(Math.max(0, i - parts.length)).fill(""), ...pieces, ...parts.slice(i + 1)];
    setParts(next);
    setSlots((n) => Math.max(n, slotsFor(next.length)));
    setError(null);
  };
  const setPart = (i: number, v: string) => {
    setParts((prev) => { const next = [...prev]; while (next.length <= i) next.push(""); next[i] = v; return next; });
    if (error) setError(null);
  };
  const removePart = (i: number) => setParts((prev) => prev.filter((_, k) => k !== i));
  const morePage = () => { setSlots((n) => n + TEXT_PAGE); setTextPage(slots / TEXT_PAGE); };
  const textPages = slots / TEXT_PAGE;
  const tp = Math.min(textPage, textPages - 1);
  // the next four open only when all four fields of this page are filled
  const pageFull = Array.from({ length: TEXT_PAGE }, (_, k) => (parts[tp * TEXT_PAGE + k] ?? "").trim()).every(Boolean);
  const textChars = parts.reduce((n, p) => n + p.trim().length, 0);

  // a background block: Sensoria tracks, the author's own file, volume and preview
  // background: one card, «Звуки» and «Музика» as tabs (each keeps its own choice, both go into the recording)
  const [bgTab, setBgTab] = useState<"sound" | "music">("sound");
  const trackName = (c: BgChoice) => (c.id === "own" ? "свій файл" : c.id ? findBackgroundTrack(c.id)?.label ?? "" : "");
  const backgroundCard = () => {
    const which = bgTab;
    const c = state[which];
    const tracks = which === "sound" ? SOUND_TRACKS : MUSIC_TRACKS;
    return (
      <section className={`${CARD} p-4`}>
        <div className="flex items-center justify-between gap-2">
          <div role="tablist" aria-label="Фон" className="flex rounded-full bg-[#f3efff] p-1">
            {(["sound", "music"] as const).map((w) => (
              <button key={w} type="button" role="tab" aria-selected={bgTab === w} onClick={() => setBgTab(w)} className={`min-h-[32px] rounded-full px-3.5 text-[13px] font-semibold transition ${bgTab === w ? "bg-white text-[#1f1b4d] shadow-sm" : "text-[#4a2fd0]"}`}>
                {w === "sound" ? "Звуки" : "Музика"}{state[w].id ? <span className="ml-1 text-[#22a35a]">●</span> : null}
              </button>
            ))}
          </div>
          {c.id && (
            <button type="button" onClick={() => void togglePreview(which)} disabled={bgPlaying === "loading"} className="inline-flex min-h-[32px] items-center gap-1.5 rounded-full bg-[#f3efff] px-3 text-[12px] font-semibold text-[#4a2fd0] hover:bg-[#ece9fe] disabled:opacity-60">
              {bgPlaying === "loading" ? "…" : bgPlaying === which ? <><Icon name="pause" size={14} /> Стоп</> : <><Icon name="play" size={14} /> Прослухати</>}
            </button>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <button type="button" aria-pressed={!c.id} onClick={() => setLayer(which, { id: null })} className={chipCls(!c.id)}>Без</button>
          {tracks.map((t) => (
            <button key={t.id} type="button" aria-pressed={c.id === t.id} onClick={() => setLayer(which, { id: t.id })} className={chipCls(c.id === t.id)}>{t.label}</button>
          ))}
          <label className={`${chipCls(c.id === "own")} inline-flex cursor-pointer items-center`}>
            {c.id === "own" && c.ownName ? `Свій: ${c.ownName.slice(0, 14)}` : "+ Свій файл"}
            <input type="file" accept="audio/*" className="sr-only" onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              if (file.size > 40 * 1024 * 1024) { setError("Фоновий файл до 40 МБ."); return; }
              setLayer(which, { id: "own", own: file, ownName: file.name });
            }} />
          </label>
        </div>
        {c.id && (
          <label className="mt-3 flex items-center gap-3 text-[12px] font-medium text-black/60">
            Гучність
            <input type="range" min={0.05} max={1} step={0.05} value={c.volume} onChange={(e) => setLayer(which, { volume: Number(e.target.value) })} className="flex-1 accent-[#5b3df5]" />
          </label>
        )}
        <p className="mt-2 text-[12px] text-black/50">У записі: {[trackName(state.sound) && `звук «${trackName(state.sound)}»`, trackName(state.music) && `музика «${trackName(state.music)}»`].filter(Boolean).join(", ") || "лише голос"}</p>
      </section>
    );
  };

  const pauseValue = isLast ? state.endPause : state.pauses[fragment?.id ?? ""] ?? STUDIO_DEFAULT_PAUSE;
  const setPause = (n: number) => { if (!fragment) return; if (isLast) set({ endPause: n }); else set({ pauses: { ...state.pauses, [fragment.id]: n } }); };

  return (
    <div role="dialog" aria-modal="true" aria-label="Студія запису медитації" className="fixed inset-0 z-[998] flex flex-col overflow-y-auto bg-[#f4f0ff] lg:overflow-hidden">
      <header className="shrink-0 border-b border-[#e4def9] bg-white/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1560px] flex-wrap items-center gap-3 px-4 py-2.5 sm:px-6">
          <button type="button" onClick={() => { if (recording) void finishRec(false); onClose(); }} className={SECONDARY}><span aria-hidden="true">←</span> До медитації</button>
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#4a2fd0]">Студія запису</div>
            <div className="truncate text-[15px] font-semibold text-[#1f1b4d]">{title.trim() || "Нова медитація"}</div>
          </div>
          {fragments.length > 0 && !editingText && (
            <div className="flex items-center gap-2 text-[13px] font-semibold text-[#2d2a5c]">
              <span className="rounded-full bg-white px-3 py-1.5 ring-1 ring-[#e4def9]">Записано {recordedCount} з {fragments.length}</span>
              <span className="rounded-full bg-white px-3 py-1.5 ring-1 ring-[#e4def9]">≈ {formatClock(total)}</span>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1560px] flex-1 flex-col px-4 pb-6 pt-6 sm:px-6 lg:min-h-0 lg:px-14 lg:pt-6">
        {error && (
          <p role="alert" className="fixed left-1/2 top-[72px] z-20 flex w-[min(92vw,720px)] -translate-x-1/2 items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-[14px] text-rose-800 shadow-[0_12px_30px_-16px_rgba(190,18,60,0.5)]">
            <span className="flex-1">{error}</span>
            <button type="button" onClick={() => setError(null)} aria-label="Закрити" className="shrink-0 text-rose-700 hover:text-rose-900">✕</button>
          </p>
        )}

        {editingText ? (
          <section className={`${CARD} my-auto flex w-full flex-col p-5 sm:p-7 ${SCREEN_H}`}>
            <div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-[20px] font-semibold text-[#1f1b4d]">Текст практики</h2>
                <p className="mt-1 text-[14px] leading-relaxed text-black/65">Кожне поле — один фрагмент: його ви прочитаєте за раз, а потім перейдете до наступного.<br />Можна вставити весь текст у перше поле, і студія сама розкладе його по фрагментах (абзаци розділяйте порожнім рядком).</p>
              </div>
              <span className="shrink-0 rounded-full bg-[#f3efff] px-3 py-1.5 text-[13px] font-semibold text-[#4a2fd0]">Фрагментів: {parts.filter((p) => p.trim()).length} · {textChars} з {maxChars}</span>
            </div>

            <ol className="mt-5 grid gap-4 md:grid-cols-2 lg:min-h-0 lg:flex-1 lg:grid-rows-2">
              {Array.from({ length: TEXT_PAGE }, (_, k) => {
                const i = tp * TEXT_PAGE + k;
                const p = parts[i] ?? "";
                const gap = showGaps && gaps.includes(i);
                return (
                  <li key={i} className={`flex h-[170px] flex-col rounded-2xl border p-3 lg:h-auto lg:min-h-0 focus-within:border-[#5b3df5] focus-within:bg-white ${gap ? "border-rose-400 bg-rose-50/60" : "border-[#e3def9] bg-[#faf9ff]"}`}>
                    <div className="flex items-center gap-2">
                      <span aria-hidden="true" className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#ece9fe] text-[13px] font-semibold text-[#4a2fd0]">{i + 1}</span>
                      <span className="flex-1 text-[12px] text-black/45">{p.trim().length} / {STUDIO_FRAGMENT_MAX_CHARS}</span>
                      {i <= lastFilled && (
                        <button type="button" onClick={() => removePart(i)} aria-label={`Прибрати фрагмент ${i + 1}`} className="grid h-8 w-8 place-items-center rounded-full text-[#6b6a85] transition hover:bg-rose-50 hover:text-rose-700">✕</button>
                      )}
                    </div>
                    <textarea
                      value={p}
                      maxLength={STUDIO_FRAGMENT_MAX_CHARS}
                      aria-label={`Фрагмент ${i + 1}`}
                      autoFocus={i === 0 && !p}
                      onChange={(e) => setPart(i, e.target.value)}
                      onPaste={(e) => pasteInto(i, e)}
                      placeholder={["Влаштуйтеся зручно. Можна сидіти або лежати…", "Зробіть повільний вдих і довгий видих…", "Зверніть увагу на тіло…"][i] ?? "Наступний фрагмент…"}
                      className="mt-2 min-h-0 w-full flex-1 resize-none bg-transparent text-[15px] leading-relaxed text-[#1d1a3b] placeholder:text-black/35 focus:outline-none"
                    />
                  </li>
                );
              })}
            </ol>

            <div className="mt-5 flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[#efeafd] pt-4">
              <div className="flex items-center gap-2">
                {fragments.length > 0 && <button type="button" onClick={() => { setError(null); setEditingText(false); }} className={SECONDARY}>Скасувати</button>}
                {recordedCount > 0 && <span className="text-[13px] text-amber-800">Змінені фрагменти доведеться перезаписати.</span>}
                {!pageFull && <span className="text-[13px] text-black/55">Наступні фрагменти відкриються, коли заповните ці чотири.</span>}
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setTextPage(tp - 1)} disabled={tp === 0} className={SECONDARY}>← Назад</button>
                <span className="px-1 text-[13px] font-semibold text-[#2d2a5c]">{tp + 1} з {textPages}</span>
                {/* only paging waits for a full page; recording is open from the first filled fragment */}
                {tp < textPages - 1 ? (
                  <button type="button" onClick={() => setTextPage(tp + 1)} disabled={!pageFull} title={pageFull ? undefined : "Спершу заповніть усі чотири фрагменти"} className={SECONDARY}>Далі →</button>
                ) : (
                  <button type="button" onClick={morePage} disabled={!pageFull} title={pageFull ? undefined : "Спершу заповніть усі чотири фрагменти"} className={SECONDARY}>+ Ще фрагменти</button>
                )}
                <button type="button" onClick={applyText} className={PRIMARY}>До запису →</button>
              </div>
            </div>
          </section>
        ) : phase === "listen" ? (
          <section className={`${CARD} mx-auto w-full max-w-[760px] p-6 text-center`}>
            <h2 className="text-[22px] font-semibold text-[#1f1b4d]">Ваша медитація</h2>
            {progress && (
              <div className="mt-6" role="status">
                <div className="h-2 overflow-hidden rounded-full bg-[#ece9fe]"><div className="h-full rounded-full bg-gradient-to-r from-[#5232f4] to-[#774eff] transition-all" style={{ width: `${Math.round(progress.share * 100)}%` }} /></div>
                <p className="mt-3 text-[14px] text-black/60">{progress.label} Не закривайте сторінку.</p>
              </div>
            )}
            {result && (
              <>
                <audio controls src={result.url} className="mt-6 w-full" />
                <p className="mt-3 text-[14px] text-black/60">{formatClock(total)} · {(result.blob.size / 1024 / 1024).toFixed(1)} МБ · MP3</p>
                <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
                  <button type="button" onClick={() => void save()} disabled={saving} className={PRIMARY}>{saving ? "Зберігаємо…" : "Зберегти в медитацію"}</button>
                  <button type="button" onClick={() => setPhase("record")} disabled={saving} className={SECONDARY}>Повернутися до запису</button>
                </div>
              </>
            )}
          </section>
        ) : (
          <div className={`my-auto grid w-full gap-5 lg:grid-cols-[minmax(0,1fr)_400px] ${SCREEN_H}`}>
            {/* teleprompter: one fragment at a time, ← → between them */}
            <section className={`${CARD} flex min-h-[420px] flex-col p-5 lg:h-full lg:min-h-0`}>
              <div className="flex shrink-0 items-center gap-3">
                <button type="button" onClick={() => go(idx - 1)} disabled={idx === 0 || recording} aria-label="Попередній фрагмент" className={ARROW}>←</button>
                <div className="min-w-0 flex-1 text-center">
                  <div className="text-[13px] font-semibold uppercase tracking-[0.12em] text-[#4a2fd0]">Фрагмент {idx + 1} з {fragments.length}</div>
                  {fragments.length <= 40 && (
                    <div className="mt-1.5 flex flex-wrap justify-center gap-1" aria-hidden="true">
                      {fragments.map((f, i) => (
                        <span key={f.id} onClick={() => go(i)} className={`h-2 cursor-pointer rounded-full transition-all ${i === idx ? "w-5 bg-[#5b3df5]" : state.takes[f.id] ? "w-2 bg-[#22a35a]" : "w-2 bg-[#ddd6fb]"}`} />
                      ))}
                    </div>
                  )}
                </div>
                <button type="button" onClick={() => go(idx + 1)} disabled={isLast || recording} aria-label="Наступний фрагмент" className={ARROW}>→</button>
              </div>

              <div className="my-3 flex min-h-0 flex-1 items-center justify-center overflow-hidden px-4 py-4 sm:px-10">
                <p aria-live="polite" className={`w-full min-w-0 text-center font-medium text-[#1f1b4d] [overflow-wrap:anywhere] ${promptSize(fragment?.text ?? "")}`}>{fragment?.text}</p>
              </div>

              <div className="flex shrink-0 flex-wrap items-center justify-center gap-2">
                {take ? (
                  <>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e8f6ee] px-3 py-1.5 text-[13px] font-semibold text-[#1d7a45]"><Icon name="check" size={14} /> Записано · {formatClock(takeSeconds(take))}</span>
                    <button type="button" onClick={() => playTake(fragment!.id)} disabled={recording} className="inline-flex min-h-[34px] items-center gap-1.5 rounded-full bg-[#f3efff] px-3 text-[13px] font-semibold text-[#4a2fd0] hover:bg-[#ece9fe] disabled:opacity-50">{playing === fragment!.id ? <><Icon name="pause" size={14} /> Стоп</> : <><Icon name="play" size={14} /> Прослухати</>}</button>
                  </>
                ) : (
                  <span className="rounded-full bg-[#f6f4ff] px-3 py-1.5 text-[13px] font-medium text-black/55">Ще не записано</span>
                )}
                <PausePicker label={isLast ? "Тиша в кінці" : "Пауза після"} value={pauseValue} onChange={setPause} disabled={recording} />
                <button type="button" onClick={openText} disabled={recording} className="inline-flex min-h-[34px] items-center gap-1.5 rounded-full border border-[#d9d4f5] bg-white px-3 text-[13px] font-semibold text-[#4a2fd0] hover:bg-[#f6f4ff] disabled:opacity-50"><Icon name="note" size={14} /> Змінити текст</button>
              </div>

              <div className="mt-4 flex shrink-0 flex-col items-center gap-2.5 border-t border-[#efeafd] pt-4">
                {recording ? (
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <button type="button" onClick={() => void finishRec(true)} className={`${PRIMARY} min-h-[52px] px-7 text-[16px]`}>
                      <span aria-hidden="true" className="h-2.5 w-2.5 animate-pulse rounded-full bg-rose-400" /> {formatClock(elapsed)} · Готово, далі →
                    </button>
                    <button type="button" onClick={() => void finishRec(false)} className={SECONDARY}>Скасувати</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => void startRec()} disabled={busy || !fragment} className={`${PRIMARY} min-h-[52px] px-7 text-[16px]`}>
                    {take ? <Icon name="refresh" size={18} /> : <span aria-hidden="true" className="h-3 w-3 rounded-full bg-rose-400" />}
                    {busy ? "Обробляємо…" : take ? "Перезаписати фрагмент" : "Записати фрагмент"}
                  </button>
                )}
                <p className="text-center text-[12px] text-black/55">Пробіл: почати й закінчити · ← →: між фрагментами · тишу до й після голосу студія прибирає сама</p>
              </div>
            </section>

            <aside className="flex flex-col gap-3 lg:h-full lg:min-h-0 lg:overflow-hidden">
              {backgroundCard()}
              <section className={`${CARD} p-4`}>
                <div className="flex items-center gap-3">
                  <h3 className="shrink-0 text-[15px] font-semibold text-[#1f1b4d]">Мікрофон</h3>
                  {micOn && <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[#ece9fe]" aria-hidden="true"><div ref={meterRef} className="h-full w-0 rounded-full transition-[width] duration-75" /></div>}
                  {!micOn && <span className="flex-1" />}
                  {!micOn && <button type="button" onClick={() => { setError(null); ensureMic().catch((e) => setError(e instanceof Error ? e.message : "Не вдалося увімкнути мікрофон.")); }} className="inline-flex min-h-[32px] items-center rounded-full bg-[#f3efff] px-3 text-[12px] font-semibold text-[#4a2fd0] hover:bg-[#ece9fe]">Перевірити</button>}
                </div>
                {micOn
                  ? <p ref={meterNoteRef} aria-live="polite" className="mt-1.5 text-[12px] text-black/60">Скажіть кілька слів…</p>
                  : <p className="mt-1.5 text-[12px] leading-snug text-black/55">Тиха кімната й 15–20 см до мікрофона звучать найкраще.</p>}
              </section>

              <section className={`${CARD} flex min-h-[150px] flex-1 flex-col overflow-hidden p-4 lg:min-h-0`} aria-label="Порада">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#4a2fd0]">Порада</span>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => showTip((t) => (t + TIPS.length - 1) % TIPS.length)} aria-label="Попередня порада" className="grid h-7 w-7 place-items-center rounded-full text-[#4a2fd0] hover:bg-[#f3efff]">‹</button>
                    <span className="text-[12px] text-black/45">{tip + 1}/{TIPS.length}</span>
                    <button type="button" onClick={() => showTip((t) => (t + 1) % TIPS.length)} aria-label="Наступна порада" className="grid h-7 w-7 place-items-center rounded-full text-[#4a2fd0] hover:bg-[#f3efff]">›</button>
                  </div>
                </div>
                <div className={`flex min-h-0 flex-1 items-center gap-3 transition-opacity duration-500 ease-in-out ${tipVisible ? "opacity-100" : "opacity-0"}`}>
                  <span aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#efeaff] to-[#e2dafd] text-[#4a2fd0]"><Icon name={TIPS[tip].icon} size={22} /></span>
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold text-[#1f1b4d]">{TIPS[tip].title}</div>
                    <p className="mt-0.5 text-[13px] leading-snug text-black/60">{TIPS[tip].text}</p>
                  </div>
                </div>
              </section>

              <section className={`${CARD} p-4`}>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[["Голос", formatClock(voicePlanned)], ["Паузи й фон", formatClock(planned - voicePlanned)], ["Разом", `≈ ${formatClock(planned)}`]].map(([label, value], k) => (
                    <div key={label} className={`rounded-xl px-2 py-2 ${k === 2 ? "bg-[#f3efff]" : "bg-[#faf9ff]"}`}>
                      <div className="text-[11px] font-medium text-black/50">{label}</div>
                      <div className={`text-[16px] font-semibold ${k === 2 ? "text-[#4a2fd0]" : "text-[#1f1b4d]"}`}>{value}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 mb-3 h-1.5 overflow-hidden rounded-full bg-[#ece9fe]" aria-hidden="true"><div className="h-full rounded-full bg-gradient-to-r from-[#22a35a] to-[#4cc581] transition-all" style={{ width: `${fragments.length ? Math.round((recordedCount / fragments.length) * 100) : 0}%` }} /></div>
                <button type="button" onClick={() => void buildAll()} disabled={!allRecorded || recording || busy} className={`${PRIMARY} min-h-[48px] w-full`}>Прослухати всю медитацію</button>
                <p className="mt-2 text-center text-[12px] text-black/55">
                  {allRecorded ? "Студія вирівняє гучність, прибере гул і збере все в один MP3." : `Залишилось записати: ${fragments.length - recordedCount}`}
                </p>
              </section>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}

// The pause after a fragment: a Sensoria chip that opens a small card of choices above it.
function PausePicker({ label, value, onChange, disabled }: { label: string; value: number; onChange: (n: number) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} disabled={disabled} aria-haspopup="listbox" aria-expanded={open} className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50 disabled:opacity-50 ${open ? "bg-[#ece9fe] text-[#4a2fd0]" : "bg-[#f3efff] text-[#4a2fd0] hover:bg-[#ece9fe]"}`}>
        <Icon name="pause" size={14} />
        {label}: <span className="font-semibold">{pauseLabel(value)}</span>
        <span className={`transition-transform ${open ? "rotate-180" : ""}`}><Icon name="chevron" size={14} /></span>
      </button>
      {open && (
        <div role="listbox" aria-label={label} className="absolute bottom-full left-1/2 z-30 mb-2 w-[244px] -translate-x-1/2 rounded-2xl border border-[#e4def9] bg-white p-2 shadow-[0_18px_40px_-18px_rgba(70,40,170,0.45)]">
          <div className="px-2 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#4a2fd0]">{label}</div>
          <div className="grid grid-cols-3 gap-1.5">
            {STUDIO_PAUSES.map((p) => {
              const on = p === value;
              return (
                <button key={p} type="button" role="option" aria-selected={on} onClick={() => { onChange(p); setOpen(false); }} className={`min-h-[36px] rounded-xl px-2 text-[13px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50 ${p === 0 ? "col-span-3" : ""} ${on ? "bg-gradient-to-r from-[#5232f4] to-[#774eff] text-white" : "bg-[#faf9ff] text-[#2d2a5c] hover:bg-[#f3efff]"}`}>
                  {pauseLabel(p)}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
