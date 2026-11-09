// «Кілька слів від мене»: the author's introduction as a real, inline media
// player. Left — a 16:9 player whose poster is the REAL thumbnail of the
// author's own video (YouTube frame; Vimeo via its public oEmbed); never the
// profile portrait, never a stock image. Play starts the embed right here
// (the site's existing youtube-nocookie / Vimeo embed), so the visitor stays on
// the page. Right — a short introduction (play is the button on the player).
// States: poster → loading (until the embed reports load) → playing; if the
// embed does not load in time, an error with a retry and a link to the source.
// Only one introduction plays at a time (a window event stops the others).
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { parseVideoUrl } from "../../../utils/authorPosts";
import SectionLabel from "./SectionLabel";
import { PT } from "./profileType";
import { durationLabel, type StoryMedia } from "../../../utils/authorStory";

const PLAY_EVENT = "sensoria:media-play";
const LOAD_TIMEOUT_MS = 12000;
const DEFAULT_COPY = "Розповім трохи про себе, свій досвід і те, що для мене важливо в роботі з емоційним добробутом.";

function PlayIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5.5v13l11-6.5z" />
    </svg>
  );
}

// Real thumbnail of the author's video. YouTube: the 16:9 maxres frame, else the
// standard one (object-cover trims its letterbox), else none. Vimeo: the
// thumbnail from its public oEmbed. No portrait / stock image as a fallback:
// without a thumbnail the player is a plain dark panel with the play button.
function useVideoThumb(provider: "youtube" | "vimeo", id: string, url: string, enabled: boolean) {
  const [src, setSrc] = useState<string | null>(null);
  const [step, setStep] = useState(0);

  useEffect(() => {
    setStep(0);
    if (!enabled) {
      setSrc(null);
      return;
    }
    if (provider === "youtube") {
      setSrc(`https://i.ytimg.com/vi/${id}/maxresdefault.jpg`);
      return;
    }
    setSrc(null);
    const ctl = new AbortController();
    fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}&width=1280`, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setSrc(j && typeof j.thumbnail_url === "string" && /^https:\/\//.test(j.thumbnail_url) ? (j.thumbnail_url as string) : null))
      .catch(() => setSrc(null));
    return () => ctl.abort();
  }, [provider, id, url, enabled]);

  const onError = useCallback(() => {
    if (provider === "youtube" && step === 0) {
      setStep(1);
      setSrc(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`);
    } else {
      setSrc(null);
    }
  }, [provider, id, step]);

  return { src, onError };
}

