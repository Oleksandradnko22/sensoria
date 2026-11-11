// One switch for static demo content (demo programs, demo enrollments,
// demo messages). On by default; set VITE_SHOW_DEMO_PROGRAMS=false to hide
// it so a real user sees only their own data.
export const SHOW_DEMO = import.meta.env.VITE_SHOW_DEMO_PROGRAMS !== "false";

// Demo showcase in the author cabinet (a demo author's materials, participants, income, events): kept ON for now,
// it shows how a full cabinet will look. Before real authors arrive set VITE_SHOW_AUTHOR_DEMO=false to hide it.
// Preview of a brand-new author's empty cabinet: add ?nodemo to the address (e.g. /author?nodemo); it stays on while
// you move around the cabinet in this tab, a reload without it brings the showcase back.
const NO_DEMO_PREVIEW = (() => {
  try {
    if (typeof window === "undefined") return false;
    if (new URLSearchParams(window.location.search).has("nodemo")) sessionStorage.setItem("sensoria-nodemo", "1");
    else sessionStorage.removeItem("sensoria-nodemo");
    return sessionStorage.getItem("sensoria-nodemo") === "1";
  } catch {
    return false;
  }
})();
export const SHOW_AUTHOR_DEMO = import.meta.env.VITE_SHOW_AUTHOR_DEMO !== "false" && !NO_DEMO_PREVIEW;
