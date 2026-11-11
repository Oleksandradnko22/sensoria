import { useEffect, useState } from "react";
import Switch from "../ui/Switch";
import { useSession } from "../../context/SessionContext";
import {
  updateEmail,
  changePassword,
  setInitialPassword,
  deleteAccount,
  hasPasswordAuth,
  enrollMfa,
  verifyMfaEnrollment,
  unenrollMfa,
  listMfaFactors,
  type MfaEnrollment,
} from "../../lib/auth";
import {
  fetchMyDeviceSessions,
  signOutOtherDevices,
  type DeviceSession,
} from "../../lib/deviceSessions";
import { formatRelativeTime } from "../../utils/relativeTime";
import { clearSessionBookkeeping } from "../../utils/session";
import {
  fetchNotificationPrefs,
  saveNotificationPref,
  type NotificationPrefs,
} from "../../lib/notificationPrefs";

type Toggle = { id: string; label: string; email: boolean };

// Push removed — see ParticipantProfile.tsx's comment on the same
// change for why (Sasha's call).
const initialNotifications: Toggle[] = [
  { id: "purchase", label: "Нова покупка", email: true },
  { id: "review", label: "Новий відгук", email: true },
  { id: "message", label: "Нове повідомлення", email: true },
  { id: "moderation", label: "Статус модерації", email: true },
];

