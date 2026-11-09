import { useEffect, useState } from "react";
import { fetchProgramIntroVideo } from "../../lib/publicContent";
import { fetchAuthorStory } from "../../lib/authorStory";
import { resolveIntroVideo, usesProfileIntro } from "../../utils/introVideoSource";

// The presentation video of a real program: the saved link, or (when the author chose «video from my profile») the
// author's current profile video, so changing it in the profile updates every such program at once.
export function useProgramIntroVideo(programId: string | undefined, authorId: string | undefined, tags: readonly string[] | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  const fromProfile = usesProfileIntro(tags);
  useEffect(() => {
    setUrl(null);
    if (!programId || !authorId) return;
    let alive = true;
    (async () => {
      const [programUrl, story] = await Promise.all([
        fetchProgramIntroVideo(programId).catch(() => null),
        fromProfile ? fetchAuthorStory(authorId).catch(() => null) : Promise.resolve(null),
      ]);
      if (!alive) return;
      const profileUrl = story?.media?.kind === "video" ? story.media.url : null;
      setUrl(resolveIntroVideo({ tags: fromProfile ? tags : [], programUrl, profileUrl }));
    })();
    return () => { alive = false; };
  }, [programId, authorId, fromProfile]); // eslint-disable-line react-hooks/exhaustive-deps
  return url;
}
