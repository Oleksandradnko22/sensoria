import { useEffect, useRef } from "react";

// The two large blurred glow blobs behind the hero section drift
// slightly on scroll. This used to be `offset` state living on the
// top-level App component, updated on every single "scroll" event with
// no throttling — which meant every scroll pixel re-rendered the
// ENTIRE home page (hero, testimonial carousel, About, Programs, FAQ,
// Footer, Header — everything), since all of that is one big JSX tree
// owned by App. That's the actual source of the reported scroll lag,
// not any one animation.
//
// Fix: isolate the two blobs in their own component, read scroll
// position via refs, and write the transform directly to the DOM
// inside a requestAnimationFrame callback — no React state involved at
// all, so scrolling never triggers a re-render of anything, and the
// visual update is capped at once per frame instead of once per event.
export default function ParallaxBackground() {
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let ticking = false;

    const applyOffset = () => {
      const offset = window.scrollY;

      if (topRef.current) {
        topRef.current.style.transform = `translateY(${offset * 0.2}px)`;
      }

      if (bottomRef.current) {
        bottomRef.current.style.transform = `translateY(${
          offset * -0.2
        }px)`;
      }

      ticking = false;
    };

    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(applyOffset);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <>
      {/* blur-[120px] over a 500x500 box was very heavy to rasterize —
          Safari in particular is known to be slow compositing large
          `filter: blur()` regions, especially ones that extend past
          the clipped viewport (these sit at -200px offsets, so much of
          the blurred box is outside what's visible but still has to be
          rendered). That matches "solid color first, gradient/glow
          settles in over ~5s, every time, in Safari" better than
          anything else on this page. Cut the blur radius roughly in
          half and hinted `will-change-transform` so Safari promotes
          these to their own layer immediately at first paint instead
          of discovering it needs to mid-animation. */}
      <div
        ref={topRef}
        className="absolute top-[-200px] left-[-200px] w-[500px] h-[500px] bg-blue-400/15 rounded-full blur-[64px] will-change-transform"
      />
      <div
        ref={bottomRef}
        className="absolute bottom-[-200px] right-[-200px] w-[500px] h-[500px] bg-purple-400/15 rounded-full blur-[64px] will-change-transform"
      />
    </>
  );
}
