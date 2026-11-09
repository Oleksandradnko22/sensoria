import { useState } from "react";
import { useSession } from "../../context/SessionContext";
import { buildReferralLink } from "../../utils/referral";
import {
  authoredContent,
  promoCodes as promoCodesData,
  PROMO_REASONS,
  MAX_ACTIVE_PROMO_CODES,
  MAX_PROMO_DISCOUNT_PERCENT,
  type PromoCode,
} from "../../data/authorDashboard";

export default function AuthorPromotion() {
  const session = useSession();
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>(promoCodesData);
  const [newCode, setNewCode] = useState("");
  const [newDiscount, setNewDiscount] = useState("10");
  const [newTarget, setNewTarget] = useState<string>("all");
  const [newMaxUses, setNewMaxUses] = useState("50");
  const [newReason, setNewReason] = useState<(typeof PROMO_REASONS)[number]>(
    PROMO_REASONS[0]
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const referralLink = session ? buildReferralLink(window.location.origin, session.profile.id) : "";
  const activeCount = promoCodes.filter((p) => p.active).length;
  const atLimit = activeCount >= MAX_ACTIVE_PROMO_CODES;

  const createCode = () => {
    if (atLimit) {
      setFormError(
        `Можна мати не більше ${MAX_ACTIVE_PROMO_CODES} активних промокодів одночасно. Вимкніть один, щоб створити новий.`
      );
      return;
    }
    if (!newCode.trim()) {
      setFormError("Вкажіть код.");
      return;
    }
    const discount = Math.min(
      Number(newDiscount) || 0,
      MAX_PROMO_DISCOUNT_PERCENT
    );
    const maxUses = Math.max(1, Number(newMaxUses) || 1);

    setFormError(null);
    setPromoCodes((prev) => [
      {
        code: newCode.trim().toUpperCase(),
        discountPercent: discount,
        contentId: newTarget,
        uses: 0,
        maxUses,
        active: true,
        expiresAt: null,
        reason: newReason,
      },
      ...prev,
    ]);
    setNewCode("");
    setNewDiscount("10");
    setNewTarget("all");
    setNewMaxUses("50");
    setNewReason(PROMO_REASONS[0]);
  };

  const toggleActive = (code: string) => {
    setPromoCodes((prev) =>
      prev.map((p) => (p.code === code ? { ...p, active: !p.active } : p))
    );
  };

  const copyLink = () => {
    if (referralLink) void navigator.clipboard?.writeText(referralLink).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold">Просування</h1>
        <p className="text-black/50 mt-1">
          Промокоди, реферальні посилання та шеринг.
        </p>
      </div>

      {/* REFERRAL LINK */}
      <div className="rounded-2xl bg-white border border-black/5 p-6">
        <h2 className="text-[17px] font-semibold mb-1">Реферальне посилання</h2>
        <p className="text-[13px] text-black/45 mb-4">
          Діліться цим посиланням: якщо покупець прийшов по ньому й купив ваш
          матеріал протягом 30 днів, комісія платформи з цієї покупки буде зниженою
          (15% замість 30%).
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="px-4 py-2.5 rounded-xl bg-black/5 text-[14px] font-mono">
            {referralLink}
          </div>
          <button
            onClick={copyLink}
            className="px-4 py-2.5 rounded-xl bg-black text-white text-[13px] font-medium hover:opacity-90 transition"
          >
            {copied ? "Скопійовано ✓" : "Копіювати"}
          </button>
          <div className="flex gap-2">
            {["Facebook", "Instagram", "Telegram"].map((s) => (
              <button
                key={s}
                className="px-3.5 py-2.5 rounded-xl border border-black/10 text-[13px] hover:bg-black/5 transition"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* CREATE PROMO CODE */}
      <div className="rounded-2xl bg-white border border-black/5 p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-[17px] font-semibold">Створити промокод</h2>
          <span className="text-[12px] text-black/40">
            {activeCount} / {MAX_ACTIVE_PROMO_CODES} активних
          </span>
        </div>
        <p className="text-[13px] text-black/45 mb-4">
          Знижка списується з вашої винагороди автора — комісія платформи
          завжди залишається незмінною. Кожен код потребує причини, щоб
          команда Sensoria розуміла, звідки він з'явився.
        </p>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <div className="text-[12px] text-black/45 mb-1.5">Код</div>
            <input
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              placeholder="НАПРИКЛАД, AUTUMN15"
              disabled={atLimit}
              className="px-3.5 py-2.5 rounded-xl border border-black/10 text-[14px] focus:outline-none focus:border-black/30 w-[200px] disabled:bg-black/5"
            />
          </div>
          <div>
            <div className="text-[12px] text-black/45 mb-1.5">
              Знижка, % (макс. {MAX_PROMO_DISCOUNT_PERCENT})
            </div>
            <input
              value={newDiscount}
              onChange={(e) => setNewDiscount(e.target.value.replace(/[^\d]/g, ""))}
              disabled={atLimit}
              className="px-3.5 py-2.5 rounded-xl border border-black/10 text-[14px] focus:outline-none focus:border-black/30 w-[100px] disabled:bg-black/5"
            />
          </div>
          <div>
            <div className="text-[12px] text-black/45 mb-1.5">Ліміт використань</div>
            <input
              value={newMaxUses}
              onChange={(e) => setNewMaxUses(e.target.value.replace(/[^\d]/g, ""))}
              disabled={atLimit}
              className="px-3.5 py-2.5 rounded-xl border border-black/10 text-[14px] focus:outline-none focus:border-black/30 w-[110px] disabled:bg-black/5"
            />
          </div>
          <div>
            <div className="text-[12px] text-black/45 mb-1.5">Діє на</div>
            <select
              value={newTarget}
              onChange={(e) => setNewTarget(e.target.value)}
              disabled={atLimit}
              className="px-3.5 py-2.5 rounded-xl border border-black/10 text-[14px] bg-white focus:outline-none focus:border-black/30 disabled:bg-black/5"
            >
              <option value="all">Весь мій контент</option>
              {authoredContent.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-[12px] text-black/45 mb-1.5">Причина</div>
            <select
              value={newReason}
              onChange={(e) =>
                setNewReason(e.target.value as (typeof PROMO_REASONS)[number])
              }
              disabled={atLimit}
              className="px-3.5 py-2.5 rounded-xl border border-black/10 text-[14px] bg-white focus:outline-none focus:border-black/30 disabled:bg-black/5"
            >
              {PROMO_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={createCode}
            disabled={atLimit}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white text-[14px] font-medium hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Створити
          </button>
        </div>

        {formError && (
          <div className="text-[13px] text-red-500 mt-3">{formError}</div>
        )}
      </div>

      {/* PROMO CODES LIST */}
      <div className="rounded-2xl bg-white border border-black/5 overflow-hidden">
        <div className="grid grid-cols-[0.9fr_0.7fr_1.2fr_0.9fr_0.9fr_0.8fr] gap-4 px-6 py-3 text-[12px] uppercase tracking-wide text-black/40 border-b border-black/5">
          <div>Код</div>
          <div>Знижка</div>
          <div>Діє на</div>
          <div>Причина</div>
          <div>Використано</div>
          <div>Статус</div>
        </div>
        {promoCodes.map((p) => (
          <div
            key={p.code}
            className="grid grid-cols-[0.9fr_0.7fr_1.2fr_0.9fr_0.9fr_0.8fr] gap-4 px-6 py-4 items-center border-b border-black/5 last:border-0 text-[14px]"
          >
            <div className="font-mono font-medium">{p.code}</div>
            <div>{p.discountPercent}%</div>
            <div className="text-black/60 truncate">
              {p.contentId === "all"
                ? "Весь контент"
                : authoredContent.find((c) => c.id === p.contentId)?.title ?? p.contentId}
            </div>
            <div className="text-black/50 text-[13px] truncate">{p.reason}</div>
            <div className="text-black/60">
              {p.uses} / {p.maxUses}
            </div>
            <div>
              <button
                onClick={() => toggleActive(p.code)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition ${
                  p.active
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-black/5 text-black/45"
                }`}
              >
                {p.active ? "Активний" : "Вимкнено"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
