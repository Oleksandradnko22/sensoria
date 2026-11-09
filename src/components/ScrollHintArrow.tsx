import { useEffect, useState } from "react";

// A quiet "there is more below" hint at the bottom of the hero. Decorative
// only: not clickable and not focusable. Isolated from App so the scroll
// listener only re-renders this tiny arrow (rAF-throttled); hidden on phones
// and once the visitor has scrolled.
export default function ScrollHintArrow() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    let ticking = false;

    const handleScroll = () => {
      if (ticking) return;
      ticking = true;

      requestAnimationFrame(() => {
        setVisible(window.scrollY <= 100);
        ticking = false;
      });
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div
      aria-hidden="true"
      className={`hidden md:block pointer-events-none select-none absolute left-1/2 -translate-x-1/2 bottom-12 lg:bottom-14 transition-opacity duration-300 text-white/70 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
        <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
