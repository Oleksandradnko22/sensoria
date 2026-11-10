// URL <-> page mapping. The app keeps its page in state (App.tsx); this only
// mirrors that state into the address bar so the browser's Back button and
// direct links work. Pages that need a session or in-memory funnel data
// (dashboards, the test funnel) share generic paths and open at a safe entry
// point on a direct visit.

export type Page =
  | "home"
  | "state-selection"
  | "test"
  | "result"
  | "registration"
  | "login"
  | "preparing"
  | "recommendation"
  | "program"
  | "catalog"
  | "program-detail"
  | "cart"
  | "guides"
  | "meditations"
  | "author-dashboard"
  | "participant-dashboard"
  | "author-auth"
  | "participant-auth"
  | "admin-dashboard"
  | "author-profile"
  | "contacts"
  | "terms"
  | "privacy"
  | "refunds"
  | "author-agreement"
  | "payment-result";

const FUNNEL: Page[] = ["state-selection", "test", "result", "registration", "login", "preparing", "recommendation", "program"];
const ACCOUNT: Page[] = ["author-dashboard", "participant-dashboard", "author-auth", "participant-auth", "admin-dashboard"];

// `entityId` is the author id for "author-profile" and the program id for "program-detail".
export function pathForPage(page: Page, entityId?: string | null): string {
  const authorId = entityId;
  if (page === "home") return "/";
  if (page === "program-detail") return entityId ? `/programs/${encodeURIComponent(entityId)}` : "/programs";
  if (page === "catalog") return "/programs";
  if (page === "cart") return "/cart";
  if (page === "guides") return "/guides";
  if (page === "meditations") return "/meditations";
  if (page === "contacts") return "/contacts";
  if (page === "terms") return "/terms";
  if (page === "privacy") return "/privacy";
  if (page === "refunds") return "/refunds";
  if (page === "author-agreement") return "/author-agreement";
  if (page === "payment-result") return "/payment-result";
  if (page === "author-profile") return authorId ? `/authors/${encodeURIComponent(authorId)}` : "/";
  if (FUNNEL.includes(page)) return "/start";
  if (ACCOUNT.includes(page)) return "/account";
  return "/";
}

export function pageForPath(pathname: string): { page: Page; authorId: string | null; programId: string | null } {
  const r = pageForPathBase(pathname);
  return { ...r, programId: r.page === "program-detail" ? r.authorId : null, authorId: r.page === "program-detail" ? null : r.authorId };
}

function pageForPathBase(pathname: string): { page: Page; authorId: string | null } {
  const path = pathname.replace(/\/+$/, "") || "/";
  const pm = /^\/programs\/([^/]+)$/.exec(path);
  if (pm) {
    try {
      return { page: "program-detail", authorId: decodeURIComponent(pm[1]) };
    } catch {
      return { page: "catalog", authorId: null };
    }
  }
  if (path === "/programs") return { page: "catalog", authorId: null };
  if (path === "/cart") return { page: "cart", authorId: null };
  if (path === "/guides") return { page: "guides", authorId: null };
  if (path === "/meditations") return { page: "meditations", authorId: null };
  if (path === "/contacts") return { page: "contacts", authorId: null };
  if (path === "/terms") return { page: "terms", authorId: null };
  if (path === "/privacy") return { page: "privacy", authorId: null };
  if (path === "/refunds") return { page: "refunds", authorId: null };
  if (path === "/author-agreement") return { page: "author-agreement", authorId: null };
  if (path === "/payment-result") return { page: "payment-result", authorId: null };
  if (path === "/start") return { page: "state-selection", authorId: null };
  const m = /^\/authors\/([^/]+)$/.exec(path);
  if (m) {
    try {
      return { page: "author-profile", authorId: decodeURIComponent(m[1]) };
    } catch {
      return { page: "home", authorId: null };
    }
  }
  // "/", "/account" (needs a session) and anything unknown open the home page.
  return { page: "home", authorId: null };
}
