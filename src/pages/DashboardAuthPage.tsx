import { useState } from "react";
import {
  registerAccount,
  loginAccount,
  loginWithGoogle,
  logoutAccount,
  fetchCurrentProfile,
  translateAuthError,
  getMfaStatus,
  type Profile,
} from "../lib/auth";
import { isSupabaseConfigured } from "../lib/supabaseClient";
import ConsentCheckbox from "../components/ConsentCheckbox";
import MfaCodeStep from "../components/auth/MfaCodeStep";
import RestoreAccountStep from "../components/auth/RestoreAccountStep";
import { isFullName } from "../utils/personName.ts";
import { isPasswordValid as isPasswordRuleValid, PASSWORD_HINT } from "../utils/passwordRules";

type Role = "author" | "participant";

type Props = {
  role: Role;
  onAuthenticated: (profile: Profile) => void;
  onBackToSite: () => void;
};

const ROLE_COPY: Record<
  Role,
  {
    badge: string;
    registerTitle: string;
    loginTitle: string;
    registerBlurb: string;
    loginBlurb: string;
  }
> = {
  author: {
    badge: "Кабінет автора",
    registerTitle: "Реєстрація автора",
    loginTitle: "Вхід для авторів",
    registerBlurb:
      "Створіть акаунт автора, щоб публікувати програми, гайди та медитації на Sensoria.",
    loginBlurb: "Увійдіть, щоб повернутися до свого кабінету автора.",
  },
  participant: {
    badge: "Кабінет учасника",
    registerTitle: "Реєстрація учасника",
    loginTitle: "Вхід для учасників",
    registerBlurb:
      "Створіть акаунт, щоб відстежувати прогрес, купувати контент і спілкуватися з авторами.",
    loginBlurb: "Увійдіть, щоб повернутися до свого навчання.",
  },
};

// Same rules as the existing test-funnel Login/RegisterPage — Latin
// characters only, ".com" email, 8+ char password with a special
// character — kept identical for consistency across the app.
const EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)*\.com$/;

