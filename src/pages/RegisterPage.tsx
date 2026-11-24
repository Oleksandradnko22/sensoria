import { EMAIL_HINT, isValidEmail } from "../utils/emailFormat";
import { Icon } from "../components/ui/Icon";
import { useState } from "react";
import {
  registerAccount,
  fetchCurrentProfile,
  translateAuthError,
  type Profile,
} from "../lib/auth";
import { isPasswordValid as isPasswordRuleValid, PASSWORD_HINT } from "../utils/passwordRules";

type Props = {
  stateTitle: string;
  recommendationTitle: string;

  onAuthenticated: (profile: Profile) => void;
  onGoToLogin: () => void;
};

export default function RegisterPage({
  stateTitle,
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
  const isEmailValid = isValidEmail(email);
  // 8+ chars, Latin only, at least one special character (utils/passwordRules).
  const isPasswordValid = isPasswordRuleValid(password);

  const canContinue =
  !submitting &&
  name.trim().length > 1 &&
  isEmailValid &&
  isPasswordValid;

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

  const field = "w-full rounded-2xl border bg-white/10 px-5 py-4 text-white placeholder:text-white/45 transition-colors focus:outline-none reg-input";
  return (
    // one column on phones and portrait tablets; on landscape screens (laptops, tablets sideways, Duo) the card runs
    // wide in two columns — the title on the left, the form on the right — so it fits one screen (index.css, .reg-*)
    <div className="funnel-page reg-page flex items-center justify-center px-7 py-8 sm:px-8 sm:py-10">
      <div className="reg-card w-full max-w-[520px] rounded-[28px] border border-white/20 bg-white/10 p-5 text-white backdrop-blur-2xl sm:p-10">
        <div className="reg-grid">
          <div className="reg-intro relative">
            <div className="relative">
              <span className="reg-chip mb-5 hidden items-center gap-2 rounded-full bg-white/12 px-3.5 py-1.5 text-[13px] font-semibold text-white/90 ring-1 ring-white/20">
                <span aria-hidden="true" className="h-2 w-2 rounded-full bg-gradient-to-r from-[#a8e8ff] to-[#e4ddff]" />
                Ваш результат: {stateTitle}
              </span>
              <h1 className="mb-4 text-[28px] font-bold leading-tight sm:text-4xl">Збережіть свій персональний план</h1>
              <p className="leading-relaxed text-white/75">
                Ваш результат буде збережено. Ви зможете повернутися до рекомендацій та відстежувати свій прогрес у будь-який час.
              </p>
              <p className="reg-note mt-4 text-sm leading-relaxed text-white/60">
                Після збереження ви отримаєте персональну рекомендацію та зможете почати роботу над своїм станом.
              </p>
              {/* wide screens: what the person gets, in the brand's style */}
              <ul className="reg-perks mt-7 hidden flex-col gap-3">
                {[
                  { icon: "chart" as const, text: "Результат тесту збережеться у вашому кабінеті" },
                  { icon: "compass" as const, text: "Персональна добірка програм, гайдів і медитацій" },
                  { icon: "heart" as const, text: "Реєстрація безкоштовна" },
                ].map((p) => (
                  <li key={p.text} className="flex items-center gap-3 text-[15px] text-white/85">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#3b6df0] to-[#7c5cf0] shadow-[0_8px_20px_-8px_rgba(76,80,230,0.8)]">
                      <Icon name={p.icon} size={17} />
                    </span>
                    {p.text}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* a real form: Enter submits it, and password managers offer to save the new password */}
          <form
            className="reg-form mt-7"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (canContinue) void submit();
            }}
          >
            {infoMessage && (
              <div className="mb-5 rounded-2xl border border-emerald-400/30 bg-emerald-500/15 px-5 py-4 text-sm text-emerald-100">{infoMessage}</div>
            )}
            {formError && (
              <div className="mb-5 rounded-2xl border border-red-400/30 bg-red-500/15 px-5 py-4 text-sm text-red-100">{formError}</div>
            )}

            <div className="space-y-4">
              <input type="text" placeholder="Ім'я" value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" aria-label="Ім'я" className={`${field} border-white/20 focus:border-white/45`} />
              <div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => setEmailTouched(true)}
                  placeholder="Email"
                  autoComplete="email"
                  aria-label="Email"
                  aria-invalid={emailTouched && !isEmailValid}
                  className={`${field} ${emailTouched && !isEmailValid ? "border-red-400/60 focus:border-red-400/60" : "border-white/20 focus:border-white/45"}`}
                />
                {emailTouched && !isEmailValid && <p className="mt-2 px-1 text-sm text-red-300/90">{EMAIL_HINT}</p>}
              </div>
              <div>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Пароль"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onBlur={() => setPasswordTouched(true)}
                    autoComplete="new-password"
                    aria-label="Пароль"
                    aria-invalid={passwordTouched && !isPasswordValid}
                    className={`${field} pr-14 ${passwordTouched && !isPasswordValid ? "border-red-400/60 focus:border-red-400/60" : "border-white/20 focus:border-white/45"}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Приховати пароль" : "Показати пароль"}
                    className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-white/55 transition hover:text-white/85 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  >
                    {showPassword ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a20.3 20.3 0 0 1 5.06-5.94M9.9 4.24A10.4 10.4 0 0 1 12 4c7 0 11 8 11 8a20.32 20.32 0 0 1-3.22 4.6M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
                {passwordTouched && !isPasswordValid && <p className="mt-2 px-1 text-sm text-red-300/90">{PASSWORD_HINT}</p>}
              </div>
            </div>

            <p className="mt-5 text-[13px] leading-relaxed text-white/70">Після реєстрації ви ознайомитеся з умовами користування та приймете їх перед входом у кабінет.</p>

            <button
              type="submit"
              disabled={!canContinue}
              className={`mt-6 inline-flex min-h-[56px] w-full items-center justify-center rounded-2xl text-[17px] font-bold transition ${
                canContinue ? "bg-white text-[#1e2a78] shadow-[0_14px_40px_rgba(10,20,90,0.35)] hover:-translate-y-0.5" : "cursor-not-allowed bg-white/15 text-white/50"
              }`}
            >
              {submitting ? "Зберігаємо…" : "Зберегти результат"}
            </button>

            <div className="mt-5 text-center text-sm text-white/65">
              Вже є акаунт?{" "}
              <button type="button" onClick={onGoToLogin} className="font-semibold text-white underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-white rounded">
                Увійти
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
