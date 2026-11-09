// One switch for static demo content (demo programs, demo enrollments,
// demo messages). On by default; set VITE_SHOW_DEMO_PROGRAMS=false to hide
// it so a real user sees only their own data.
export const SHOW_DEMO = import.meta.env.VITE_SHOW_DEMO_PROGRAMS !== "false";
