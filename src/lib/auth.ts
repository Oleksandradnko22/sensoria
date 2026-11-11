// Thin wrapper around Supabase Auth — the actual account/credential
// store, replacing the earlier mock where "registering" just filled in
// form state and moved to the next page. Role/name are passed as
// signUp() metadata; the public.handle_new_user() trigger in
// supabase/schema.sql reads that metadata to create the matching
// profiles row server-side (see that file's comments for why it's a
// trigger and not a client-side insert).

import { fetchMyPrivateProfile } from "./privateProfile.ts";
import { supabase, createIsolatedClient } from "./supabaseClient.ts";
import { removeCurrentDeviceSession } from "./deviceSessions.ts";
import type { UserRole } from "../utils/session.ts";
import { LEGAL } from "../data/legalOperator.ts";
import { uploadContentFile, deleteContentFile } from "./storage.ts";

export type Profile = {
  id: string;
  role: UserRole;
  name: string;
  email: string;
  // Public URL of the uploaded profile photo, or null — see schema.sql's
  // comment on profiles.avatar_url. Null renders as the initials circle
  // everywhere (getInitials below).
  avatarUrl: string | null;
  // Sensoria's own team — see schema.sql. Gates the "Адмін-панель" entry
  // point in the dashboard shells; never settable by the person
  // themselves.
  isAdmin: boolean;
  memberSince: string;
  // Set the moment deleteAccount() was called — null means not pending
  // deletion. See RestoreAccountStep.tsx / restoreAccount() below and
  // schema.sql's comment on the column for the full 14-day-window
  // design.
  deletionRequestedAt: string | null;
};

// Consistent "initials from a name" logic wherever an avatar circle
// needs one — was previously duplicated as ad-hoc mock data
// (authorProfile.avatarInitials / participantProfile.avatarInitials);
// deriving it from the real name keeps it correct after a profile edit
// without a separate field to keep in sync.
export function getInitials(name: string, fallback = "?"): string {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return initials || fallback;
}

function requireSupabase() {
  if (!supabase) {
    throw new Error(
      "Supabase не налаштований — перевірте .env.local (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)."
    );
  }
  return supabase;
}

export async function registerAccount(
  role: UserRole,
  name: string,
  email: string,
  password: string
): Promise<void> {
  const client = requireSupabase();
  // The consent checkbox is required on every registration form; the
  // handle_new_user() trigger stores the accepted edition (legal_consents).
  const { error } = await client.auth.signUp({
    email,
    password,
    options: { data: { role, name, consent_version: LEGAL.edition, age_confirmed: "true" } },
  });
  if (error) throw error;
}

// Google sign-up: consent travels through the redirect (oauth_consent) and is
// stored on return, once there is a session.
export async function recordConsent(version: string): Promise<void> {
  if (!supabase) return;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("legal_consents").upsert(
    ["terms", "privacy", "age_18"].map((document) => ({
      user_id: user.id,
      document,
      version,
    })),
    { onConflict: "user_id,document,version", ignoreDuplicates: true }
  );
}

export async function loginAccount(email: string, password: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function logoutAccount(): Promise<void> {
  if (!supabase) return;
  await removeCurrentDeviceSession().catch(() => undefined); // best effort, before the session is gone
  await supabase.auth.signOut();
}

// Supabase's own error strings, translated to the app's Ukrainian copy.
// Falls back to the raw message for anything not covered here. Used by
// every real login/register form in the app (DashboardAuthPage, and
// the assessment funnel's RegisterPage/LoginPage) — pulled out here so
// there's one translation table instead of three copies drifting apart.
export function translateAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("already registered") || m.includes("already exists")) {
    return "Акаунт з таким email вже існує. Спробуйте увійти.";
  }
  if (m.includes("invalid login credentials")) {
    return "Невірний email або пароль.";
  }
  if (m.includes("email not confirmed")) {
    return "Email ще не підтверджено — перевірте пошту.";
  }
  if (m.includes("rate limit")) {
    return "Supabase тимчасово обмежив кількість листів підтвердження (ліміт вбудованої безкоштовної пошти). Зачекайте кілька хвилин, або вимкніть підтвердження email в Authentication → Settings, поки тестуєте.";
  }
  if (m.includes("password should be at least")) {
    return "Пароль закороткий.";
  }
  return message;
}

