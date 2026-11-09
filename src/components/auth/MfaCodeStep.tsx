import { useEffect, useState } from "react";
import { listMfaFactors, mfaChallengeAndVerify, logoutAccount } from "../../lib/auth";

// Shared "enter your 2FA code" screen for every place a session can
// need it: right after signInWithPassword() in LoginPage.tsx and
// DashboardAuthPage.tsx (rendered inline, replacing the form), and
// from App.tsx's boot effect for a session that already had aal2
// pending when the page loaded/refreshed. No background of its own —
// the caller already sits inside the same gradient wrapper every other
// auth screen uses, so this only supplies the centered glass card.
type Props = {
  onVerified: () => void;
  // The person may not have their authenticator on hand — this signs
  // them back out and returns them to a clean login form rather than
  // trapping them on a code screen with no way out.
  onCancel: () => void;
};

export default function MfaCodeStep({ onVerified, onCancel }: Props) {
  const [factorId, setFactorId] = useState<string | null>(null);
  const [loadingFactor, setLoadingFactor] = useState(true);
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listMfaFactors().then((factors) => {
      setFactorId(factors[0]?.id ?? null);
      setLoadingFactor(false);
    });
  }, []);

  const canSubmit = !submitting && !!factorId && code.trim().length === 6;

  const submit = async () => {
    if (!canSubmit || !factorId) return;
    setSubmitting(true);
    setError(null);
    try {
      await mfaChallengeAndVerify(factorId, code.trim());
      onVerified();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Невірний код.");
    } finally {
      setSubmitting(false);
    }
  };

  const cancel = async () => {
    await logoutAccount();
    onCancel();
  };

  return (
    <div className="page-transition min-h-screen px-6 py-20 flex items-center justify-center">
      <div className="max-w-md w-full">
        <div className="rounded-[32px] bg-white/10 backdrop-blur-2xl border border-white/20 p-10 text-white">
          <h1 className="text-3xl font-bold mb-3">Підтвердьте вхід</h1>
          <p className="text-white/75 leading-relaxed mb-8">
            Введіть 6-значний код із застосунку-автентифікатора.
          </p>

          {error && (
            <div className="mb-6 rounded-2xl bg-red-500/15 border border-red-400/30 px-5 py-4 text-red-100 text-sm">
              {error}
            </div>
          )}

          {loadingFactor ? (
            <p className="text-white/50 text-sm">Зачекайте…</p>
          ) : !factorId ? (
            <p className="text-red-200 text-sm">
              Не вдалося знайти налаштовану двофакторну автентифікацію для цього акаунту.
            </p>
          ) : (
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="000000"
              inputMode="numeric"
              autoFocus
              className="w-full px-6 py-5 rounded-2xl bg-white/10 border border-white/20 text-white text-center text-2xl tracking-[0.4em] placeholder:text-white/30 focus:outline-none focus:border-white/40 transition-colors"
            />
          )}

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
            {submitting ? "Перевіряємо…" : "Підтвердити"}
          </button>

          <div className="mt-6 text-center text-sm text-white/60">
            Немає доступу до автентифікатора?{" "}
            <button onClick={cancel} className="text-white hover:underline">
              Вийти
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
