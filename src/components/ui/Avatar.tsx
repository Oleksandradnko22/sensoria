import { useState } from "react";
import { ownImage } from "../../lib/ownImage";
// Shared avatar circle — shows the real uploaded photo when present
// (profiles.avatar_url), falling back to the initials-on-gradient
// circle everywhere it's used (profile pages + both dashboard top
// bars). Previously each call site duplicated the initials-circle
// markup with no way to ever show a real photo at all.
type Props = {
  avatarUrl: string | null | undefined;
  initials: string;
  // Full set of size/text/color classes for the circle — kept as one
  // string since call sites vary (w-8 h-8 text-[13px] in the dashboard
  // top bar vs. w-16 h-16 text-[20px] text-white in profile forms).
  className: string;
};

export default function Avatar({ avatarUrl, initials, className }: Props) {
  const [broken, setBroken] = useState(false);
  // profiles.avatar_url is a client-writable column: only pictures from our own
  // storage are shown, never an arbitrary address (tracking pixel etc.).
  if (avatarUrl && !broken && ownImage(avatarUrl)) {
    return (
      <img
        src={avatarUrl}
        alt=""
        onError={() => setBroken(true)}
        className={`rounded-full object-cover shrink-0 ${className}`}
      />
    );
  }
  return (
    <div
      className={`rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center font-semibold shrink-0 ${className}`}
    >
      {initials}
    </div>
  );
}