// Google sign-in redirects the whole page to Google and back — there's
// no synchronous "logged in now" callback the way email/password has.
// The intended role travels through as a query param on the redirect
// URL (App.tsx's boot effect reads it back on return and reconciles it
// against whatever role the sign-up trigger just defaulted to).
export async function loginWithGoogle(role: UserRole, consented = false): Promise<void> {
  const client = requireSupabase();
  const consent = consented ? `&oauth_consent=${encodeURIComponent(LEGAL.edition)}` : "";
  const redirectTo = `${window.location.origin}${window.location.pathname}?oauth_role=${role}${consent}`;
  const { error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });
  if (error) throw error;
}

// Called once, right after an OAuth redirect back into the app. The
// sign-up trigger (supabase/schema.sql) always defaults a brand-new
// OAuth account to role='participant' — Google has no concept of
// "which Sensoria role did you mean to pick." This fixes that up to
// the role the person actually clicked through on, but *only* for a
// genuinely brand-new account (created_at ≈ last_sign_in_at) — an
// existing account's role is never silently reassigned by a stray
// click on the wrong button; the caller shows the usual
// "wrong role, use the other form" error instead in that case.
export async function reconcileOAuthRole(intendedRole: UserRole): Promise<Profile | null> {
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const profile = await fetchCurrentProfile();
  if (!profile || profile.role === intendedRole) return profile;

  const createdAt = new Date(user.created_at).getTime();
  const lastSignInAt = user.last_sign_in_at
    ? new Date(user.last_sign_in_at).getTime()
    : createdAt;
  const isFreshAccount = Math.abs(lastSignInAt - createdAt) < 10_000;
  if (!isFreshAccount) return profile;

  await supabase.from("profiles").update({ role: intendedRole }).eq("id", user.id);
  if (intendedRole === "author") {
    await supabase.from("author_details").upsert({ profile_id: user.id });
  }
  return fetchCurrentProfile();
}

// Reads the currently authenticated user's profile row. Null if nobody
// is logged in (or Supabase isn't configured yet — the app should fall
// back to its existing mock data in that case, not crash).
export async function fetchCurrentProfile(): Promise<Profile | null> {
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, role, name, avatar_url, is_admin, member_since"
    )
    .eq("id", user.id)
    .single();
  if (error || !data) return null;
  // email, ban and deletion flags are private: read through my_private_profile (lib/privateProfile.ts)
  const priv = await fetchMyPrivateProfile(user.id);
  if (!priv) return null;
  const { email, is_banned, deletion_requested_at } = priv;

  // Simplest real enforcement of a ban for now: treat it exactly like
  // not being logged in at all, rather than building a dedicated
  // "you've been banned" screen this pass.
  if (is_banned) {
    await supabase.auth.signOut();
    return null;
  }

  // Self-heal profiles.email against auth.users.email (the real login
  // credential) instead of trusting whatever's stored in the row.
  // Supabase's "secure email change" only flips auth.users.email once
  // the person clicks the confirmation link in the NEW address —
  // updateEmail() below no longer writes profiles.email itself, so
  // this is the one place that value gets persisted, always from the
  // authoritative source, only once confirmation has actually
  // happened. Fire-and-forget: the object returned below already uses
  // the authoritative value either way, this just saves it for next
  // time so the row doesn't stay stale.
  const authoritativeEmail = user.email ?? email;
  if (authoritativeEmail !== email) {
    void supabase.from("profiles").update({ email: authoritativeEmail }).eq("id", user.id);
  }

  // Deliberately NOT signed out here, unlike is_banned above — a
  // pending-deletion account still needs to be able to log in so the
  // person can reach the "Відновити акаунт?" screen at all. The actual
  // gating (showing that screen instead of the normal dashboard)
  // happens at the call sites: App.tsx's boot effect, LoginPage.tsx,
  // DashboardAuthPage.tsx.
  return {
    id: data.id,
    role: data.role,
    name: data.name,
    email: authoritativeEmail,
    avatarUrl: data.avatar_url,
    isAdmin: data.is_admin,
    memberSince: data.member_since,
    deletionRequestedAt: deletion_requested_at,
  };
}

