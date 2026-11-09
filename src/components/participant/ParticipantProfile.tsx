import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useModal } from "../author/public/useModal";
import Switch from "../ui/Switch";
import Avatar from "../ui/Avatar";
import { Icon, type IconName } from "../ui/Icon";
import ConfirmDialog from "../author/public/ConfirmDialog";
import { useSession } from "../../context/SessionContext";
import {
  updateProfile,
  updateEmail,
  updateAvatar,
  removeAvatar,
  changePassword,
  setInitialPassword,
  deleteAccount,
  isEmailConfirmed,
  hasPasswordAuth,
  getInitials,
  enrollMfa,
  verifyMfaEnrollment,
  unenrollMfa,
  listMfaFactors,
  type MfaEnrollment,
} from "../../lib/auth";
import { exportMyData, downloadAsJson } from "../../lib/dataExport";
import {
  fetchMyDeviceSessions,
  signOutOtherDevices,
  type DeviceSession,
} from "../../lib/deviceSessions";
import { pluralUk } from "../../utils/plural";
import { ACTIVE_SESSION_DAYS } from "../../utils/deviceSessionsView";
import { friendlyAuthError } from "../../utils/authErrors";
import { formatRelativeTime } from "../../utils/relativeTime";
import { clearSessionBookkeeping } from "../../utils/session";
import {
  fetchNotificationPrefs,
  saveNotificationPref,
  type NotificationPrefs,
} from "../../lib/notificationPrefs";
import { isPasswordValid as isPasswordRuleValid, PASSWORD_HINT } from "../../utils/passwordRules";

type Toggle = { id: string; label: string; hint: string; icon: IconName; email: boolean };

// "Знижки та спеціальні пропозиції" removed — the promo-code feature it
// referred to isn't real (AuthorPromotion.tsx is still mock-only, no
// promo_codes table exists), so it was a dead toggle for something
// that could never actually notify anyone. Sasha's call to drop it.
// Push removed too — real web push needs a service worker + VAPID keys
// + a subscriptions table + doesn't work on iPhone Safari unless the
// site is installed as a PWA; Sasha's call to drop it rather than ship
// a toggle for something that was never going to send anything.
const initialNotifications: Toggle[] = [
  { id: "reply", label: "Відповідь автора на відгук", hint: "Лист, коли автор відповідає на ваш відгук.", icon: "comment", email: true },
  { id: "message", label: "Нове повідомлення від автора", hint: "Лист про нові повідомлення у вашій переписці з авторами.", icon: "mail", email: true },
  { id: "newContent", label: "Нові матеріали", hint: "Дізнавайтеся першими про нові програми, гайди та медитації.", icon: "sparkle", email: false },
];

