// Abstract support artwork for the Help header: a question bubble, a document
// and a lifebuoy in the blue–lavender–violet palette. Decorative only.
export default function HelpIllustration({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 170" aria-hidden="true" focusable="false" className={className} fill="none">
      <defs>
        <linearGradient id="hi-bubble" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8b9cff" />
          <stop offset="1" stopColor="#6d4df2" />
        </linearGradient>
        <linearGradient id="hi-ring" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7c6cf6" />
          <stop offset="1" stopColor="#b57bf0" />
        </linearGradient>
      </defs>
      <ellipse cx="170" cy="140" rx="120" ry="22" fill="#e6e8fb" />
      <circle cx="60" cy="70" r="46" fill="#eceeff" />
      <circle cx="262" cy="50" r="34" fill="#f1eaff" />
      {/* document */}
      <rect x="150" y="26" width="78" height="96" rx="14" fill="#fff" stroke="#d9dcf7" />
      <rect x="164" y="44" width="50" height="7" rx="3.5" fill="#c9cdf5" />
      <rect x="164" y="60" width="50" height="7" rx="3.5" fill="#dcdff8" />
      <rect x="164" y="76" width="34" height="7" rx="3.5" fill="#dcdff8" />
      {/* question bubble */}
      <path d="M64 34h52a16 16 0 0 1 16 16v34a16 16 0 0 1-16 16H92l-18 16v-16h-10a16 16 0 0 1-16-16V50a16 16 0 0 1 16-16Z" fill="url(#hi-bubble)" />
      <text x="90" y="82" textAnchor="middle" fontSize="40" fontWeight="700" fill="#fff" fontFamily="Inter, system-ui, sans-serif">?</text>
      {/* lifebuoy */}
      <circle cx="244" cy="108" r="32" fill="url(#hi-ring)" />
      <circle cx="244" cy="108" r="15" fill="#f6f4ff" />
      <path d="M233 97l-8-8M255 97l8-8M233 119l-8 8M255 119l8 8" stroke="#fff" strokeWidth="6" strokeLinecap="round" opacity=".85" />
      <circle cx="286" cy="26" r="3" fill="#b9a8ff" />
      <circle cx="132" cy="14" r="2.5" fill="#9fb0ff" />
    </svg>
  );
}
