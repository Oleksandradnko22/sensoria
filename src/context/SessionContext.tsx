import { createContext, useContext } from "react";
import type { Profile } from "../lib/auth";

// Lets any component inside a dashboard read the real logged-in
// account (name/email) without threading it down as a prop through
// every intermediate section — App.tsx only sets this up at the two
// dashboard shells (AuthorDashboardPage, ParticipantDashboardPage),
// which already know the session is a non-null Profile by the time
// they render (App.tsx redirects to the login gate otherwise).
//
// `refreshProfile` exists so a save in ParticipantProfile/AuthorProfile
// (e.g. editing name) can push the updated row back up into App.tsx's
// session state — otherwise the top bar's name would keep showing the
// pre-edit value until the next full page load.
export type SessionValue = {
  profile: Profile;
  refreshProfile: (next: Profile) => void;
};

const SessionContext = createContext<SessionValue | null>(null);

export const SessionProvider = SessionContext.Provider;

export function useSession(): SessionValue | null {
  return useContext(SessionContext);
}
