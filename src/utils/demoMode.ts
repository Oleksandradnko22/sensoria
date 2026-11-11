// One switch for static demo content (demo programs, demo enrollments,
// demo messages). On by default; set VITE_SHOW_DEMO_PROGRAMS=false to hide
// it so a real user sees only their own data.
export const SHOW_DEMO = import.meta.env.VITE_SHOW_DEMO_PROGRAMS !== "false";

// The author cabinet is different: the showcase materials of a demo author (with their participants, income and
// events) must never be mixed into a real author's own list and totals. Off unless VITE_SHOW_AUTHOR_DEMO=true.
export const SHOW_AUTHOR_DEMO = import.meta.env.VITE_SHOW_AUTHOR_DEMO === "true";
