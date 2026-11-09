import { useState } from "react";
import { restoreAccount, logoutAccount } from "../../lib/auth";

const RECOVERY_WINDOW_DAYS = 14;

// Shared "your account is pending deletion" screen — same three
// gating points as MfaCodeStep.tsx (App.tsx's boot effect,
// LoginPage.tsx, DashboardAuthPage.tsx), checked right after the MFA
// gate passes. See schema.sql's deletion_requested_at comment and
// lib/auth.ts's deleteAccount()/restoreAccount() for the full design.
type Props = {
  deletionRequestedAt: string;
  onRestored: () => void;
  onCancel: () => void;
};

export default function RestoreAccountStep({ deletionRequestedAt, onRestored, onCancel }: Props) {
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const daysElapsed = Math.floor(
    (Date.now() - new Date(deletionRequestedAt).getTime()) / (24 * 60 * 60 * 1000)
  );
  const daysLeft = Math.max(0, RECOVERY_WINDOW_DAYS - daysElapsed);

  const restore = async () => {
    setRestoring(true);
    setError(null);
    try {
      await restoreAccount();
      onRestored();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося відновити акаунт.");
    } finally {
      setRestoring(false);
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
          <h1 className="text-3xl font-bold mb-3">Відновити акаунт?</h1>
          <p className="text-white/75 leading-relaxed mb-8">
            Цей акаунт заплановано до видалення.{" "}
            {daysLeft > 0
              ? `У вас залишилось ${daysLeft} ${
                  daysLeft === 1 ? "день" : daysLeft < 5 ? "дні" : "днів"
                } щоб відновити його — потім він та всі пов'язані дані будуть видалені остаточно.`
              : "Час на відновлення майже сплив — акаунт буде видалено найближчим часом."}
          </p>

          {error && (
            <div className="mb-6 rounded-2xl bg-red-500/15 border border-red-400/30 px-5 py-4 text-red-100 text-sm">
              {error}
            </div>
          )}

          <button
            disabled={restoring}
            onClick={restore}
            className="w-full py-4 rounded-2xl font-semibold text-lg transition bg-white text-black hover:scale-[1.02] disabled:opacity-50"
          >
            {restoring ? "Відновлюємо…" : "Відновити акаунт"}
          </button>

          <div className="mt-6 text-center text-sm text-white/60">
            Не зараз —{" "}
            <button onClick={cancel} className="text-white hover:underline">
              вийти
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