// Changing the account email through Supabase Auth sends a
// confirmation link to the NEW address — auth.users.email only
// actually switches over once that link is clicked. This deliberately
// does NOT also write profiles.email here anymore: it used to, but
// that left profiles.email briefly pointing at an address Auth didn't
// recognize yet, which broke changePassword()'s signInWithPassword()
// re-verification (it signs in with profile.email + the current
// password — Auth still expects the OLD address until confirmation
// completes). fetchCurrentProfile() now self-heals profiles.email
// from auth.users.email instead, so it only ever updates once the
// change is real. Until then the UI keeps showing the old (still
// valid, still logged-in-with) address — callers should tell the
// person to check their inbox for the confirmation link.
export async function updateEmail(newEmail: string): Promise<Profile | null> {
  const client = requireSupabase();
  const { error: authError } = await client.auth.updateUser({ email: newEmail });
  if (authError) throw authError;
  return fetchCurrentProfile();
}

// Re-verifies the current password (via a real sign-in attempt) before
// allowing the change, rather than trusting Supabase's updateUser()
// alone — that call only needs a valid session, it doesn't ask for the
// current password itself, so skipping this check would mean the
// "поточний пароль" field in the UI was checking nothing.
export async function changePassword(
  email: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const client = requireSupabase();
  // The current password is checked on an isolated, throwaway client. Signing
  // in on the app's own client would replace the live session with a fresh
  // aal1 one — and for an account with 2FA, Supabase then refuses the
  // password update (it needs an aal2 session), so the change always failed
  // and the person was left at aal1.
  const probe = createIsolatedClient();
  if (!probe) throw new Error("Supabase не налаштований.");
  const { error: verifyError } = await probe.auth.signInWithPassword({
    email,
    password: currentPassword,
  });
  if (verifyError) throw new Error("Поточний пароль невірний.");
  await probe.auth.signOut({ scope: "local" }).catch(() => undefined);

  const { error } = await client.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

// First-time password creation for a Google-only account — the "Add
// email/password login to an OAuth account" flow Supabase's own docs
// describe (a plain updateUser({password}), which also attaches a real
// "email" identity to the account). No "поточний пароль" to verify
// here, unlike changePassword() above — there isn't one yet. Once this
// succeeds, hasPasswordAuth() below returns true and the person uses
// the normal changePassword() flow for any future change.
export async function setInitialPassword(newPassword: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

// Real signal, not a guess: Supabase Auth already tracks whether the
// account's email was ever confirmed (it sends that link on sign-up).
// This just surfaces the existing `email_confirmed_at` instead of
// inventing a separate verification flow — used by the "Підтверджено"
// badge next to email in ParticipantProfile.tsx/AuthorSettings.tsx.
export async function isEmailConfirmed(): Promise<boolean> {
  if (!supabase) return false;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return !!user?.email_confirmed_at;
}

// A Google-only account (loginWithGoogle above) never has a password
// set — there's no account-linking flow here, someone signs up via
// email/password OR Google, never both. Used to hide the "Безпека"
// password-change form for Google accounts instead of showing a form
// that always errors, since Supabase's signInWithPassword() has
// nothing to check it against. `identities` is the reliable signal:
// an "email" entry means the account has real credentials to change;
// its absence means Google is the only way in. Fails open (true) when
// unsure, so a lookup hiccup doesn't hide a real password form.
export async function hasPasswordAuth(): Promise<boolean> {
  if (!supabase) return true;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return true;
  return (user.identities ?? []).some((identity) => identity.provider === "email");
}

// Requests account deletion — NOT an immediate delete. The
// delete-account Edge Function marks the account
// (deletion_requested_at), signs out every session everywhere, and
// emails a recovery notice; the real, permanent, cascading delete only
// happens 14 days later via a separate scheduled function
// (purge-deleted-accounts) unless restoreAccount() is called first.
// See schema.sql's comment on the column for the full design. Local
// signOut() here is redundant with the Edge Function's server-side
// global signOut but harmless — it just clears this tab's state
// immediately rather than waiting on the network round trip.
export async function deleteAccount(): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.functions.invoke("delete-account", { body: {} });
  if (error) throw error;
  await client.auth.signOut();
}

// The other half of deleteAccount() — called from RestoreAccountStep.tsx
// when someone logs back in during the 14-day window. A plain client
// update (RLS's "users update their own profile" already allows this,
// same as every other self-service profile edit) rather than another
// Edge Function, since there's no service-role-only step involved:
// nothing was deleted yet, this just clears the flag.
export async function restoreAccount(): Promise<void> {
  const client = requireSupabase();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw new Error("Не авторизовано.");
  const { error } = await client
    .from("profiles")
    .update({ deletion_requested_at: null })
    .eq("id", user.id);
  if (error) throw error;
}

// ── 2FA (TOTP) ──────────────────────────────────────────────────────
// Real Supabase Auth MFA, not a mock: enroll() registers a new TOTP
// factor and returns a QR code; the factor stays "unverified" (and
// login isn't gated on it yet) until one live code from the
// authenticator app is checked via verifyMfaEnrollment(). See
// getMfaStatus() below for the actual login-time gate.

export type MfaEnrollment = {
  factorId: string;
  qrCode: string; // SVG data URI, ready to drop into an <img src>
  secret: string; // manual-entry fallback if the QR can't be scanned
};

export async function enrollMfa(): Promise<MfaEnrollment> {
  const client = requireSupabase();
  // An abandoned attempt (QR shown, code never entered) leaves an *unverified*
  // factor behind; Supabase then refuses a new enroll with the same name. Clear
  // those leftovers first (verified factors are never touched) and give each
  // attempt its own name.
  const { data: existing } = await client.auth.mfa.listFactors();
  for (const f of existing?.all ?? []) {
    if (f.factor_type === "totp" && f.status === "unverified") {
      await client.auth.mfa.unenroll({ factorId: f.id }).catch(() => undefined);
    }
  }
  const { data, error } = await client.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `Sensoria ${new Date().toISOString().slice(0, 19)}`,
  });
  if (error) throw error;
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

