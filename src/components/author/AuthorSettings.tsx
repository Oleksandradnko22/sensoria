import { useEffect, useState } from "react";
import Switch from "../ui/Switch";
import { supabase } from "../../lib/supabaseClient";
import { fetchArchiveBlockers } from "../../lib/content";
import { Icon, type IconName } from "../ui/Icon";
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
  { id: "message", label: "Учасник написав вам повідомлення", email: true },
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

  // the same rule as archiving a material: no buyer inside the 14-day window, no open refund request
  const [blockers, setBlockers] = useState<{ title: string; text: string }[] | null>(null);
  const [checkingDelete, setCheckingDelete] = useState(false);
  const checkCanDelete = async () => {
    if (!profile || !supabase) return;
    setCheckingDelete(true);
    setDeleteError(null);
    try {
      const { data: mats } = await supabase.from("content").select("id, title").eq("author_id", profile.id);
      const list = (mats ?? []) as { id: string; title: string }[];
      const found = await fetchArchiveBlockers(list.map((m) => m.id));
      const out: { title: string; text: string }[] = [];
      list.forEach((m) => {
        const b = found.get(m.id);
        if (!b) return;
        if (b.openRefunds > 0) out.push({ title: m.title, text: "відкрито запит на повернення — дочекайтеся рішення" });
        if (b.lastPurchase) {
          const until = new Date(new Date(b.lastPurchase).getTime() + 14 * 86_400_000);
          if (until.getTime() > Date.now()) out.push({ title: m.title, text: `остання покупка ще в 14-денному строку — можна після ${until.toLocaleDateString("uk-UA", { day: "numeric", month: "long" })}` });
        }
      });
      setBlockers(out);
      setConfirmDelete(out.length === 0);
    } catch {
      setDeleteError("Не вдалося перевірити матеріали. Спробуйте ще раз.");
    } finally {
      setCheckingDelete(false);
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
    <div className={`flex flex-col gap-5 ${redirecting ? "page-fade-out" : ""}`}>
      <div>
        <h1 className="text-[32px] font-bold leading-tight text-[#12172b]">Налаштування</h1>
        <p className="mt-1 text-[15px] text-black/55">Пошта для входу, захист акаунта, листи від Sensoria.</p>
      </div>

      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-5">
          {/* PERSONAL DATA */}
          <div className={CARD}>
            <SectionTitle icon="mail" title="Пошта для входу" hint="На неї приходять листи й коди підтвердження." />
            <div className="flex flex-col gap-4">
              <div>
                <input
                  type="email"
                  aria-label="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={FIELD}
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
          <div className={CARD}>
            <SectionTitle icon="megaphone" title="Листи на пошту" hint="Про реакції, коментарі й інше в «Спільноті» ви дізнаєтеся там, у сповіщеннях." />
            <div className="flex flex-col gap-3">
              {notifications.map((n) => (
                <label key={n.id} className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl bg-[#faf9ff] px-4 py-3 ring-1 ring-[#ece8fb]">
                  <span className="text-[15px] text-[#12172b]">{n.label}</span>
                  <Switch on={n.email} onClick={() => toggleNotification(n.id)} />
                </label>
              ))}
            </div>
          </div>

          {/* DANGER ZONE — folded, at the very end */}
          <details className="group order-last rounded-[26px] bg-white p-5 ring-1 ring-rose-100 sm:p-6">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
              <span className="flex items-center gap-3.5 text-left">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-600"><Icon name="warning" size={20} /></span>
                <span>
                  <span className="block text-[17px] font-semibold text-rose-700">Видалити акаунт</span>
                  <span className="block text-[13px] text-black/50">Що буде з матеріалами й покупцями</span>
                </span>
              </span>
              <Icon name="chevron" size={18} className="shrink-0 text-black/40 transition-transform group-open:rotate-180" />
            </summary>
            {/* four short facts, the full width of the card */}
            <ul className="mt-4 mb-5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Кабінет закриється одразу", "Продаж ваших матеріалів зупиниться."],
                ["14 днів на відновлення", "Просто увійдіть знову — і все повернеться."],
                ["Покупці зберігають доступ", "Хто вже купив, і далі бачить матеріал."],
                ["Зобов’язання залишаються", "Продажі, виплати й повернення — за договором."],
              ].map(([t, d]) => (
                <li key={t} className="rounded-2xl bg-rose-50/50 p-4 ring-1 ring-rose-100">
                  <div className="text-[14px] font-semibold text-[#12172b]">{t}</div>
                  <div className="mt-0.5 text-[13px] leading-snug text-black/55">{d}</div>
                </li>
              ))}
            </ul>
            {blockers && blockers.length > 0 && (
              <div role="alert" className="mb-4 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-100">
                <div className="text-[15px] font-semibold text-amber-900">Поки не можна видалити акаунт</div>
                <p className="mt-1 text-[13px] text-amber-900/80">Спершу має завершитися строк покупців і розглянуті запити на повернення:</p>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {blockers.map((b, i) => <li key={i} className="text-[14px] text-[#12172b]"><b>«{b.title}»</b> — {b.text}</li>)}
                </ul>
              </div>
            )}
            {!confirmDelete ? (
              <button
                onClick={() => void checkCanDelete()}
                className="px-5 py-2.5 rounded-xl border border-red-300 text-red-600 text-[13px] font-medium hover:bg-red-100/50 transition"
              >
                {checkingDelete ? "Перевіряємо матеріали…" : "Видалити акаунт"}
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
          </details>

          {/* SECURITY */}
          <div className={CARD}>
            <SectionTitle icon="shield" title="Захист акаунта" hint="Пароль, код при вході й пристрої, на яких ви увійшли." />

            {passwordAuth ? (
              <div className="flex flex-col gap-3 mb-5">
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Поточний пароль"
                  className={FIELD}
                />
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Новий пароль"
                  className={FIELD}
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
                  className={FIELD}
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

const CARD = "rounded-[26px] bg-white p-5 ring-1 ring-[#ece8fb] sm:p-6";
const FIELD = "w-full rounded-xl bg-[#faf9ff] px-4 py-3 text-[15px] ring-1 ring-[#e3def9] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#7c5cf0]";

function SectionTitle({ icon, title, hint }: { icon: IconName; title: string; hint: string }) {
  return (
    <div className="mb-4 flex items-start gap-3.5">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#f1eeff] text-[#5b3df5]"><Icon name={icon} size={20} /></span>
      <div>
        <h2 className="text-[18px] font-bold text-[#12172b]">{title}</h2>
        <p className="text-[14px] text-black/55">{hint}</p>
      </div>
    </div>
  );
}
