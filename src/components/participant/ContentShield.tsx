// The "shield" over paid content (2026-10-06) — guides and programs the
// person has access to; meditations are deliberately not shielded. Mount it
// inside any screen that shows such content. It paints NOTHING of its own
// while idle (no on-screen watermarks — those belong to downloaded copies
// only); it reacts:
//   - covers the content (blur + veil) for a moment when a capture
//     shortcut is seen (PrintScreen, Cmd+Shift+…, Win+Shift+S), and for as
//     long as the tab is hidden or the window has lost focus (many
//     screenshot / recording tools take the focus);
//   - cancels copy, cut, select-all, save, print, view-source, context
//     menu, text selection and dragging outside text fields, and makes the
//     page print blank.
//
// Limits, stated plainly (see utils/captureShield.ts): no web page can detect
// or forbid a screenshot or screen recording made by the operating system, a
// recorder that does not touch focus or the keyboard, or a phone camera.
// This is a deterrent that stops the common cases, not a lock.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { classifyKey, isEditableTarget, shouldCoverOnBlur } from "../../utils/captureShield";

const COVER_MS = 2500;

const SHIELD_CSS = `
html[data-sensoria-shield] body *:not(input):not(textarea):not([contenteditable="true"]) {
  -webkit-user-select: none !important; user-select: none !important; -webkit-touch-callout: none !important;
}
html[data-sensoria-shield] img { -webkit-user-drag: none; }
@media print { html[data-sensoria-shield] body { display: none !important; } }
`;

export default function ContentShield() {
  const [covered, setCovered] = useState(false);
  const coverTimer = useRef<number | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-sensoria-shield", "1");
    const coverBriefly = () => {
      setCovered(true);
      if (coverTimer.current) window.clearTimeout(coverTimer.current);
      coverTimer.current = window.setTimeout(() => setCovered(document.hidden || !document.hasFocus()), COVER_MS);
    };
    const editable = (t: EventTarget | null) =>
      t instanceof HTMLElement && isEditableTarget(t.tagName, t.isContentEditable);

    const clearClipboard = () => void navigator.clipboard?.writeText("").catch(() => {});
    const onKeyDown = (e: KeyboardEvent) => {
      const verdict = classifyKey(e, editable(e.target));
      if (verdict === "blocked") e.preventDefault();
      if (verdict === "capture") {
        coverBriefly();
        clearClipboard();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      // PrintScreen is often only seen on key-up; the clipboard then holds
      // the image — overwrite it.
      if (e.key === "PrintScreen") {
        coverBriefly();
        clearClipboard();
      }
    };
    const stop = (e: Event) => {
      if (!editable(e.target)) e.preventDefault();
    };
    const onBlur = () => {
      window.setTimeout(() => {
        if (shouldCoverOnBlur(document.activeElement?.tagName)) setCovered(true);
      }, 0);
    };
    const onFocus = () => setCovered(document.hidden);
    const onVisibility = () => setCovered(document.hidden);

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    document.addEventListener("contextmenu", stop, true);
    document.addEventListener("copy", stop, true);
    document.addEventListener("cut", stop, true);
    document.addEventListener("dragstart", stop, true);
    document.addEventListener("selectstart", stop, true);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.documentElement.removeAttribute("data-sensoria-shield");
      if (coverTimer.current) window.clearTimeout(coverTimer.current);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      document.removeEventListener("contextmenu", stop, true);
      document.removeEventListener("copy", stop, true);
      document.removeEventListener("cut", stop, true);
      document.removeEventListener("dragstart", stop, true);
      document.removeEventListener("selectstart", stop, true);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return createPortal(
    <>
      <style>{SHIELD_CSS}</style>
      {covered && (
        <div
          role="presentation"
          className="fixed inset-0 z-[10990] bg-white/90 backdrop-blur-3xl flex items-center justify-center text-[14px] text-black/50"
        >
          Вміст прихований, поки це вікно не активне
        </div>
      )}
    </>,
    document.body
  );
}