export default function AuthorVideoIntro({ media, name }: { media: StoryMedia; name: string }) {
  const uid = useId();
  const dur = durationLabel(media.duration);
  const isAudio = media.kind === "audio";
  const v = isAudio ? null : parseVideoUrl(media.url);

  const [playing, setPlaying] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [audioFailed, setAudioFailed] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const thumb = useVideoThumb(v?.provider ?? "youtube", v?.id ?? "", v?.url ?? "", !!v);

  // one playback at a time
  useEffect(() => {
    const onOther = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== uid) {
        setPlaying(false);
        setLoaded(false);
        setFailed(false);
      }
    };
    window.addEventListener(PLAY_EVENT, onOther);
    return () => window.removeEventListener(PLAY_EVENT, onOther);
  }, [uid]);

  // the embed must report load in time, otherwise show the error state
  useEffect(() => {
    if (!playing || loaded || failed) return;
    const t = window.setTimeout(() => setFailed(true), LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, [playing, loaded, failed]);

  const start = useCallback(() => {
    window.dispatchEvent(new CustomEvent(PLAY_EVENT, { detail: uid }));
    setFailed(false);
    setLoaded(false);
    setPlaying(true);
  }, [uid]);

  useEffect(() => {
    if (playing && !failed) frameRef.current?.focus();
  }, [playing, failed]);

  if (!isAudio && !v) return null;
  const sourceName = v?.provider === "vimeo" ? "Vimeo" : "YouTube";
  const src = v ? `${v.embedUrl}${v.embedUrl.includes("?") ? "&" : "?"}autoplay=1` : "";

  const stage = isAudio ? (
    <div className="aspect-video w-full rounded-[20px] bg-[#eceeff] flex items-center justify-center p-5">
      {audioFailed ? (
        <p role="alert" className="text-[14px] text-black/60">Не вдалося завантажити запис. Спробуйте пізніше.</p>
      ) : (
        <audio controls preload="metadata" src={media.url} onError={() => setAudioFailed(true)} aria-label={`Аудіознайомство: ${name}`} className="w-full" />
      )}
    </div>
  ) : (
    <div ref={stageRef} className="group relative aspect-video w-full rounded-[20px] overflow-hidden bg-[#1c1a33]">
      {playing && !failed && (
        <iframe
          ref={frameRef}
          src={src}
          title={`Відеознайомство: ${name}`}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={() => setLoaded(true)}
          className="absolute inset-0 w-full h-full border-0"
        />
      )}

      {!playing && (
        <>
          {thumb.src && <img src={thumb.src} alt="" loading="lazy" onError={thumb.onError} className="absolute inset-0 w-full h-full object-cover" />}
          <span aria-hidden className="absolute inset-0 bg-black/15 transition-colors group-hover:bg-black/30" />
          <button
            type="button"
            onClick={start}
            aria-label={`Відтворити відеознайомство${dur ? `, ${dur}` : ""}`}
            className="absolute inset-0 flex items-center justify-center focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-white/80"
          >
            <span className="w-[68px] h-[68px] sm:w-[76px] sm:h-[76px] rounded-full bg-[#4338ca] text-white flex items-center justify-center shadow-[0_6px_24px_rgba(24,20,70,0.35)] transition-transform duration-200 motion-safe:group-hover:scale-110 motion-safe:group-active:scale-95">
              <span className="translate-x-[2px]"><PlayIcon size={28} /></span>
            </span>
          </button>
          <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/55 backdrop-blur-sm text-white text-[12px] font-medium px-3 py-1">Відеознайомство</span>
          {dur && <span className="pointer-events-none absolute right-3 top-3 rounded-md bg-black/55 backdrop-blur-sm text-white text-[12px] font-medium tabular-nums px-2 py-1">{dur}</span>}
        </>
      )}

      {playing && !loaded && !failed && (
        <div role="status" aria-live="polite" className="absolute inset-0 flex items-center justify-center bg-[#1c1a33] text-white/80 text-[14px] pointer-events-none">
          <span aria-hidden className="mr-3 h-5 w-5 rounded-full border-2 border-white/30 border-t-white motion-safe:animate-spin" />
          Завантажуємо відео…
        </div>
      )}

      {playing && failed && (
        <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#1c1a33] px-6 text-center text-white">
          <p className="text-[14px] text-white/80">Не вдалося завантажити відео.</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button type="button" onClick={start} className="min-h-[44px] rounded-full bg-white text-[#4338ca] text-[14px] font-medium px-5 focus-visible:outline-none focus-visible:ring-2 ring-white ring-offset-2 ring-offset-[#1c1a33]">
              Спробувати ще раз
            </button>
            {v && (
              <a href={v.url} target="_blank" rel="noopener noreferrer" className="text-[14px] underline underline-offset-4 text-white/80 hover:text-white">
                Відкрити на {sourceName}
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,60fr)_minmax(0,40fr)] md:gap-10 md:items-center">
      {stage}
      <div className="min-w-0 flex flex-col items-start gap-3">
        <SectionLabel>Познайомимось ближче</SectionLabel>
        <h3 className={`${PT.display} text-black/90`}>Кілька слів від мене</h3>
        <p className="text-[16px] leading-[1.7] text-black/65 break-words max-w-[40ch]">{media.caption || DEFAULT_COPY}</p>
        {isAudio && dur && <span className="text-[14px] text-black/55 tabular-nums">Аудіо · {dur}</span>}
      </div>
    </div>
  );
}
