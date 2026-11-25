import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  enrollMfa, fetchCurrentProfile, getMfaStatus, loginAccount, logoutAccount, translateAuthError, verifyMfaEnrollment,
  type MfaEnrollment, type Profile,
} from "../lib/auth";
import MfaCodeStep from "../components/auth/MfaCodeStep";

// The owner's own entrance to the admin panel: sensoria.courses/admin. Not linked from the site and hidden from search.
// Three locks: e-mail + password, the admin flag checked on the server, and a code from the authenticator app (2FA) —
// without the code nothing opens; admin-data also refuses every request of a session that has not passed 2FA (aal2).
// A stranger sees a plain sign-in form and «Невірний email або пароль» — never a hint that an admin panel exists.
type Step = "checking" | "form" | "enroll" | "code" | "open";

const card = "w-full max-w-[440px] rounded-3xl bg-white p-6 text-[#12172b] shadow-[0_24px_60px_-24px_rgba(10,20,90,0.55)] sm:p-8";
const input = "min-h-[52px] w-full rounded-2xl border border-[#e3e1f5] bg-[#f8f8fe] px-4 text-[16px] outline-none focus:border-[#6d5cf0] focus:bg-white";
const btn = "min-h-[52px] w-full rounded-2xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-[16px] font-semibold text-white disabled:opacity-50";

export default function AdminGate({ session, onSession, children }: { session: Profile | null; onSession: (p: Profile | null) => void; children: ReactNode }) {
  const [step, setStep] = useState<Step>("checking");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<MfaEnrollment | null>(null);
  const [code, setCode] = useState("");
  const enrolling = useRef(false);

  // never indexed, never cached in a shared preview
  useEffect(() => {
    const m = document.createElement("meta");
    m.name = "robots"; m.content = "noindex, nofollow";
    document.head.appendChild(m);
    const title = document.title; document.title = "Вхід — Sensoria";
    return () => { m.remove(); document.title = title; };
  }, []);

  // decide what this visitor needs: the form, the 2FA setup, the code — or the panel
  const decide = async (p: Profile | null) => {
    if (!p?.isAdmin) { setStep("form"); return; }
    // dev only: the sample admin of ?devSession=admin (no real session — the panel shows its empty states)
    if (import.meta.env.DEV && p.id === "00000000-0000-0000-0000-000000000000") { setStep("open"); return; }
    const mfa = await getMfaStatus();
    if (mfa.needsChallenge) { setStep("code"); return; }
    if (!mfa.isEnrolled) {
      setStep("enroll");
      if (enrolling.current) return;
      enrolling.current = true;
      try { setEnrollment(await enrollMfa()); } catch (e) { setError(e instanceof Error ? e.message : "Не вдалося почати налаштування."); }
      return;
    }
    setStep("open");
  };
  useEffect(() => { void decide(session); }, [session?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const signIn = async () => {
    setBusy(true); setError(null);
    try {
      await loginAccount(email.trim(), password);
      const p = await fetchCurrentProfile();
      if (!p?.isAdmin) { await logoutAccount(); onSession(null); setError("Невірний email або пароль."); return; }
      onSession(p);
      await decide(p);
    } catch (e) {
      setError(e instanceof Error && /invalid|credentials/i.test(e.message) ? "Невірний email або пароль." : e instanceof Error ? translateAuthError(e.message) : "Щось пішло не так.");
    } finally { setBusy(false); setPassword(""); }
  };

  const confirmEnroll = async () => {
    if (!enrollment) return;
    setBusy(true); setError(null);
    try { await verifyMfaEnrollment(enrollment.factorId, code.replace(/\D/g, "")); setStep("open"); }
    catch (e) { setError(e instanceof Error ? e.message : "Невірний код."); }
    finally { setBusy(false); }
  };

  if (step === "open" && session?.isAdmin) return <>{children}</>;

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-gradient-to-br from-[#1e3a8a] via-[#2563eb] to-[#8b5cf6] px-4 py-10">
      {step === "checking" && <p className="text-white/80">Перевіряємо…</p>}

      {step === "form" && (
        <form className={card} onSubmit={(e) => { e.preventDefault(); void signIn(); }}>
          <h1 className="text-[24px] font-bold">Вхід</h1>
          <div className="mt-5 grid gap-3">
            <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" aria-label="Email" className={input} />
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Пароль" aria-label="Пароль" className={input} />
          </div>
          {error && <p role="alert" className="mt-3 text-[14px] text-[#c0262d]">{error}</p>}
          <button type="submit" disabled={busy || !email.trim() || !password} className={`${btn} mt-5`}>{busy ? "Входимо…" : "Увійти"}</button>
        </form>
      )}

      {step === "code" && (
        <MfaCodeStep onVerified={() => setStep("open")} onCancel={() => { void logoutAccount().then(() => { onSession(null); setStep("form"); }); }} />
      )}

      {step === "enroll" && (
        <div className="page-container w-full">
          <div className="grid gap-8 rounded-3xl bg-white p-6 text-[#12172b] shadow-[0_24px_60px_-24px_rgba(10,20,90,0.55)] sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:gap-12 lg:p-12">
            <div>
              <h1 className="text-[24px] font-bold sm:text-[30px]">Захист входу кодом з телефона</h1>
              <p className="mt-3 text-[16px] leading-relaxed text-[#4a5070]">Один раз — і назавжди. Код змінюється кожні 30 секунд і живе лише у вашому телефоні, тож без нього в адмінку не ввійде ніхто, навіть знаючи пароль.</p>
              <ol className="mt-6 space-y-3 text-[16px] leading-relaxed text-[#2d2a5c]">
                <li><b>1.</b> Встановіть на телефон <b>Google Authenticator</b> (або «Паролі» на iPhone).</li>
                <li><b>2.</b> У додатку натисніть «+» і відскануйте QR-код.</li>
                <li><b>3.</b> Введіть 6 цифр, які покаже додаток, і натисніть «Підтвердити».</li>
              </ol>
              <p className="mt-6 rounded-2xl bg-[#f5f4ff] p-4 text-[14px] leading-relaxed text-[#4a5070]">Новий ноутбук не завадить: код у телефоні, тож на будь-якому пристрої ви входите email, паролем і кодом. Порада: у Google Authenticator увімкніть резервну копію в Google-акаунт — тоді коди переїдуть і на новий телефон.</p>
            </div>
            <div className="flex flex-col">
              {enrollment ? (
                <>
                  <img src={enrollment.qrCode} alt="QR-код для додатка-автентифікатора" className="mx-auto h-52 w-52 rounded-2xl bg-white p-2 ring-1 ring-[#ebe8ff]" />
                  <p className="mt-2 break-all text-center font-mono text-[12px] text-black/60 select-all">{enrollment.secret}</p>
                </>
              ) : <p className="text-center text-black/50">Готуємо QR-код…</p>}
              <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} placeholder="6 цифр" aria-label="Код з додатка" className={`${input} mt-5 text-center tracking-[0.3em]`} />
              {error && <p role="alert" className="mt-3 text-[14px] text-[#c0262d]">{error}</p>}
              <button type="button" disabled={busy || code.replace(/\D/g, "").length !== 6} onClick={() => void confirmEnroll()} className={`${btn} mt-4`}>Підтвердити</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
