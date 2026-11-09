// The intro video is a YouTube link (uploaded by the author as «Приховане»); the page embeds it.
export function youtubeId(value: string): string | null {
  try {
    const u = new URL(value.trim());
    const host = u.hostname.replace(/^www\.|^m\./, "");
    if (host === "youtu.be") return /^[\w-]{11}$/.test(u.pathname.slice(1)) ? u.pathname.slice(1) : null;
    if (host !== "youtube.com") return null;
    if (u.pathname === "/watch") return u.searchParams.get("v") && /^[\w-]{11}$/.test(u.searchParams.get("v")!) ? u.searchParams.get("v") : null;
    const m = u.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]{11})(?![\w-])/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

export const isYoutubeUrl = (value: string): boolean => youtubeId(value) !== null;
