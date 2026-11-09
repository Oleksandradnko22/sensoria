// Is the YouTube video actually viewable? YouTube's public oEmbed answers 200 for «Не для всіх» (unlisted) and public
// videos and 401/403/404 for private, removed or embed-disabled ones — exactly the videos our player cannot show.
// A network / CORS failure is "unknown": it never blocks the author.

export type VideoAvailability = "ok" | "unavailable" | "unknown";

export async function checkYoutubeVideo(id: string, signal?: AbortSignal, fetchImpl: typeof fetch = fetch): Promise<VideoAvailability> {
  try {
    const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`;
    const res = await fetchImpl(url, { signal });
    if (res.ok) return "ok";
    if (res.status === 401 || res.status === 403 || res.status === 404) return "unavailable";
    return "unknown";
  } catch {
    return "unknown";
  }
}

export const UNAVAILABLE_VIDEO_MESSAGE =
  "YouTube не показує це відео: схоже, воно приватне або видалене. У YouTube Studio оберіть видимість «Не для всіх» і вставте посилання знову.";
