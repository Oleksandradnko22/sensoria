// Turns any of the URL shapes an author might paste in (this is the
// same "paste your YouTube link" convention already used for module
// video in AuthorCourseEditor.tsx — see ModuleRow.videoUrl in
// data/authorDashboard.ts) into a plain embeddable
// https://www.youtube.com/embed/ID url for an <iframe>. Returns null
// for anything unrecognizable, so callers can fall back to a
// placeholder instead of rendering a broken embed.
export function getYouTubeEmbedUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./, "").replace(/^m\./, "");
  let id: string | null = null;

  if (host === "youtu.be") {
    id = parsed.pathname.split("/").filter(Boolean)[0] ?? null;
  } else if (host === "youtube.com" || host === "music.youtube.com") {
    if (parsed.pathname === "/watch") {
      id = parsed.searchParams.get("v");
    } else if (parsed.pathname.startsWith("/embed/")) {
      id = parsed.pathname.split("/embed/")[1]?.split("/")[0] ?? null;
    } else if (parsed.pathname.startsWith("/shorts/")) {
      id = parsed.pathname.split("/shorts/")[1]?.split("/")[0] ?? null;
    }
  } else {
    return null;
  }

  if (!id) return null;
  return `https://www.youtube.com/embed/${id}`;
}

// Bare video id, e.g. for the YouTube IFrame Player API (which takes
// an id, not a URL) — see lib/youtubePlayerApi.ts.
export function getYouTubeVideoId(url: string | null | undefined): string | null {
  const embedUrl = getYouTubeEmbedUrl(url);
  if (!embedUrl) return null;
  return embedUrl.split("/embed/")[1] ?? null;
}

// Real video thumbnail for the Lesson Player's pre-play poster state
// (ProgramExperience.tsx), instead of a flat dark placeholder — YouTube
// serves this at a predictable, no-auth-needed URL for any public video.
// hqdefault always exists (unlike maxresdefault, which 404s for older/
// lower-res uploads), so it's the safe default size to rely on here.
export function getYouTubeThumbnailUrl(url: string | null | undefined): string | null {
  const id = getYouTubeVideoId(url);
  if (!id) return null;
  return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
}
