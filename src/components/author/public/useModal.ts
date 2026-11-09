// Shared behaviour of the profile's modal dialogs: focus moves in and is returned
// to the opener, Tab stays inside, Esc closes, page scroll is locked. `onKey`
// gets every other key (e.g. arrows in a gallery).
import { useEffect, useRef, type RefObject } from "react";

export function useModal(root: RefObject<HTMLElement | null>, onClose: () => void, onKey?: (e: KeyboardEvent) => void) {
  const close = useRef(onClose);
  const key = useRef(onKey);
  close.current = onClose;
  key.current = onKey;
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const focusables = () => Array.from(root.current?.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]") ?? []);
    (root.current?.querySelector<HTMLElement>("[data-autofocus]") ?? focusables()[0])?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") return close.current();
      if (e.key === "Tab") {
        const f = focusables();
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        return;
      }
      key.current?.(e);
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = prev;
      opener?.focus?.();
    };
  }, [root]);
}
