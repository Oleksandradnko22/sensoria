// The presentation video of a program can be «the video from my profile». That choice is kept as a reserved tag next to the
// other reserved tags (ai-*, benefit:*), so no database change is needed. The tag never matches a category, so filters and
// labels ignore it. While it is set, the editor keeps the program's link in step with the author's current profile video.

import { isYoutubeUrl } from "./youtube.ts";

export const INTRO_PROFILE_TAG = "intro-profile";

export const usesProfileIntro = (tags?: readonly string[] | null): boolean => (tags ?? []).includes(INTRO_PROFILE_TAG);

/** Tags with the «video from profile» mark set or removed (never duplicated; other tags are kept as they were). */
export function withProfileIntro(tags: readonly string[], on: boolean): string[] {
  const rest = tags.filter((t) => t !== INTRO_PROFILE_TAG);
  return on ? [...rest, INTRO_PROFILE_TAG] : rest;
}

/**
 * The video shown on the public program page. A program marked «video from profile» follows the author's CURRENT profile
 * video; if that is gone (or not YouTube) the link saved with the program is used. Anything that is not a YouTube link is
 * never shown.
 */
export function resolveIntroVideo(opts: { tags?: readonly string[] | null; programUrl?: string | null; profileUrl?: string | null }): string | null {
  const profile = opts.profileUrl?.trim() ?? "";
  const own = opts.programUrl?.trim() ?? "";
  if (usesProfileIntro(opts.tags) && profile && isYoutubeUrl(profile)) return profile;
  return own && isYoutubeUrl(own) ? own : null;
}
