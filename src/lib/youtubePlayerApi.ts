// Loads YouTube's IFrame Player API script exactly once, however many
// components ask for it — needed (instead of a plain <iframe src=...>)
// so ProgramExperience.tsx can read the real playback position for
// "Повернутися пізніше" (resume-from-timestamp) via player.getCurrentTime().
// The script itself calls a global window.onYouTubeIframeAPIReady once
// loaded, per YouTube's own (non-Promise) API contract — this wraps
// that in a cached Promise so every caller just awaits the same thing.

export type YouTubePlayer = {
  getCurrentTime(): number;
  getDuration(): number;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  destroy(): void;
};

export type YouTubePlayerOptions = {
  videoId: string;
  playerVars?: Record<string, string | number>;
  events?: {
    onReady?: (event: { target: YouTubePlayer }) => void;
    onStateChange?: (event: { data: number; target: YouTubePlayer }) => void;
  };
};

type YouTubeApi = {
  Player: new (elementId: string | HTMLElement, options: YouTubePlayerOptions) => YouTubePlayer;
  PlayerState: { ENDED: number; PLAYING: number; PAUSED: number };
};

declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YouTubeApi> | null = null;

export function loadYouTubeIframeApi(): Promise<YouTubeApi> {
  if (apiPromise) return apiPromise;

  apiPromise = new Promise((resolve) => {
    if (window.YT?.Player) {
      resolve(window.YT);
      return;
    }
    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      resolve(window.YT!);
    };
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(script);
    }
  });

  return apiPromise;
}
