// The built-in demo catalog (sample programs, guides and meditations written for the showcase). Hidden in the live
// build: .env.production sets VITE_SHOW_DEMO_PROGRAMS=false. Shown in `npm run dev` and in the unit tests (Node has
// no import.meta.env), so the device preview and the tests keep working.
export const DEMO_CONTENT: boolean =
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_SHOW_DEMO_PROGRAMS !== "false";
