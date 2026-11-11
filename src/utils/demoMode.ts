// One switch for static demo content (demo programs, demo enrollments,
// demo messages). On by default; set VITE_SHOW_DEMO_PROGRAMS=false to hide
// it so a real user sees only their own data.
export const SHOW_DEMO = import.meta.env.VITE_SHOW_DEMO_PROGRAMS !== "false";

// Demo showcase in the author cabinet (a demo author's materials, participants, income, events): kept ON for now,
// it shows how a full cabinet will look. Before real authors arrive set VITE_SHOW_AUTHOR_DEMO=false to hide it.
export const SHOW_AUTHOR_DEMO = import.meta.env.VITE_SHOW_AUTHOR_DEMO !== "false";
