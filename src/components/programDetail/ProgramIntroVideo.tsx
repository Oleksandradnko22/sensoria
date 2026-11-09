// «Відео від автора» on the program page: a YouTube video shown as a poster first, so nothing from YouTube loads
// (and no cookies are set) until the visitor presses play; then the privacy-friendly youtube-nocookie player opens in place.
import { useState } from "react";
import { youtubeId } from "../../utils/youtube";

export default function ProgramIntroVideo({ url, title, author }: { url: string; title: string; author: string }) {
  const id = youtubeId(url);
  const [playing, setPlaying] = useState(false);
  // sharpest frame first (1280×720); older videos only have the smaller one, then no poster at all
  const [posterStep, setPosterStep] = useState(0);
  if (!id) return null;
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-[20px] bg-[#1c1a33]">
      {playing ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
          title={`Відео-презентація програми «${title}»`}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="absolute inset-0 h-full w-full border-0"
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          aria-label={`Дивитися відео-презентацію програми «${title}» від ${author}`}
          className="group absolute inset-0 flex items-center justify-center focus:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-white/80"
        >
          {posterStep < 2 && <img key={posterStep} src={`https://i.ytimg.com/vi/${id}/${posterStep === 0 ? "maxresdefault" : "hqdefault"}.jpg`} alt="" loading="lazy" onError={() => setPosterStep((n) => n + 1)} className="absolute inset-0 h-full w-full object-cover" />}
          <span aria-hidden="true" className="absolute inset-0 bg-black/15 transition-colors group-hover:bg-black/30" />
          <span aria-hidden="true" className="relative flex h-[68px] w-[68px] items-center justify-center rounded-full bg-[#4338ca] text-white shadow-[0_6px_24px_rgba(24,20,70,0.35)] transition-transform duration-200 motion-safe:group-hover:scale-110 sm:h-[76px] sm:w-[76px]">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" className="translate-x-[2px]"><path d="M8 5.5v13l11-6.5z" /></svg>
          </span>
        </button>
      )}
    </div>
  );
}
