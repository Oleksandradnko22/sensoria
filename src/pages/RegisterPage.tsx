import { useState } from "react";
import {
  registerAccount,
  fetchCurrentProfile,
  translateAuthError,
  type Profile,
} from "../lib/auth";
import ConsentCheckbox from "../components/ConsentCheckbox";
import { isPasswordValid as isPasswordRuleValid, PASSWORD_HINT } from "../utils/passwordRules";

type Props = {
  stateTitle: string;
  recommendationTitle: string;

  onAuthenticated: (profile: Profile) => void;
  onGoToLogin: () => void;
};

export default function RegisterPage({
  stateTitle: _stateTitle,
  recommendationTitle: _recommendationTitle,
  onAuthenticated,
  onGoToLogin,
}: Props) {

  const [name, setName] =
  useState("");

const [email, setEmail] =
  useState("");

const [password, setPassword] =
  useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [consent, setConsent] = useState(false);
  const [age18, setAge18] = useState(false);

  // "Touched" flags — errors only render after the user leaves a field
  // (or tries to submit), not while they're still typing into it for
  // the first time. Validation itself still gates `canContinue`
  // regardless of touched state, so an invalid-but-untouched field
  // simply keeps the button disabled without shaming the user yet.
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);

  // Real signup state — this used to just move to the next screen with
  // no account actually created anywhere (see git history). Now it's a
  // genuine Supabase signUp(), so it can be in flight, fail, or succeed
  // without an active session yet (email confirmation required).
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  // Latin characters only, and must end in ".com" specifically (Sasha's
  // spec) — not a general RFC 5322 shape check anymore.
  const EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)*\.com$/;
  const isEmailValid = EMAIL_PATTERN.test(email.trim());
  // 8+ chars, Latin only, at least one special character (utils/passwordRules).
  const isPasswordValid = isPasswordRuleValid(password);

  const canContinue =
  !submitting &&
  name.trim().length > 1 &&
  isEmailValid &&
  isPasswordValid &&
  consent &&
  age18;

  const submit = async () => {
    if (!canContinue) return;
    setFormError(null);
    setInfoMessage(null);
    setSubmitting(true);
    try {
      await registerAccount("participant", name.trim(), email.trim(), password);
      const profile = await fetchCurrentProfile();

      if (!profile) {
        // signUp() can succeed without an active session if the
        // Supabase project requires email confirmation first — nothing
        // to hand off to App.tsx yet in that case.
        setInfoMessage(
          "Акаунт створено. Підтвердіть email за посиланням у листі, потім увійдіть."
        );
        return;
      }

      onAuthenticated(profile);
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

        {/* SAVE PLAN */}

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
            Збережіть свій персональний план
          </h1>

          <p
            className="
              text-white/75
              leading-relaxed
              mb-8
            "
          >
            Ваш результат буде збережено.
            Ви зможете повернутися до
            рекомендацій та відстежувати
            свій прогрес у будь-який час.
          </p>

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

          <div className="space-y-5">

            <input
  type="text"
  placeholder="Ім'я"

  value={name}

  onChange={(e) =>
    setName(
      e.target.value
    )
  }

  className="
    w-full

    px-5
    py-4

    rounded-2xl

    bg-white/5
    border border-white/15

    placeholder-white/40

    focus:outline-none
    focus:border-white/40
  "
/>

<div>
  <input
    type="email"
    value={email}
    onChange={(e) =>
      setEmail(e.target.value)
    }
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

                  onChange={(e) =>
                    setPassword(
                      e.target.value
                    )
                  }
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

          <div className="mt-6">
            <ConsentCheckbox checked={consent} onChange={setConsent} ageChecked={age18} onAgeChange={setAge18} />
          </div>

          <div
            className="
              mt-6
              mb-8

              text-sm
              text-white/60
            "
          >
            Після збереження ви отримаєте
            персональну рекомендацію та
            зможете почати роботу над своїм
            станом.
          </div>

          <button
            disabled={!canContinue}

            onClick={submit}

            className={`
              w-full

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
            {submitting ? "Зберігаємо…" : "Зберегти результат"}
          </button>

          <div
            className="
              mt-6
              text-center
              text-sm
              text-white/60
            "
          >
            Вже є акаунт?{" "}
            <button
              onClick={onGoToLogin}
              className="
                text-white
                hover:underline
              "
            >
              Увійти
            </button>
          </div>

        </div>

      </div>
    </div>
  );
}
