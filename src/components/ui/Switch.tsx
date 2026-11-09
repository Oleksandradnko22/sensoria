// Shared toggle switch — used by both AuthorSettings and
// ParticipantProfile. Flexbox + padding for the track/knob layout
// (rather than absolute-positioned knob with manual translate math),
// which renders reliably across browsers.
// `touch` adds a 44px hit area around the 44x24 track (opt-in, so the
// existing author cabinet layout stays exactly as it was).
export default function Switch({
  on,
  onClick,
  disabled = false,
  label,
  touch = false,
}: {
  on: boolean;
  onClick: () => void;
  disabled?: boolean;
  label?: string;
  touch?: boolean;
}) {
  const track = (
    <span
      className={`inline-flex items-center w-11 h-6 p-0.5 rounded-full shrink-0 transition-colors duration-200 ${
        on ? (touch ? "bg-emerald-600" : "bg-emerald-500") : touch ? "bg-black/25" : "bg-black/15"
      }`}
    >
      <span
        className={`w-5 h-5 rounded-full bg-white transition-transform duration-200 ${
          on ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </span>
  );
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={
        touch
          ? "shrink-0 min-h-[44px] min-w-[52px] flex items-center justify-center rounded-full disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-[#4338ca]"
          : "inline-flex shrink-0 border-0 disabled:opacity-50 disabled:cursor-not-allowed"
      }
    >
      {track}
    </button>
  );
}