export default function AuthorSettings() {
  const session = useSession();
  const profile = session?.profile;

  const [email, setEmail] = useState(profile?.email ?? "");
  const [savingContact, setSavingContact] = useState(false);
  const [contactSaved, setContactSaved] = useState(false);
  // Same distinction as ParticipantProfile.tsx: email changes need a
  // confirmation-link click before they take effect, so a plain
  // "saved" would be misleading.
  const [emailConfirmPending, setEmailConfirmPending] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);

  // Google accounts have no password to change — see lib/auth.ts's
  // hasPasswordAuth(). Starts true so the form doesn't flash-hide for
  // the (much more common) email/password accounts while this loads.
  const [passwordAuth, setPasswordAuth] = useState(true);
  useEffect(() => {
    hasPasswordAuth().then(setPasswordAuth);
  }, []);

  const [notifications, setNotifications] = useState(initialNotifications);

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
      setMfaError(e instanceof Error ? e.message : "Не вдалося почати налаштування.");
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
      setMfaError(e instanceof Error ? e.message : "Невірний код.");
    } finally {
      setMfaBusy(false);
    }
  };

  const cancelMfaEnroll = () => {
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
      setMfaError(e instanceof Error ? e.message : "Не вдалося вимкнути.");
    } finally {
      setMfaBusy(false);
    }
  };

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // Same purpose as ParticipantProfile.tsx's — fade the content just
  // before the hard `window.location.href` redirect.
  const [redirecting, setRedirecting] = useState(false);

  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [signingOutOthers, setSigningOutOthers] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    fetchMyDeviceSessions(profile.id).then(setSessions);
  }, [profile]);

  const handleSignOutOthers = async () => {
    if (!profile) return;
    setSigningOutOthers(true);
    setSignOutError(null);
    try {
      await signOutOtherDevices(profile.id);
      setSessions(await fetchMyDeviceSessions(profile.id));
    } catch (e) {
      setSignOutError(e instanceof Error ? e.message : "Не вдалося вийти з інших пристроїв.");
    } finally {
      setSigningOutOthers(false);
    }
  };

  // Same raw-vs-merged pattern as ParticipantProfile.tsx — see its
  // comment for why the two are kept separate.
  const [storedPrefs, setStoredPrefs] = useState<NotificationPrefs>({});

  useEffect(() => {
    if (!profile) return;
    fetchNotificationPrefs(profile.id).then((prefs) => {
      setStoredPrefs(prefs);
      setNotifications((prev) =>
        prev.map((n) => (prefs[n.id] ? { ...n, ...prefs[n.id] } : n))
      );
    });
  }, [profile]);

  const toggleNotification = (id: string) => {
    if (!profile) return;
    setNotifications((prev) => {
      const next = prev.map((n) => (n.id === id ? { ...n, email: !n.email } : n));
      const updated = next.find((n) => n.id === id);
      if (updated) {
        saveNotificationPref(profile.id, id, { email: updated.email }, storedPrefs);
        setStoredPrefs((prev) => ({ ...prev, [id]: { email: updated.email } }));
      }
      return next;
    });
  };

  const saveContact = async () => {
    if (!profile || !session) return;
    setSavingContact(true);
    setContactError(null);
    setEmailConfirmPending(false);
    try {
      const emailChanged = email.trim() !== profile.email;
      if (emailChanged) {
        const updated = await updateEmail(email.trim());
        if (updated) session.refreshProfile(updated);
      }
      if (emailChanged) {
        setEmailConfirmPending(true);
      } else {
        setContactSaved(true);
        setTimeout(() => setContactSaved(false), 2500);
      }
    } catch (e) {
      setContactError(e instanceof Error ? e.message : "Не вдалося зберегти.");
    } finally {
      setSavingContact(false);
    }
  };

  const savePassword = async () => {
    if (!profile || !currentPassword || !newPassword) return;
    setPasswordSaving(true);
    setPasswordError(null);
    try {
      await changePassword(profile.email, currentPassword, newPassword);
      setPasswordSaved(true);
      setCurrentPassword("");
      setNewPassword("");
      setTimeout(() => setPasswordSaved(false), 2500);
    } catch (e) {
      setPasswordError(e instanceof Error ? e.message : "Не вдалося змінити пароль.");
    } finally {
      setPasswordSaving(false);
    }
  };

  // Same char-set/length rule as RegisterPage.tsx's signup form — see
  // ParticipantProfile.tsx's identical block for the full reasoning.
  const NEW_PASSWORD_SPECIAL_CHAR = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~`]/;
  const NEW_PASSWORD_LATIN_ONLY = /^[A-Za-z0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~`]+$/;
  const isInitialPasswordValid =
    newPassword.length >= 8 &&
    NEW_PASSWORD_SPECIAL_CHAR.test(newPassword) &&
    NEW_PASSWORD_LATIN_ONLY.test(newPassword);

  const saveInitialPassword = async () => {
    if (!isInitialPasswordValid) return;
    setPasswordSaving(true);
    setPasswordError(null);
    try {
      await setInitialPassword(newPassword);
      setPasswordAuth(true);
      setNewPassword("");
      setPasswordSaved(true);
      setTimeout(() => setPasswordSaved(false), 2500);
    } catch (e) {
      setPasswordError(e instanceof Error ? e.message : "Не вдалося встановити пароль.");
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteAccount();
      // Same reasoning as ParticipantProfile.tsx's handleDelete — a
      // full page reload to "/" rather than relying on App.tsx state
      // this leaf component has no access to.
      clearSessionBookkeeping();
      setRedirecting(true);
      setTimeout(() => {
        window.location.href = "/";
      }, 200);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Не вдалося видалити акаунт.");
      setDeleting(false);
    }
  };

  return (
    <div className={`flex flex-col gap-8 ${redirecting ? "page-fade-out" : ""}`}>
      <div>
        <h1 className="text-3xl font-bold">Налаштування</h1>
        <p className="text-black/50 mt-1">Акаунт, безпека та сповіщення.</p>
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-8 items-start">
        {/* MAIN COLUMN */}
        <div className="flex flex-col gap-8">
          {/* PERSONAL DATA */}
          <div className="rounded-2xl bg-white border border-black/5 p-6">
            <h2 className="text-[17px] font-semibold mb-4">Особисті дані</h2>
            <div className="flex flex-col gap-4">
              <div>
                <div className="text-[13px] font-medium text-black/50 mb-2">Email</div>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-black/10 text-[14px] focus:outline-none focus:border-black/30"
                />
                <div className="text-[12px] text-black/40 mt-1.5">
                  Зміна email вимагає підтвердження за посиланням, яке прийде на нову адресу.
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={saveContact}
                  disabled={savingContact}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-white text-[13px] font-medium hover:opacity-90 transition w-fit disabled:opacity-50"
                >
                  {savingContact ? "Зберігаємо…" : "Зберегти"}
                </button>
                {contactSaved && (
                  <span className="text-[13px] text-emerald-600">Збережено ✓</span>
                )}
                {emailConfirmPending && (
                  <span className="text-[13px] text-amber-600">
                    Перевірте нову пошту — email зміниться після переходу за посиланням.
                  </span>
                )}
                {contactError && (
                  <span className="text-[13px] text-red-500">{contactError}</span>
                )}
              </div>
            </div>
          </div>

          {/* NOTIFICATIONS */}
          <div className="rounded-2xl bg-white border border-black/5 p-6">
            <h2 className="text-[17px] font-semibold mb-4">Сповіщення</h2>
            <p className="text-[12px] text-black/40 mb-4">
              Лист надсилається на пошту, коли учасник пише вам повідомлення. Інші перемикачі
              («Нова покупка», «Новий відгук», «Статус модерації») поки не підключені до
              розсилки — готові для неї наперед.
            </p>
            <div className="grid grid-cols-[1fr_auto] gap-y-4 items-center">
              <div className="text-[12px] text-black/40" />
              <div className="text-[12px] text-black/40 text-center w-16">Email</div>

              {notifications.map((n) => (
                <div key={n.id} className="contents">
                  <div className="text-[14px]">{n.label}</div>
                  <div className="flex justify-center w-16">
                    <Switch on={n.email} onClick={() => toggleNotification(n.id)} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* DANGER ZONE */}
          <div className="rounded-2xl bg-red-50/60 border border-red-100 p-6">
            <h2 className="text-[17px] font-semibold text-red-700 mb-1">
              Видалення акаунту
            </h2>
            <p className="text-[13px] text-red-600/80 mb-4">
              Це закриє доступ до кабінету автора одразу, а продаж ваших матеріалів зупиниться.
              Запит обробляється протягом 30 календарних днів. Протягом 14 днів акаунт ще можна відновити, увійшовши знову (зняті з продажу
              матеріали доведеться опублікувати самостійно). Після цього профіль і матеріали без
              покупців видаляються остаточно.
            </p>
            <p className="text-[13px] text-red-600/80 mb-4">
              Матеріали, які вже придбали, не видаляються: покупці зберігають до них доступ
              (за умовами договору з автором), але писати вам більше не зможуть. Зобов’язання за
              продажами, виплатами та поверненнями коштів залишаються чинними.
            </p>
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="px-5 py-2.5 rounded-xl border border-red-300 text-red-600 text-[13px] font-medium hover:bg-red-100/50 transition"
              >
                Видалити акаунт
              </button>
            ) : (
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-[13px] text-red-700">Ви впевнені?</span>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="px-4 py-2 rounded-xl bg-red-600 text-white text-[13px] font-medium hover:opacity-90 transition disabled:opacity-50"
                >
                  {deleting ? "Видаляємо…" : "Так, видалити"}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleting}
                  className="px-4 py-2 rounded-xl text-[13px] text-black/50 hover:text-black/70 transition"
                >
                  Скасувати
                </button>
                {deleteError && (
                  <span className="text-[13px] text-red-600">{deleteError}</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* SIDEBAR — SECURITY */}
        <div className="lg:sticky lg:top-6">
          <div className="rounded-2xl bg-white border border-black/5 p-6">
            <h2 className="text-[17px] font-semibold mb-4">Безпека</h2>

            {passwordAuth ? (
              <div className="flex flex-col gap-3 mb-5">
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Поточний пароль"
                  className="w-full px-4 py-3 rounded-xl border border-black/10 text-[14px] focus:outline-none focus:border-black/30"
                />
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Новий пароль"
                  className="w-full px-4 py-3 rounded-xl border border-black/10 text-[14px] focus:outline-none focus:border-black/30"
                />
                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    onClick={savePassword}
                    disabled={passwordSaving}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-white text-[13px] font-medium hover:opacity-90 transition w-fit disabled:opacity-50"
                  >
                    {passwordSaving ? "Змінюємо…" : "Змінити пароль"}
                  </button>
                  {passwordSaved && (
                    <span className="text-[13px] text-emerald-600">Пароль оновлено ✓</span>
                  )}
                  {passwordError && (
                    <span className="text-[13px] text-red-500">{passwordError}</span>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3 mb-5">
                <p className="text-[13px] text-black/55">
                  Ви увійшли через Google, тож окремого пароля для Sensoria ще немає. Можна
                  встановити його — після цього вхід за паролем працюватиме поряд із Google.
                </p>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Новий пароль"
                  className="w-full px-4 py-3 rounded-xl border border-black/10 text-[14px] focus:outline-none focus:border-black/30"
                />
                {newPassword.length > 0 && !isInitialPasswordValid && (
                  <p className="text-[12px] text-black/40">
                    Мінімум 8 символів, латиницею, і спецсимвол (наприклад ./!)
                  </p>
                )}
                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    onClick={saveInitialPassword}
                    disabled={passwordSaving || !isInitialPasswordValid}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-white text-[13px] font-medium hover:opacity-90 transition w-fit disabled:opacity-50"
                  >
                    {passwordSaving ? "Зберігаємо…" : "Зберегти пароль"}
                  </button>
                  {passwordSaved && (
                    <span className="text-[13px] text-emerald-600">Пароль встановлено ✓</span>
                  )}
                  {passwordError && (
                    <span className="text-[13px] text-red-500">{passwordError}</span>
                  )}
                </div>
              </div>
            )}

            <div className="pt-4 border-t border-black/5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[14px] font-medium">Двофакторна автентифікація</div>
                  <div className="text-[12px] text-black/45">
                    Код з застосунку-автентифікатора при вході в акаунт
                  </div>
                </div>
                {!mfaLoading && (
                  <Switch
                    on={!!mfaFactorId}
                    onClick={() => (mfaFactorId ? setConfirmDisableMfa(true) : startMfaEnroll())}
                  />
                )}
              </div>

              {mfaEnrollment && (
                <div className="mt-3 flex flex-col gap-3 p-4 rounded-xl bg-black/[0.03]">
                  <p className="text-[12px] text-black/50">
                    Відскануйте QR-код застосунком-автентифікатором (Google Authenticator, Authy
                    тощо) або введіть код вручну:
                  </p>
                  <img
                    src={mfaEnrollment.qrCode}
                    alt="QR-код для 2FA"
                    className="w-36 h-36 self-center"
                  />
                  <div className="text-[11px] text-black/40 text-center break-all font-mono">
                    {mfaEnrollment.secret}
                  </div>
                  <input
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="6-значний код"
                    className="w-full px-4 py-3 rounded-xl border border-black/10 text-[14px] text-center tracking-[0.3em] focus:outline-none focus:border-black/30"
                  />
                  <div className="flex items-center gap-3">
                    <button
                      onClick={confirmMfaEnroll}
                      disabled={mfaBusy || mfaCode.length !== 6}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-white text-[13px] font-medium hover:opacity-90 transition disabled:opacity-50"
                    >
                      {mfaBusy ? "Перевіряємо…" : "Підтвердити"}
                    </button>
                    <button
                      onClick={cancelMfaEnroll}
                      disabled={mfaBusy}
                      className="text-[13px] text-black/50 hover:text-black/70 transition"
                    >
                      Скасувати
                    </button>
                  </div>
                </div>
              )}

              {confirmDisableMfa && (
                <div className="mt-3 flex flex-col gap-3 p-4 rounded-xl bg-red-50/60">
                  <p className="text-[13px] text-red-700">
                    Вимкнути двофакторну автентифікацію? Вхід в акаунт більше не вимагатиме коду з
                    автентифікатора.
                  </p>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleDisableMfa}
                      disabled={mfaBusy}
                      className="px-4 py-2 rounded-xl bg-red-600 text-white text-[13px] font-medium hover:opacity-90 transition disabled:opacity-50"
                    >
                      {mfaBusy ? "Вимикаємо…" : "Так, вимкнути"}
                    </button>
                    <button
                      onClick={() => setConfirmDisableMfa(false)}
                      disabled={mfaBusy}
                      className="text-[13px] text-black/50 hover:text-black/70 transition"
                    >
                      Скасувати
                    </button>
                  </div>
                </div>
              )}

              {mfaError && <p className="mt-2 text-[12px] text-red-500">{mfaError}</p>}
            </div>

            <div className="pt-4 mt-4 border-t border-black/5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[14px] font-medium">Активні сеанси</div>
                  <div className="text-[12px] text-black/45">
                    {sessions.length} {sessions.length === 1 ? "пристрій" : "пристроїв"}
                  </div>
                </div>
                <button
                  onClick={() => setSessionsOpen((v) => !v)}
                  className="text-[12px] text-black/50 hover:text-black/70 transition"
                >
                  {sessionsOpen ? "Згорнути" : "Переглянути"}
                </button>
              </div>

              {sessionsOpen && (
                <div className="mt-3 flex flex-col gap-2.5">
                  {sessions.map((s) => (
                    <div key={s.id} className="text-[13px]">
                      <div className="font-medium">
                        {s.label}
                        {s.isCurrentDevice && (
                          <span className="ml-1.5 text-emerald-600 text-[11px] font-medium">
                            · цей пристрій
                          </span>
                        )}
                      </div>
                      <div className="text-black/40 text-[12px]">
                        {formatRelativeTime(s.lastSeenAt)}
                      </div>
                    </div>
                  ))}
                  {sessions.length > 1 && (
                    <button
                      onClick={handleSignOutOthers}
                      disabled={signingOutOthers}
                      className="mt-1 text-[12px] text-red-600 hover:underline text-left w-fit disabled:opacity-50"
                    >
                      {signingOutOthers ? "Виходимо…" : "Вийти з усіх інших пристроїв"}
                    </button>
                  )}
                  {signOutError && (
                    <div className="text-[12px] text-red-500">{signOutError}</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
