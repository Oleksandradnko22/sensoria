// Rules for the screen-capture / copy deterrents on paid content
// (2026-10-06). Pure so they are unit-tested (utils/captureShield.test.ts);
// components/participant/ContentShield.tsx only wires them to the browser.
//
// Honest scope: a web page cannot stop the operating system from taking a
// screenshot or recording the screen — there is no browser API for either.
// What a page CAN do is react to the things that usually come with a capture
// (a capture shortcut, the window losing focus, the tab being hidden) by
// covering the content at that moment, and switch off copy / save / print /
// select / drag. That is what these rules drive. A capture tool that does not
// touch the keyboard or the window focus (a phone camera, some recorders) is
// not seen.

export type KeyInfo = {
  key: string;
  code?: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
};

export type KeyVerdict = "capture" | "blocked" | null;

// "capture": looks like a screenshot / recording shortcut → cover the content.
// "blocked": a save / print / copy-style shortcut → cancel it.
export function classifyKey(e: KeyInfo, targetIsEditable: boolean): KeyVerdict {
  const key = e.key;
  if (key === "PrintScreen" || key === "Snapshot") return "capture";
  // macOS Cmd+Shift+3/4/5/6 and Windows Win+Shift+S: the OS grabs the
  // digit/S key itself and the page may never see it, but it does see the two
  // modifiers go down together — so cover as soon as Meta+Shift are held.
  if (e.metaKey && e.shiftKey) return "capture";

  const mod = e.ctrlKey || e.metaKey;
  if (!mod) return null;
  const k = key.toLowerCase();
  if (k === "p" || k === "s" || k === "u") return "blocked"; // print, save, view-source
  if ((k === "c" || k === "x" || k === "a") && !targetIsEditable) return "blocked"; // copy, cut, select-all
  return null;
}

export function isEditableTarget(tagName: string | undefined, isContentEditable: boolean | undefined): boolean {
  const tag = (tagName ?? "").toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || Boolean(isContentEditable);
}

// A blur caused by clicking INTO an iframe (the native PDF fallback) is not
// the person leaving — don't cover the content for it.
export function shouldCoverOnBlur(activeElementTag: string | undefined): boolean {
  return (activeElementTag ?? "").toUpperCase() !== "IFRAME";
}