export default function DashboardAuthPage({ role, onAuthenticated, onBackToSite }: Props) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [consent, setConsent] = useState(false);
  const [age18, setAge18] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  // Same purpose as in LoginPage.tsx: set only when sign-in succeeded
  // but the account's 2FA hasn't cleared aal2 for this session yet.
  // Registration never sets this — a brand-new account can't have a
  // factor enrolled — but the check runs after both paths anyway since
  // getMfaStatus() is simply false for accounts with nothing enrolled.
  const [pendingProfile, setPendingProfile] = useState<Profile | null>(null);
  // Checked after the MFA gate passes — see proceedAfterAuth() below.
  const [pendingRestoreProfile, setPendingRestoreProfile] = useState<Profile | null>(null);

  const proceedAfterAuth = (profile: Profile) => {
    if (profile.deletionRequestedAt) {
      setPendingRestoreProfile(profile);
      return;
    }
    onAuthenticated(profile);
  };

  const copy = ROLE_COPY[role];

  // Authors appear publicly under their real name: first name + surname.
  const isNameValid = role === "author" ? isFullName(name) : name.trim().length > 1;
  const isEmailValid = EMAIL_PATTERN.test(email.trim());
  const isPasswordValid = isPasswordRuleValid(password);

  const canSubmit =
    !submitting &&
    (mode === "register"
      ? isNameValid && isEmailValid && isPasswordValid && consent && age18
      : isEmailValid && isPasswordValid);

  if (pendingProfile) {
    return (
      <MfaCodeStep
        onVerified={() => proceedAfterAuth(pendingProfile)}
        onCancel={() => setPendingProfile(null)}
      />
    );
  }

  if (pendingRestoreProfile) {
    return (
      <RestoreAccountStep
        deletionRequestedAt={pendingRestoreProfile.deletionRequestedAt!}
        onRestored={() =>
          onAuthenticated({ ...pendingRestoreProfile, deletionRequestedAt: null })
        }
        onCancel={() => setPendingRestoreProfile(null)}
      />
    );
  }

  const switchMode = (next: "login" | "register") => {
    setMode(next);
    setNameTouched(false);
    setEmailTouched(false);
    setPasswordTouched(false);
    setFormError(null);
  };

  const submitGoogle = async () => {
    setFormError(null);
    setInfoMessage(null);
    setGoogleSubmitting(true);
    try {
      await loginWithGoogle(role, mode === "register" && consent && age18);
      // A full-page redirect to Google happens inside loginWithGoogle —
      // this component unmounts before there's anything else to do.
    } catch (e) {
      setFormError(e instanceof Error ? translateAuthError(e.message) : "Щось пішло не так.");
      setGoogleSubmitting(false);
    }
  };

  const submit = async () => {
    if (!canSubmit) return;
    setFormError(null);
    setInfoMessage(null);
    setSubmitting(true);
    try {
      if (mode === "register") {
        await registerAccount(role, name.trim(), email.trim(), password);
      } else {
        await loginAccount(email.trim(), password);
      }

      const profile = await fetchCurrentProfile();

      if (!profile) {
        // signUp() can succeed without an active session if the
        // Supabase project requires email confirmation first.
        if (mode === "register") {
          setInfoMessage(
            "Акаунт створено. Підтвердіть email за посиланням у листі, потім увійдіть."
          );
          switchMode("login");
        } else {
          setFormError("Не вдалося увійти. Спробуйте ще раз.");
        }
        return;
      }

      if (profile.role !== role) {
        await logoutAccount();
        setFormError(
          role === "author"
            ? "Цей акаунт зареєстрований як учасник — увійдіть через «Увійти як учасник»."
            : "Цей акаунт зареєстрований як автор — увійдіть через «Увійти як автор»."
        );
        return;
      }

      const mfaStatus = await getMfaStatus();
      if (mfaStatus.needsChallenge) {
        setPendingProfile(profile);
        return;
      }

      proceedAfterAuth(profile);
    } catch (e) {
      setFormError(e instanceof Error ? translateAuthError(e.message) : "Щось пішло не так.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen px-6 py-20 flex items-center justify-center">
      <div className="max-w-2xl w-full">
        <button
          onClick={onBackToSite}
          className="mb-6 flex items-center gap-2 text-white/70 hover:text-white transition text-sm"
        >
          <span className="text-lg">←</span>
          На головну
        </button>

        <div className="rounded-[32px] bg-white/10 backdrop-blur-2xl border border-white/20 p-10 text-white">
          <div className="text-white/50 text-sm mb-3 uppercase tracking-wide">{copy.badge}</div>

          <h1 className="text-4xl font-bold mb-5">
            {mode === "register" ? copy.registerTitle : copy.loginTitle}
          </h1>

          <p className="text-white/75 leading-relaxed mb-8">
            {mode === "register" ? copy.registerBlurb : copy.loginBlurb}
          </p>

          {!isSupabaseConfigured && (
            <div className="mb-6 rounded-2xl bg-amber-500/15 border border-amber-400/30 px-5 py-4 text-amber-100 text-sm">
              Supabase ще не підключено (немає VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY) —
              форма не зможе створити чи перевірити акаунт.
            </div>
          )}

          {infoMessage && (
            <div className="mb-6 rounded-2xl bg-emerald-500/15 border border-emerald-400/30 px-5 py-4 text-emerald-100 text-sm">
              {infoMessage}
            </div>
          )}

          {formError && (
            <div className="mb-6 rounded-2xl bg-red-500/15 border border-red-400/30 px-5 py-4 text-red-100 text-sm">
              {formError}
            </div>
          )}

          <button
            type="button"
            onClick={submitGoogle}
            disabled={!isSupabaseConfigured || googleSubmitting || (mode === "register" && !(consent && age18))}
            className="
              w-full mb-6 py-4 rounded-2xl font-medium
              bg-white text-black
              flex items-center justify-center gap-3
              hover:bg-white/90 transition
              disabled:opacity-50 disabled:cursor-not-allowed
            "
          >
            <svg width="20" height="20" viewBox="0 0 48 48">
              <path fill="#FFC107" d="M43.61 20.08H42V20H24v8h11.3c-1.65 4.66-6.08 8-11.3 8-6.63 0-12-5.37-12-12s5.37-12 12-12c3.06 0 5.85 1.15 7.96 3.04l5.66-5.66C34.11 6.05 29.3 4 24 4 12.95 4 4 12.95 4 24s8.95 20 20 20 20-8.95 20-20c0-1.34-.14-2.65-.39-3.92z" />
              <path fill="#FF3D00" d="M6.31 14.69l6.57 4.82C14.66 15.71 18.99 13 24 13c3.06 0 5.85 1.15 7.96 3.04l5.66-5.66C34.11 6.05 29.3 4 24 4 16.32 4 9.68 8.34 6.31 14.69z" />
              <path fill="#4CAF50" d="M24 44c5.17 0 9.86-1.98 13.4-5.19l-6.19-5.24C29.2 35.09 26.72 36 24 36c-5.2 0-9.62-3.32-11.28-7.95l-6.5 5.01C9.5 39.55 16.22 44 24 44z" />
              <path fill="#1976D2" d="M43.61 20.08H42V20H24v8h11.3c-.79 2.23-2.24 4.15-4.1 5.57l6.19 5.24C40.72 36.32 44 30.7 44 24c0-1.34-.14-2.65-.39-3.92z" />
            </svg>
            {googleSubmitting ? "Перенаправлення…" : "Продовжити з Google"}
          </button>

          <div className="flex items-center gap-4 mb-6 text-white/40 text-xs uppercase tracking-wide">
            <div className="flex-1 h-px bg-white/15" />
            або
            <div className="flex-1 h-px bg-white/15" />
          </div>

          {mode === "register" && (
            <div className="mb-6">
              <ConsentCheckbox checked={consent} onChange={setConsent} ageChecked={age18} onAgeChange={setAge18} />
            </div>
          )}

          <div className="space-y-5">
            {mode === "register" && (
              <div>
                <input
                  type="text"
                  placeholder={role === "author" ? "Ім'я та прізвище" : "Ім'я"}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => setNameTouched(true)}
                  aria-invalid={nameTouched && !isNameValid}
                  className={`
                    w-full px-5 py-4 rounded-2xl bg-white/5 border
                    placeholder-white/40 focus:outline-none transition-colors
                    ${
                      nameTouched && !isNameValid
                        ? "border-red-400/60 focus:border-red-400/60"
                        : "border-white/15 focus:border-white/40"
                    }
                  `}
                />
                {nameTouched && !isNameValid && (
                  <p className="mt-2 px-1 text-sm text-red-300/90">{role === "author" ? "Введіть ім'я та прізвище" : "Введіть ім'я"}</p>
                )}
              </div>
            )}

            <div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setEmailTouched(true)}
                placeholder="Email"
                aria-invalid={emailTouched && !isEmailValid}
                className={`
                  w-full px-6 py-5 rounded-2xl bg-white/10 border text-white
                  placeholder:text-white/40 focus:outline-none transition-colors
                  ${
                    emailTouched && !isEmailValid
                      ? "border-red-400/60 focus:border-red-400/60"
                      : "border-white/20 focus:border-white/40"
                  }
                `}
              />
              {emailTouched && !isEmailValid && (
                <p className="mt-2 px-1 text-sm text-red-300/90 whitespace-nowrap">
                  Email латиницею і на .com, наприклад name@example.com
                </p>
              )}
            </div>

            <div>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Пароль"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() => setPasswordTouched(true)}
                  aria-invalid={passwordTouched && !isPasswordValid}
                  className={`
                    w-full px-5 py-4 pr-14 rounded-2xl bg-white/5 border
                    placeholder-white/40 focus:outline-none transition-colors
                    ${
                      passwordTouched && !isPasswordValid
                        ? "border-red-400/60 focus:border-red-400/60"
                        : "border-white/15 focus:border-white/40"
                    }
                  `}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Приховати пароль" : "Показати пароль"}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-white/50 hover:text-white/80 transition"
                >
                  {showPassword ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a20.3 20.3 0 0 1 5.06-5.94M9.9 4.24A10.4 10.4 0 0 1 12 4c7 0 11 8 11 8a20.32 20.32 0 0 1-3.22 4.6M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
              {passwordTouched && !isPasswordValid && (
                <p className="mt-2 px-1 text-sm text-red-300/90 whitespace-nowrap">
                  {PASSWORD_HINT}
                </p>
              )}
            </div>
          </div>

          <button
            disabled={!canSubmit}
            onClick={submit}
            className={`
              w-full mt-8 py-4 rounded-2xl font-semibold text-lg transition
              ${
                canSubmit
                  ? "bg-white text-black hover:scale-[1.02]"
                  : "bg-white/10 text-white/40 cursor-not-allowed"
              }
            `}
          >
            {submitting ? "Зачекайте…" : mode === "register" ? "Зареєструватися" : "Увійти"}
          </button>

          <div className="mt-6 text-center text-sm text-white/60">
            {mode === "register" ? (
              <>
                Вже є акаунт?{" "}
                <button onClick={() => switchMode("login")} className="text-white hover:underline">
                  Увійти
                </button>
              </>
            ) : (
              <>
                Немає акаунту?{" "}
                <button onClick={() => switchMode("register")} className="text-white hover:underline">
                  Зареєструватися
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
