import { useState } from "react";
import {
  loginAccount,
  logoutAccount,
  fetchCurrentProfile,
  translateAuthError,
  getMfaStatus,
  type Profile,
} from "../lib/auth";
import MfaCodeStep from "../components/auth/MfaCodeStep";
import RestoreAccountStep from "../components/auth/RestoreAccountStep";
import { isPasswordValid as isPasswordRuleValid, PASSWORD_HINT } from "../utils/passwordRules";

type Props = {
  onAuthenticated: (profile: Profile) => void;
  onBackToRegister: () => void;
};

export default function LoginPage({ onAuthenticated, onBackToRegister }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Same "touched" pattern as RegisterPage — errors only show after the
  // user leaves a field, not while they're still typing into it.
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Set only when signInWithPassword() succeeded but the account has
  // 2FA on and the session hasn't cleared aal2 yet — see getMfaStatus()
  // in lib/auth.ts. Holds the already-fetched profile so it can be
  // handed to onAuthenticated() the moment the code step passes,
  // without a second fetchCurrentProfile() round trip.
  const [pendingProfile, setPendingProfile] = useState<Profile | null>(null);
  // Checked after the MFA gate passes — see proceedAfterAuth() below.
  const [pendingRestoreProfile, setPendingRestoreProfile] = useState<Profile | null>(null);

  // Single funnel for "we now have a fully-authenticated profile, what
  // next" — used both right after signInWithPassword() and from
  // MfaCodeStep's onVerified, so the deletion-pending check only has
  // to be written once.
  const proceedAfterAuth = (profile: Profile) => {
    if (profile.deletionRequestedAt) {
      setPendingRestoreProfile(profile);
      return;
    }
    onAuthenticated(profile);
  };

  // Same rule as RegisterPage: Latin characters only, must end in ".com".
  const EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)*\.com$/;
  const isEmailValid = EMAIL_PATTERN.test(email.trim());
  const isPasswordValid = isPasswordRuleValid(password);

  const canContinue = !submitting && isEmailValid && isPasswordValid;

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

  const submit = async () => {
    if (!canContinue) return;
    setFormError(null);
    setSubmitting(true);
    try {
      await loginAccount(email.trim(), password);
      const profile = await fetchCurrentProfile();

      if (!profile) {
        setFormError("Не вдалося увійти. Спробуйте ще раз.");
        return;
      }

      if (profile.role !== "participant") {
        // This login form only ever creates/signs into participant
        // accounts (the wellbeing funnel isn't an author entry point) —
        // an author trying the same email/password here shouldn't get
        // silently let into a participant session under their author
        // identity.
        await logoutAccount();
        setFormError(
          "Цей email зареєстрований як акаунт автора. Скористайтесь входом для авторів."
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
    <div
      className="
        min-h-screen
        px-6
        py-20

        flex
        items-center
        justify-center
      "
    >
      <div className="max-w-2xl w-full">
        <div
          className="
            rounded-[32px]

            bg-white/10
            backdrop-blur-2xl

            border border-white/20

            p-10

            text-white
          "
        >
          <h1
            className="
              text-4xl
              font-bold
              mb-5
            "
          >
            Увійдіть у свій акаунт
          </h1>

          <p
            className="
              text-white/75
              leading-relaxed
              mb-8
            "
          >
            Введіть email та пароль, щоб
            повернутися до свого
            персонального плану.
          </p>

          {formError && (
            <div className="mb-6 rounded-2xl bg-red-500/15 border border-red-400/30 px-5 py-4 text-red-100 text-sm">
              {formError}
            </div>
          )}

          <div className="space-y-5">
            <div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setEmailTouched(true)}
                placeholder="Email"
                aria-invalid={emailTouched && !isEmailValid}
                className={`
                  w-full
                  px-6
                  py-5
                  rounded-2xl
                  bg-white/10
                  border
                  text-white
                  placeholder:text-white/40
                  focus:outline-none
                  transition-colors
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
                    w-full

                    px-5
                    py-4
                    pr-14

                    rounded-2xl

                    bg-white/5
                    border

                    placeholder-white/40

                    focus:outline-none
                    transition-colors

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
            disabled={!canContinue}
            onClick={submit}
            className={`
              w-full

              mt-8

              py-4

              rounded-2xl

              font-semibold
              text-lg

              transition

              ${
                canContinue
                  ? `
                    bg-white
                    text-black
                    hover:scale-[1.02]
                  `
                  : `
                  bg-white/10
                    text-white/40
                    cursor-not-allowed
                  `
              }
            `}
          >
            {submitting ? "Зачекайте…" : "Увійти"}
          </button>

          <div
            className="
              mt-6
              text-center
              text-sm
              text-white/60
            "
          >
            Немає акаунту?{" "}
            <button
              onClick={onBackToRegister}
              className="
                text-white
                hover:underline
              "
            >
              Зареєструватися
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