// 2FA setup shown as a dialog over the page (not squeezed into the card):
// QR code, manual key, 6-digit code. Esc / backdrop / «Скасувати» abandon it.
function MfaSetupDialog({
  enrollment,
  code,
  onCode,
  busy,
  error,
  onConfirm,
  onCancel,
  inputClass,
}: {
  enrollment: MfaEnrollment;
  code: string;
  onCode: (v: string) => void;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  inputClass: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  useModal(root, () => !busy && onCancel());
  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4" onClick={() => !busy && onCancel()}>
      <div
        ref={root}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mfa-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[420px] max-h-[92dvh] overflow-y-auto rounded-2xl bg-white p-6 shadow-[0_20px_50px_rgba(20,20,60,0.18)]"
      >
        <h3 id="mfa-title" className="text-[16px] font-semibold text-black/90">Двофакторна автентифікація</h3>
        <p className="text-[14px] text-black/70 mt-1.5 leading-relaxed">
          Відскануйте QR-код застосунком-автентифікатором (Google Authenticator, Authy тощо) або введіть ключ вручну.
        </p>
        <img src={enrollment.qrCode} alt="QR-код для 2FA" className="w-44 h-44 mx-auto mt-4 rounded-lg" />
        <div className="mt-2 text-[12px] text-black/70 text-center break-all font-mono select-all">{enrollment.secret}</div>
        <input
          value={code}
          inputMode="numeric"
          autoComplete="one-time-code"
          aria-label="6-значний код"
          data-autofocus
          onChange={(e) => onCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          onKeyDown={(e) => e.key === "Enter" && code.length === 6 && !busy && onConfirm()}
          placeholder="6-значний код"
          className={`${inputClass} text-center tracking-[0.3em] mt-4`}
        />
        {error && <p role="alert" className="mt-2 text-[14px] text-red-700">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} disabled={busy} className="min-h-[44px] px-4 rounded-xl border border-black/[0.12] text-[14px] text-black/70 hover:bg-black/[0.04] disabled:opacity-50">
            Скасувати
          </button>
          <button onClick={onConfirm} disabled={busy || code.length !== 6} className="min-h-[44px] px-5 rounded-xl bg-black text-white text-[14px] font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed">
            {busy ? "Перевіряємо…" : "Підтвердити"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function ParticipantProfile() {
  const session = useSession();
  const profile = session?.profile;

  // ── PERSONAL DATA ──────────────────────────────────────────────
  const [name, setName] = useState(profile?.name ?? "");
  const [email, setEmail] = useState(profile?.email ?? "");
  const [savingContact, setSavingContact] = useState(false);
  const [contactSaved, setContactSaved] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  // Separate from contactSaved: email changes need a confirmation-link
  // click before they actually take effect (Supabase's secure email
  // change), so "saved" alone would be misleading — this tells the
  // person to check their inbox instead, without also implying the
  // name change (if any) failed.
  const [emailConfirmPending, setEmailConfirmPending] = useState(false);

  // ── AVATAR ─────────────────────────────────────────────────────
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [removingAvatar, setRemovingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const avatarBusy = uploadingAvatar || removingAvatar;

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file next time
    if (!file || !session) return;
    setUploadingAvatar(true);
    setAvatarError(null);
    try {
      const updated = await updateAvatar(file);
      if (updated) session.refreshProfile(updated);
    } catch (err) {
      setAvatarError(friendlyAuthError(err, "Не вдалося завантажити фото."));
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleRemoveAvatar = async () => {
    if (!session) return;
    setRemovingAvatar(true);
    setAvatarError(null);
    try {
      const updated = await removeAvatar();
      if (updated) session.refreshProfile(updated);
    } catch (err) {
      setAvatarError(friendlyAuthError(err, "Не вдалося видалити фото."));
    } finally {
      setRemovingAvatar(false);
    }
  };

  // Real signal from Supabase Auth (email_confirmed_at), not a fake
  // badge — see lib/auth.ts.
  const [emailConfirmed, setEmailConfirmed] = useState<boolean | null>(null);
  useEffect(() => {
    isEmailConfirmed().then(setEmailConfirmed);
  }, []);

  // Google accounts have no password to change — see lib/auth.ts's
  // hasPasswordAuth(). null = still loading (a skeleton is shown, so
  // neither form flashes for the wrong kind of account).
  const [passwordAuth, setPasswordAuth] = useState<boolean | null>(null);
  useEffect(() => {
    hasPasswordAuth().then(setPasswordAuth);
  }, []);
  const [showPassword, setShowPassword] = useState(false);

  const contactDirty = !!profile && (name.trim() !== profile.name || email.trim() !== profile.email);
  const contactValid = name.trim().length > 0 && /^\S+@\S+\.\S+$/.test(email.trim());

  // Keep the inputs in step with the stored profile (e.g. after the email
  // change is confirmed elsewhere), without touching what is being typed.
  useEffect(() => {
    if (profile) {
      setName(profile.name);
      setEmail(profile.email);
    }
  }, [profile?.name, profile?.email]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveContact = async () => {
    if (!profile || !session || savingContact || !contactDirty || !contactValid) return;
    setSavingContact(true);
    setContactError(null);
    setEmailConfirmPending(false);
    // Name first (a plain profile update), then the email (needs a
    // confirmation link). If the email step fails the name is already saved —
    // say exactly that instead of a vague failure.
    let nameSaved = false;
    try {
      const emailChanged = email.trim() !== profile.email;
      if (name.trim() !== profile.name) {
        const updated = await updateProfile({ name: name.trim() });
        if (updated) session.refreshProfile(updated);
        nameSaved = true;
      }
      if (emailChanged) {
        const updated = await updateEmail(email.trim());
        if (updated) session.refreshProfile(updated);
        // profile.email stays the old address until the link is clicked.
        setEmailConfirmPending(true);
      } else {
        setContactSaved(true);
        setTimeout(() => setContactSaved(false), 2500);
      }
    } catch (e) {
      const msg = friendlyAuthError(e, "Не вдалося зберегти.");
      setContactError(nameSaved ? `Ім'я збережено, але email не змінено: ${msg}` : msg);
    } finally {
      setSavingContact(false);
    }
  };

  // ── SECURITY ───────────────────────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // ── 2FA (TOTP) ─────────────────────────────────────────────────
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaLoading, setMfaLoading] = useState(true);
  const [mfaEnrollment, setMfaEnrollment] = useState<MfaEnrollment | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaBusy, setMfaBusy] = useState(false);
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [confirmDisableMfa, setConfirmDisableMfa] = useState(false);

  const refreshMfaFactors = async () => {
    const factors = await listMfaFactors();
    setMfaFactorId(factors[0]?.id ?? null);
    setMfaLoading(false);
  };
  useEffect(() => {
    refreshMfaFactors();
  }, []);

  const startMfaEnroll = async () => {
    setMfaError(null);
    setMfaBusy(true);
    try {
      setMfaEnrollment(await enrollMfa());
    } catch (e) {
      console.error("[2FA enroll]", e);
      setMfaError(friendlyAuthError(e, "Не вдалося почати налаштування."));
    } finally {
      setMfaBusy(false);
    }
  };

  const confirmMfaEnroll = async () => {
    if (!mfaEnrollment || mfaCode.trim().length !== 6) return;
    setMfaBusy(true);
    setMfaError(null);
    try {
      await verifyMfaEnrollment(mfaEnrollment.factorId, mfaCode.trim());
      setMfaEnrollment(null);
      setMfaCode("");
      await refreshMfaFactors();
    } catch (e) {
      setMfaError(friendlyAuthError(e, "Невірний код."));
    } finally {
      setMfaBusy(false);
    }
  };

  const cancelMfaEnroll = () => {
    // drop the abandoned, never-verified factor right away (best effort)
    if (mfaEnrollment) unenrollMfa(mfaEnrollment.factorId).catch(() => undefined);
    setMfaEnrollment(null);
    setMfaCode("");
    setMfaError(null);
  };

  const handleDisableMfa = async () => {
    if (!mfaFactorId) return;
    setMfaBusy(true);
    setMfaError(null);
    try {
      await unenrollMfa(mfaFactorId);
      setMfaFactorId(null);
      setConfirmDisableMfa(false);
    } catch (e) {
      setMfaError(friendlyAuthError(e, "Не вдалося вимкнути."));
    } finally {
      setMfaBusy(false);
    }
  };

  const isInitialPasswordValid = isPasswordRuleValid(newPassword);

  const savePassword = async () => {
    if (!profile || !currentPassword || !isInitialPasswordValid || passwordSaving) return;
    setPasswordSaving(true);
    setPasswordError(null);
    try {
      await changePassword(profile.email, currentPassword, newPassword);
      setPasswordSaved(true);
      setCurrentPassword("");
      setNewPassword("");
      setTimeout(() => setPasswordSaved(false), 2500);
    } catch (e) {
      setPasswordError(friendlyAuthError(e, "Не вдалося змінити пароль."));
    } finally {
      setPasswordSaving(false);
    }
  };


  const saveInitialPassword = async () => {
    if (!isInitialPasswordValid || passwordSaving) return;
    setPasswordSaving(true);
    setPasswordError(null);
    try {
      await setInitialPassword(newPassword);
      setPasswordAuth(true);
      setNewPassword("");
      setPasswordSaved(true);
      setTimeout(() => setPasswordSaved(false), 2500);
    } catch (e) {
      setPasswordError(friendlyAuthError(e, "Не вдалося встановити пароль."));
    } finally {
      setPasswordSaving(false);
    }
  };

  // ── ACTIVE SESSIONS ────────────────────────────────────────────
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [sessionsState, setSessionsState] = useState<"loading" | "ready" | "error">("loading");
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [signingOutOthers, setSigningOutOthers] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const loadSessions = () => {
    if (!profile) return;
    setSessionsState("loading");
    fetchMyDeviceSessions(profile.id, { strict: true })
      .then((s) => {
        setSessions(s);
        setSessionsState("ready");
      })
      .catch(() => setSessionsState("error"));
  };
  useEffect(loadSessions, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSignOutOthers = async () => {
    if (!profile) return;
    setSigningOutOthers(true);
    setSignOutError(null);
    try {
      await signOutOtherDevices(profile.id);
      setSessions(await fetchMyDeviceSessions(profile.id));
    } catch (e) {
      setSignOutError(friendlyAuthError(e, "Не вдалося вийти з інших пристроїв."));
    } finally {
      setSigningOutOthers(false);
    }
  };

  // ── NOTIFICATIONS ──────────────────────────────────────────────
  const [notifications, setNotifications] = useState(initialNotifications);
  // Raw stored prefs (only the ids someone has actually touched) —
  // kept alongside the merged display list so a toggle-save only ever
  // writes the ids that exist, never invents entries for untouched rows.
  const [storedPrefs, setStoredPrefs] = useState<NotificationPrefs>({});
  const [prefsState, setPrefsState] = useState<"loading" | "ready" | "error">("loading");
  const [prefBusy, setPrefBusy] = useState<string | null>(null);
  const [prefError, setPrefError] = useState<string | null>(null);

  const loadPrefs = () => {
    if (!profile) return;
    setPrefsState("loading");
    fetchNotificationPrefs(profile.id, { strict: true })
      .then((prefs) => {
        setStoredPrefs(prefs);
        setNotifications((prev) => prev.map((n) => (prefs[n.id] ? { ...n, ...prefs[n.id] } : n)));
        setPrefsState("ready");
      })
      .catch(() => setPrefsState("error"));
  };
  useEffect(loadPrefs, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Optimistic, but rolled back (with a message) when the save fails, and
  // never reports success it did not get.
  const toggleNotification = async (id: string) => {
    if (!profile || prefBusy) return;
    const current = notifications.find((n) => n.id === id);
    if (!current) return;
    const nextValue = !current.email;
    setPrefError(null);
    setPrefBusy(id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, email: nextValue } : n)));
    const ok = await saveNotificationPref(profile.id, id, { email: nextValue }, storedPrefs);
    if (ok) {
      setStoredPrefs((prev) => ({ ...prev, [id]: { email: nextValue } }));
    } else {
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, email: current.email } : n)));
      setPrefError("Не вдалося зберегти налаштування. Спробуйте ще раз.");
    }
    setPrefBusy(null);
  };

  // ── DATA EXPORT ────────────────────────────────────────────────
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exported, setExported] = useState(false);
  const handleExport = async () => {
    if (!profile || exporting) return;
    setExporting(true);
    setExportError(null);
    setExported(false);
    try {
      const data = await exportMyData(profile.id);
      downloadAsJson(`sensoria-data-${profile.id}.json`, data);
      setExported(true);
    } catch (e) {
      setExportError(friendlyAuthError(e, "Не вдалося сформувати файл."));
    } finally {
      setExporting(false);
    }
  };

  // ── DELETE ACCOUNT ─────────────────────────────────────────────
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // Drives the fade-out below, right before the hard redirect — a real
  // browser navigation can't be animated, so this is the best that's
  // available: fade the content first instead of an instant cut.
  const [redirecting, setRedirecting] = useState(false);

  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteAccount();
      // A full page reload to "/" instead of relying on App.tsx's own
      // state (this is a leaf component with no access to its
      // setSession/setPage) — also the most robust option here:
      // guarantees no stale dashboard state survives in memory after
      // an account was just marked for deletion.
      clearSessionBookkeeping();
      setRedirecting(true);
      setTimeout(() => {
        window.location.href = "/";
      }, 200);
    } catch (e) {
      setDeleteError(friendlyAuthError(e, "Не вдалося видалити акаунт."));
      setConfirmDelete(false);
      setDeleting(false);
    }
  };

  const field =
    "w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-black/15 bg-white text-[16px] sm:text-[14px] focus:outline-none focus:border-[#4338ca]/60 focus-visible:ring-2 focus-visible:ring-[#4338ca]/20";
  const card = "rounded-2xl bg-white border border-black/[0.06] p-5 sm:p-6";
  const primaryBtn =
    "min-h-[44px] px-5 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white text-[14px] font-medium hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed";
  const darkBtn =
    "min-h-[44px] px-5 rounded-xl bg-black text-white text-[14px] font-medium hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <div className={`flex flex-col gap-6 ${redirecting ? "page-fade-out" : ""}`}>
      <div>
        <h1 className="text-3xl font-bold">Профіль</h1>
        <p className="text-black/60 mt-1">Особисті дані, безпека та сповіщення.</p>
      </div>

      {/* PERSONAL DATA + SECURITY */}
      <div className="grid lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-6 items-stretch">
        {/* PERSONAL DATA */}
        <section className={card} aria-labelledby="profile-personal">
          <h2 id="profile-personal" className="text-[20px] font-semibold">Особисті дані</h2>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-4">
            <div className="relative shrink-0">
              <Avatar
                avatarUrl={profile?.avatarUrl}
                initials={getInitials(name || "?")}
                className="w-16 h-16 text-[20px] text-white"
              />
              <span
                aria-hidden="true"
                className="absolute -right-0.5 -bottom-0.5 w-6 h-6 rounded-full bg-white border border-black/10 shadow-sm flex items-center justify-center text-black/60"
              >
                <Icon name="image" size={13} />
              </span>
            </div>
            <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={handleAvatarChange} />
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={avatarBusy}
                  className="min-h-[44px] px-4 rounded-xl bg-[#eef0fd] text-[#4338ca] hover:bg-[#e3e6fb] text-[14px] font-medium transition disabled:opacity-50"
                >
                  {uploadingAvatar ? "Завантажуємо…" : "Змінити фото"}
                </button>
                {profile?.avatarUrl && (
                  <button
                    onClick={handleRemoveAvatar}
                    disabled={avatarBusy}
                    className="min-h-[44px] px-4 rounded-xl text-[14px] font-medium text-red-700 hover:bg-red-50 transition disabled:opacity-50"
                  >
                    {removingAvatar ? "Видаляємо…" : "Видалити фото"}
                  </button>
                )}
              </div>
              <p className="text-[12px] text-black/60">JPG, PNG, WebP або GIF до 5 МБ.</p>
            </div>
          </div>
          {avatarError && <p role="alert" className="text-[14px] text-red-700 mt-2">{avatarError}</p>}

          <div className="flex flex-col gap-4 mt-5">
            <div>
              <label htmlFor="profile-name" className="block text-[14px] font-medium text-black/70 mb-1.5">Ім'я та прізвище</label>
              <input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className={field} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <label htmlFor="profile-email" className="text-[14px] font-medium text-black/70">Email</label>
                {emailConfirmed !== null && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-[12px] font-medium ${
                      emailConfirmed ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"
                    }`}
                  >
                    {emailConfirmed ? "Підтверджено" : "Не підтверджено"}
                  </span>
                )}
              </div>
              <input id="profile-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className={field} />
              <p className="mt-1.5 text-[12px] text-black/60">
                Використовується для входу — зміна вимагає підтвердження за посиланням, яке прийде на нову адресу.
              </p>
            </div>
          </div>

          {contactError && <p role="alert" className="mt-3 text-[14px] text-red-700">{contactError}</p>}
          {emailConfirmPending && (
            <p role="status" className="mt-3 text-[14px] text-amber-800">
              Перевірте нову пошту — email зміниться після переходу за посиланням.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3 mt-5">
            <button onClick={saveContact} disabled={savingContact || !contactDirty || !contactValid} className={primaryBtn}>
              {savingContact ? "Зберігаємо…" : "Зберегти зміни"}
            </button>
            {contactSaved && <span role="status" className="text-[14px] text-emerald-700">Збережено ✓</span>}
          </div>
        </section>

        {/* SECURITY */}
        <section className={card} aria-labelledby="profile-security">
          <h2 id="profile-security" className="text-[20px] font-semibold">Безпека</h2>

          {passwordAuth === null ? (
            <div className="mt-4 flex flex-col gap-3 animate-pulse" aria-busy="true" aria-label="Завантаження">
              <div className="h-11 rounded-xl bg-black/[0.05]" />
              <div className="h-11 rounded-xl bg-black/[0.05]" />
              <div className="h-11 w-40 rounded-xl bg-black/[0.05]" />
            </div>
          ) : passwordAuth ? (
            <div className="flex flex-col gap-3 mt-4">
              <div>
                <label htmlFor="pw-current" className="block text-[14px] font-medium text-black/70 mb-1.5">Поточний пароль</label>
                <input id="pw-current" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className={field} />
              </div>
              <div>
                <label htmlFor="pw-new" className="block text-[14px] font-medium text-black/70 mb-1.5">Новий пароль</label>
                <div className="relative">
                  <input id="pw-new" type={showPassword ? "text" : "password"} autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={`${field} pr-24`} />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Сховати пароль" : "Показати пароль"}
                    aria-pressed={showPassword}
                    className="absolute right-1 top-0 h-11 px-3 flex items-center justify-center rounded-lg text-black/70 hover:text-black/90 text-[14px] font-medium"
                  >
                    {showPassword ? "Сховати" : "Показати"}
                  </button>
                </div>
                <p className={`mt-1.5 text-[12px] ${newPassword.length > 0 && !isInitialPasswordValid ? "text-red-700" : "text-black/60"}`}>
                  {PASSWORD_HINT}
                </p>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <button onClick={savePassword} disabled={passwordSaving || !currentPassword || !isInitialPasswordValid} className={darkBtn}>
                  {passwordSaving ? "Змінюємо…" : "Змінити пароль"}
                </button>
                {passwordSaved && <span role="status" className="text-[14px] text-emerald-700">Пароль оновлено ✓</span>}
              </div>
              {passwordError && <p role="alert" className="text-[14px] text-red-700">{passwordError}</p>}
            </div>
          ) : (
            <div className="flex flex-col gap-3 mt-4">
              <p className="text-[14px] text-black/70 leading-relaxed">
                Ви увійшли через Google, тож окремого пароля для Sensoria ще немає. Можна встановити його — після цього
                вхід за паролем працюватиме поряд із Google.
              </p>
              <div>
                <label htmlFor="pw-initial" className="block text-[14px] font-medium text-black/70 mb-1.5">Новий пароль</label>
                <div className="relative">
                  <input id="pw-initial" type={showPassword ? "text" : "password"} autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={`${field} pr-24`} />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Сховати пароль" : "Показати пароль"}
                    aria-pressed={showPassword}
                    className="absolute right-1 top-0 h-11 px-3 flex items-center justify-center rounded-lg text-black/70 hover:text-black/90 text-[14px] font-medium"
                  >
                    {showPassword ? "Сховати" : "Показати"}
                  </button>
                </div>
                <p className={`mt-1.5 text-[12px] ${newPassword.length > 0 && !isInitialPasswordValid ? "text-red-700" : "text-black/60"}`}>
                  {PASSWORD_HINT}
                </p>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <button onClick={saveInitialPassword} disabled={passwordSaving || !isInitialPasswordValid} className={darkBtn}>
                  {passwordSaving ? "Зберігаємо…" : "Зберегти пароль"}
                </button>
                {passwordSaved && <span role="status" className="text-[14px] text-emerald-700">Пароль встановлено ✓</span>}
              </div>
              {passwordError && <p role="alert" className="text-[14px] text-red-700">{passwordError}</p>}
            </div>
          )}

          {/* 2FA */}
          <div className="pt-4 mt-5 border-t border-black/[0.06]">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[14px] font-medium">Двофакторна автентифікація</div>
                <div className="text-[12px] text-black/60">Код із застосунку-автентифікатора при вході в акаунт</div>
              </div>
              {mfaLoading ? (
                <span className="w-11 h-6 rounded-full bg-black/[0.06] animate-pulse shrink-0" aria-hidden="true" />
              ) : (
                <Switch
                  touch
                  label="Двофакторна автентифікація"
                  on={!!mfaFactorId}
                  disabled={mfaBusy}
                  onClick={() => (mfaFactorId ? setConfirmDisableMfa(true) : startMfaEnroll())}
                />
              )}
            </div>

            {mfaError && !mfaEnrollment && <p role="alert" className="mt-2 text-[14px] text-red-700">{mfaError}</p>}
          </div>
        </section>
      </div>

      {/* NOTIFICATIONS */}
      <section className={card} aria-labelledby="profile-notifications">
        <h2 id="profile-notifications" className="text-[20px] font-semibold">Сповіщення</h2>
        <p className="text-[14px] text-black/60 mt-1 max-w-[720px]">
          Листи надсилаються на пошту, коли автор відповідає на відгук, пише повідомлення або публікує новий матеріал.
        </p>

        {prefsState === "loading" && (
          <div className="mt-4 flex flex-col gap-3 animate-pulse" aria-busy="true" aria-label="Завантаження сповіщень">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-12 rounded-xl bg-black/[0.05]" />
            ))}
          </div>
        )}
        {prefsState === "error" && (
          <div role="alert" className="mt-4 text-[14px] text-red-700">
            Не вдалося завантажити налаштування сповіщень.{" "}
            <button onClick={loadPrefs} className="underline font-medium">Спробувати ще раз</button>
          </div>
        )}
        {prefsState === "ready" && (
          <ul className="mt-3 divide-y divide-black/[0.06]">
            {notifications.map((n) => (
              <li key={n.id} className="flex items-center gap-3 sm:gap-4 py-3">
                <span aria-hidden="true" className="hidden sm:flex shrink-0 w-10 h-10 rounded-full bg-[#eef0fd] text-[#4338ca] items-center justify-center">
                  <Icon name={n.icon} size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-medium text-black/90">{n.label}</div>
                  <div className="text-[12px] text-black/60">{n.hint}</div>
                </div>
                <Switch
                  touch
                  label={n.label}
                  on={n.email}
                  disabled={prefBusy !== null}
                  onClick={() => toggleNotification(n.id)}
                />
              </li>
            ))}
          </ul>
        )}
        {prefError && <p role="alert" className="mt-2 text-[14px] text-red-700">{prefError}</p>}
        <p className="text-[12px] text-black/60 mt-3 pt-3 border-t border-black/[0.06]">
          Важливі повідомлення щодо безпеки акаунту, оплат і повернень можуть надсилатися незалежно від цих налаштувань.
        </p>
      </section>

      {/* SESSIONS */}
      <section className={card} aria-labelledby="profile-sessions">

            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 id="profile-sessions" className="text-[20px] font-semibold">Активні сеанси</h2>
                <div className="text-[12px] text-black/60">
                  {sessionsState === "loading"
                    ? "Завантажуємо…"
                    : sessionsState === "error"
                    ? "Не вдалося завантажити"
                    : `${sessions.length} ${pluralUk(sessions.length, "пристрій", "пристрої", "пристроїв")} · користувалися акаунтом за останні ${ACTIVE_SESSION_DAYS} днів`}
                </div>
              </div>
              {sessionsState === "error" ? (
                <button onClick={loadSessions} className="min-h-[44px] px-2 text-[14px] font-medium text-[#4338ca] hover:underline underline-offset-4">
                  Повторити
                </button>
              ) : (
                <button
                  onClick={() => setSessionsOpen((v) => !v)}
                  disabled={sessionsState !== "ready"}
                  aria-expanded={sessionsOpen}
                  className="min-h-[44px] px-2 text-[14px] font-medium text-[#4338ca] hover:underline underline-offset-4 disabled:opacity-40"
                >
                  {sessionsOpen ? "Згорнути" : "Переглянути"}
                </button>
              )}
            </div>

            {sessionsOpen && sessionsState === "ready" && (
              <div className="mt-2 flex flex-col gap-3">
                {sessions.map((s) => (
                  <div key={s.id} className="text-[14px]">
                    <div className="font-medium">
                      {s.label}
                      {s.isCurrentDevice && <span className="ml-1.5 text-emerald-700 text-[12px] font-medium">· цей пристрій</span>}
                    </div>
                    <div className="text-black/60 text-[12px]">{formatRelativeTime(s.lastSeenAt)}</div>
                  </div>
                ))}
                {sessions.length > 1 && (
                  <button onClick={handleSignOutOthers} disabled={signingOutOthers} className="min-h-[44px] text-[14px] text-red-700 hover:underline text-left w-fit disabled:opacity-50">
                    {signingOutOthers ? "Виходимо…" : "Вийти з усіх інших пристроїв"}
                  </button>
                )}
                {signOutError && <div role="alert" className="text-[14px] text-red-700">{signOutError}</div>}
              </div>
            )}
      </section>

      {/* DATA + DELETE */}
      <div className="grid md:grid-cols-2 gap-6 items-stretch">
        <section className={card} aria-labelledby="profile-data">
          <h2 id="profile-data" className="text-[20px] font-semibold">Дані</h2>
          <p className="text-[14px] text-black/60 mt-1">Копія даних, які Sensoria зберігає про ваш акаунт.</p>
          <div className="flex flex-wrap items-center gap-3 mt-4">
            <button onClick={handleExport} disabled={exporting} className="inline-flex items-center gap-2 min-h-[44px] px-5 rounded-xl border border-[#4338ca]/30 bg-[#eef0fd] text-[#4338ca] text-[14px] font-medium hover:bg-[#e3e6fb] transition disabled:opacity-50">
              <Icon name="clip" size={16} />
              {exporting ? "Формуємо…" : "Завантажити мої дані"}
            </button>
            {exported && !exportError && <span role="status" className="text-[14px] text-emerald-700">Файл завантажено ✓</span>}
          </div>
          {exportError && <p role="alert" className="mt-2 text-[14px] text-red-700">{exportError}</p>}
        </section>

        <section className="rounded-2xl bg-red-50/60 border border-red-100 p-5 sm:p-6" aria-labelledby="profile-delete">
          <h2 id="profile-delete" className="text-[20px] font-semibold text-red-800">Видалення акаунту</h2>
          <p className="text-[14px] text-red-900/80 mt-1">
            Видалення акаунту закриє ваш доступ до Sensoria одразу. Протягом 14 днів після цього акаунт ще можна
            відновити, увійшовши знову. Запит обробляється протягом 30 календарних днів. Визначені дані акаунта
            (прогрес, записи, відгуки, повідомлення) видаляються, але відомості про придбані матеріали зберігаються:
            щоб отримати їх у новому акаунті, напишіть у підтримку, і ми підтвердимо вашу особу. Саме видалення акаунту не дає автоматичного права на повернення коштів; ваші
            права за законом зберігаються.
          </p>
          <button
            onClick={() => {
              setDeleteError(null);
              setConfirmDelete(true);
            }}
            disabled={deleting}
            className="mt-4 min-h-[44px] px-5 rounded-xl border border-red-400 text-red-800 text-[14px] font-medium hover:bg-red-100/60 transition disabled:opacity-50"
          >
            Видалити акаунт
          </button>
          {deleteError && <p role="alert" className="mt-2 text-[14px] text-red-800">{deleteError}</p>}
        </section>
      </div>

      {mfaEnrollment && (
        <MfaSetupDialog
          enrollment={mfaEnrollment}
          code={mfaCode}
          onCode={setMfaCode}
          busy={mfaBusy}
          error={mfaError}
          onConfirm={confirmMfaEnroll}
          onCancel={cancelMfaEnroll}
          inputClass={field}
        />
      )}

      {confirmDisableMfa && (
        <ConfirmDialog
          title="Вимкнути двофакторну автентифікацію?"
          text="Вхід в акаунт більше не вимагатиме коду з автентифікатора."
          confirmLabel="Так, вимкнути"
          busy={mfaBusy}
          onConfirm={handleDisableMfa}
          onCancel={() => !mfaBusy && setConfirmDisableMfa(false)}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Видалити акаунт?"
          text="Доступ закриється одразу, а всі сеанси завершаться. Протягом 14 днів ви можете відновити акаунт, увійшовши знову. Після цього прогрес навчання, відгуки, записи й повідомлення буде видалено. Відомості про придбане збережуться, і доступ можна буде повернути через підтримку."
          confirmLabel="Так, видалити"
          busy={deleting}
          onConfirm={handleDelete}
          onCancel={() => !deleting && setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