// Confirms a freshly-enrolled factor actually works before trusting it.
// Supabase's own challenge→verify pair is the only way to do this —
// there's no "just mark it verified" shortcut, by design.
export async function verifyMfaEnrollment(factorId: string, code: string): Promise<void> {
  const client = requireSupabase();
  const { data: challenge, error: challengeError } = await client.auth.mfa.challenge({
    factorId,
  });
  if (challengeError) throw challengeError;
  const { error: verifyError } = await client.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code,
  });
  if (verifyError) throw new Error("Невірний код. Спробуйте ще раз.");
}

// Same challenge→verify pair, used instead at sign-in time — this is
// what actually raises the session from aal1 to aal2.
export async function mfaChallengeAndVerify(factorId: string, code: string): Promise<void> {
  const client = requireSupabase();
  const { data: challenge, error: challengeError } = await client.auth.mfa.challenge({
    factorId,
  });
  if (challengeError) throw challengeError;
  const { error: verifyError } = await client.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code,
  });
  if (verifyError) throw new Error("Невірний код. Спробуйте ще раз.");
}

export async function unenrollMfa(factorId: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.auth.mfa.unenroll({ factorId });
  if (error) throw error;
}

export type MfaFactor = { id: string; friendlyName: string | null };

// Only the *verified* factor list — an abandoned enroll (QR shown,
// never completed) shouldn't count as "2FA is on" anywhere in the UI.
export async function listMfaFactors(): Promise<MfaFactor[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error || !data) return [];
  return data.totp
    .filter((f) => f.status === "verified")
    .map((f) => ({ id: f.id, friendlyName: f.friendly_name ?? null }));
}

export type MfaStatus = { isEnrolled: boolean; needsChallenge: boolean };

