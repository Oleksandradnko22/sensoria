// Real saved audio position (meditation_audio_positions) for the one item
// shown as the primary card — only a CONFIRMED resumable position counts.
// null for any other kind, no user, or no resumable position.
import { useEffect, useState } from "react";
import { fetchMeditationAudioPosition, isResumablePosition } from "../../lib/meditationAudioPositions";

export function usePrimaryMeditationPosition(
  userId: string | undefined,
  kind: string | undefined,
  contentId: string | undefined
): number | null {
  const [position, setPosition] = useState<number | null>(null);
  useEffect(() => {
    if (!userId || kind !== "meditation" || !contentId) {
      setPosition(null);
      return;
    }
    let cancelled = false;
    fetchMeditationAudioPosition(contentId, userId)
      .then((pos) => {
        if (!cancelled) setPosition(isResumablePosition(pos) ? pos!.positionSeconds : null);
      })
      .catch(() => {
        if (!cancelled) setPosition(null);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, kind, contentId]);
  return position;
}
