import { useLayoutEffect, type RefObject } from "react";

// Stretches the filter panel down to the bottom of the FIRST ROW of cards (desktop only), so the panel and
// the first cards end on one line. Below the desktop breakpoint the panel is a drawer and is left alone.
// `deps` are the things that change the first row (the cards shown, the filters).
export function useFirstRowHeight(panelRef: RefObject<HTMLElement | null>, gridRef: RefObject<HTMLElement | null>, deps: unknown[]) {
  useLayoutEffect(() => {
    const panel = panelRef.current;
    const grid = gridRef.current;
    if (!panel || !grid || typeof window === "undefined") return;
    const desktop = window.matchMedia("(min-width: 1024px)");

    const apply = () => {
      panel.style.minHeight = "";
      const cards = [...grid.children] as HTMLElement[];
      if (!desktop.matches || cards.length === 0) return;
      const top = cards[0].getBoundingClientRect().top;
      // every card of the first row: the same top edge as the first card
      const rowBottom = Math.max(...cards.filter((c) => Math.abs(c.getBoundingClientRect().top - top) < 2).map((c) => c.getBoundingClientRect().bottom));
      const panelTop = panel.getBoundingClientRect().top;
      const wanted = rowBottom - panelTop;
      if (wanted > panel.offsetHeight) panel.style.minHeight = `${Math.ceil(wanted)}px`;
    };

    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(grid);
    desktop.addEventListener("change", apply);
    window.addEventListener("resize", apply);
    return () => {
      ro.disconnect();
      desktop.removeEventListener("change", apply);
      window.removeEventListener("resize", apply);
      panel.style.minHeight = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