// The real login gate check. isEnrolled: the account has a verified
// TOTP factor (nextLevel can reach aal2). needsChallenge: true only
// right after signInWithPassword() succeeds but before the code step —
// i.e. the *current session* hasn't passed aal2 yet even though the
// account has 2FA on. Called from App.tsx's boot effect and both login
// forms; see those call sites for how the gate is actually enforced.
export async function getMfaStatus(): Promise<MfaStatus> {
  if (!supabase) return { isEnrolled: false, needsChallenge: false };
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return { isEnrolled: false, needsChallenge: false };
  const isEnrolled = data.nextLevel === "aal2";
  const needsChallenge = isEnrolled && data.currentLevel !== data.nextLevel;
  return { isEnrolled, needsChallenge };
}

// Real, persisted profile edits — replaces the earlier "Зберегти
// зміни" buttons that only flipped a local "saved ✓" flag for 2.5s
// without writing anywhere.
export async function updateProfile(fields: { name?: string }): Promise<Profile | null> {
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { error } = await supabase.from("profiles").update(fields).eq("id", user.id);
  if (error) throw error;
  return fetchCurrentProfile();
}

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

// Real upload for "Змінити фото" — was a dead button with no onClick at
// all. Reuses the same `content-files` bucket + upload helper the course
// editor already uses for covers (see storage.ts); the bucket's RLS only
// checks the path's first segment against auth.uid(), not role, so this
// works unchanged for both participants and authors. Overwrites the
// previous photo on re-upload (same `{uid}/avatar` path each time) rather
// than accumulating orphaned files.
export async function updateAvatar(file: File): Promise<Profile | null> {
  // Allowlist (no SVG: it can carry scripts) and the extension comes from the
  // verified type, never from the user-supplied file name.
  const AVATAR_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
  const ext = AVATAR_EXT[file.type];
  if (!ext) {
    throw new Error("Підтримуються лише зображення JPG, PNG, WebP або GIF.");
  }
  if (file.size > MAX_AVATAR_BYTES) {
    throw new Error("Файл завеликий — максимум 5 МБ.");
  }
  const client = requireSupabase();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return null;

  const previousUrl = (await fetchCurrentProfile())?.avatarUrl ?? null;
  const url = await uploadContentFile(user.id, new File([file], `avatar.${ext}`, { type: file.type }), "avatar");
  // Cache-bust: re-uploading overwrites the same storage path, so
  // without this the browser (and any CDN) would keep showing the old
  // photo under the identical URL after a re-upload.
  const bustedUrl = `${url}?v=${Date.now()}`;
  const { error } = await client
    .from("profiles")
    .update({ avatar_url: bustedUrl })
    .eq("id", user.id);
  if (error) throw error;
  // switching format (png → jpg) would otherwise leave the old file orphaned
  if (previousUrl) {
    const marker = "/content-files/";
    const i = previousUrl.indexOf(marker);
    const oldPath = i === -1 ? "" : previousUrl.slice(i + marker.length).split("?")[0];
    if (oldPath && oldPath.startsWith(`${user.id}/avatar.`) && !url.includes(oldPath)) await deleteContentFile(oldPath);
  }
  return fetchCurrentProfile();
}

// "Видалити фото" — clears the field so the UI falls back to the
// initials circle, and best-effort removes the underlying file from
// Storage so it doesn't sit there as an orphan. The file's path isn't
// stored anywhere separately, so it's recovered from the public URL
// itself (everything after "/content-files/", minus the cache-bust
// query string updateAvatar() appends) — if that parsing ever fails
// for some reason, the profile field still gets cleared regardless,
// since that's the part that actually matters for the UI.
export async function removeAvatar(): Promise<Profile | null> {
  const client = requireSupabase();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return null;

  const current = await fetchCurrentProfile();
  if (current?.avatarUrl) {
    const marker = "/content-files/";
    const idx = current.avatarUrl.indexOf(marker);
    if (idx !== -1) {
      const path = current.avatarUrl.slice(idx + marker.length).split("?")[0];
      await deleteContentFile(path);
    }
  }

  const { error } = await client
    .from("profiles")
    .update({ avatar_url: null })
    .eq("id", user.id);
  if (error) throw error;
  return fetchCurrentProfile();
}
