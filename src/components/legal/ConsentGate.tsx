import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { acceptLegal, fetchMissingConsents, sendLegalOtp, verifyLegalOtp, type MissingConsent } from "../../lib/legalGate";
import { logoutAccount } from "../../lib/auth";
import { saveNotificationPref } from "../../lib/notificationPrefs";
import { fetchHealthConsent } from "../../lib/healthConsent";
import { Icon } from "../ui/Icon";
import { AUTHOR_ITEMS, HEALTH_HINT, OTP_TEXT, PARTICIPANT_ITEMS, type ConsentItem } from "../../data/consentTexts";

// Release B consent screen (docs/consent-legal-spec.md, 2): after ANY sign-in (email, Google, new device, reload), the
// whole site is covered until the current editions are accepted. No skip, no Esc, nothing pre-ticked, no timers.
// Public legal pages stay readable. The server enforces the same (RLS, send-message, finance) — this is only the UI.
const OPEN_PATHS = ["/terms", "/privacy", "/refunds", "/author-agreement", "/participant-agreement", "/crisis-help", "/contacts"];

const DOCS: Record<"participant" | "author", { href: string; label: string }[]> = {
  participant: [
    { href: "/participant-agreement", label: "Угода учасника" },
    { href: "/terms", label: "Умови використання" },
    { href: "/refunds", label: "Правила повернення коштів" },
    { href: "/privacy", label: "Політика конфіденційності" },
  ],
  author: [
    { href: "/author-agreement", label: "Договір з автором (оферта)" },
    { href: "/terms", label: "Умови використання" },
    { href: "/privacy", label: "Політика конфіденційності" },
  ],
};

function usePathname() {
  const [path, setPath] = useState(() => window.location.pathname);
  useEffect(() => {
    const sync = () => setPath(window.location.pathname);
    const push = window.history.pushState;
    const replace = window.history.replaceState;
    window.history.pushState = function (...a: Parameters<typeof push>) { push.apply(this, a); sync(); };
    window.history.replaceState = function (...a: Parameters<typeof replace>) { replace.apply(this, a); sync(); };
    window.addEventListener("popstate", sync);
    return () => {
      window.history.pushState = push;
      window.history.replaceState = replace;
      window.removeEventListener("popstate", sync);
    };
  }, []);
  return path;
}

export default function ConsentGate() {
  const [missing, setMissing] = useState<MissingConsent[]>([]);
  const path = usePathname();

  const check = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.auth.getSession();
    if (!data.session) return setMissing([]);
    const m = await fetchMissingConsents();
    setMissing(m ?? []);
  }, []);

  useEffect(() => {
    if (!supabase) return;
    void check();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") setMissing([]);
      else if (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "USER_UPDATED") void check();
    });
    const onRequest = () => void check();
    window.addEventListener("sensoria:consent-check", onRequest);
    return () => {
      data.subscription.unsubscribe();
      window.removeEventListener("sensoria:consent-check", onRequest);
    };
  }, [check]);

  if (missing.length === 0 || OPEN_PATHS.includes(path.replace(/\/+$/, ""))) return null;
  const kind = missing.some((m) => m.document === "author_agreement") ? "author" : "participant";
  return <GateScreen kind={kind} missing={missing} onDone={() => void check()} />;
}

export function GateScreen({ kind, missing, onDone }: { kind: "participant" | "author"; missing: MissingConsent[]; onDone: () => void }) {
  const items = kind === "author" ? AUTHOR_ITEMS : PARTICIPANT_ITEMS;
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [opened, setOpened] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"items" | "code">("items");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const shownAt = useRef(Date.now());
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    titleRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  useEffect(() => {
    if (resendAt <= now) return;
    const t = window.setTimeout(() => setNow(Date.now()), 1000);
    return () => window.clearTimeout(t);
  }, [resendAt, now]);

  const allRequired = items.every((i) => !i.required || checked[i.key]);
  const accepted = (): ConsentItem[] => items.filter((i) => checked[i.key]);
  const updates = missing.filter((m) => m.isUpdate && m.changesSummary);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Щось пішло не так. Спробуйте ще раз.");
    } finally {
      setBusy(false);
    }
  };

  const submitItems = () =>
    run(async () => {
      if (kind === "participant") {
        await acceptLegal("participant", accepted(), Date.now() - shownAt.current, opened);
        // item 4 may have given the emotional-data consent: refresh it (a waiting test result is saved then)
        void fetchHealthConsent(true);
        // item 5 and the «Нові матеріали» switch in «Профіль» are one and the same (spec 4.5)
        if (checked.p5 && supabase) {
          const { data } = await supabase.auth.getUser();
          if (data.user) await saveNotificationPref(data.user.id, "newContent", { email: true });
        }
        onDone();
        return;
      }
      const r = await sendLegalOtp("author_agreement");
      setEmail(r.to ?? "");
      setResendAt(Date.now() + 60_000);
      setNow(Date.now());
      setStep("code");
    });

  const resend = () =>
    run(async () => {
      await sendLegalOtp("author_agreement");
      setResendAt(Date.now() + 60_000);
      setNow(Date.now());
    });

  const submitCode = () =>
    run(async () => {
      await verifyLegalOtp(code, "author_agreement");
      await acceptLegal("author", accepted(), Date.now() - shownAt.current, opened);
      onDone();
    });

  const leave = () =>
    run(async () => {
      await logoutAccount();
      window.location.assign("/");
    });

  const wait = Math.max(0, Math.ceil((resendAt - now) / 1000));

  const required = items.filter((i) => i.required);
  const optional = items.filter((i) => !i.required);
  const doneCount = required.filter((i) => checked[i.key]).length;

  const itemRow = (it: ConsentItem) => (
    <li key={it.key}>
      <label className={`flex gap-3 items-start rounded-2xl px-4 py-2.5 cursor-pointer ring-1 transition-colors ${checked[it.key] ? "bg-[#eef0fd] ring-[#c9cffa]" : "bg-white ring-[#ece9f8] hover:bg-[#fafaff] hover:ring-[#d9d4f7]"}`}>
        <input
          type="checkbox"
          checked={!!checked[it.key]}
          onChange={(e) => setChecked((c) => ({ ...c, [it.key]: e.target.checked }))}
          className="mt-[3px] h-[18px] w-[18px] shrink-0 accent-[#4338ca] cursor-pointer"
        />
        <span className="text-[14px] text-gray-800 leading-relaxed">
          {it.text}
          {it.key === "p4" && <span className="block mt-1 text-[13px] text-gray-500 leading-relaxed">{HEALTH_HINT}</span>}
        </span>
      </label>
    </li>
  );

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="gate-title" className="fixed inset-0 z-[1000] overflow-y-auto sensoria-scroll bg-gradient-to-br from-[#1e3a8a] via-[#2563eb] to-[#8b5cf6]">
      <div className="min-h-full flex items-center justify-center p-4 sm:p-8 lg:p-12">
        <div className="gate-card w-full max-w-[1200px] rounded-[28px] bg-white text-[#0f172a] shadow-[0_24px_60px_-30px_rgba(15,23,100,0.6)] p-5 sm:p-7">
          <div className="flex items-start gap-4">
            <span aria-hidden="true" className="hidden sm:flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#3b6df0] to-[#7c5cf0] text-white">
              <Icon name="shield" size={22} />
            </span>
            <div className="min-w-0">
              <p className="text-[12px] font-semibold tracking-[0.2em] text-[#4338ca]">SENSORIA</p>
              <h1 id="gate-title" ref={titleRef} tabIndex={-1} className="mt-1 text-[22px] sm:text-[26px] font-bold leading-tight outline-none">
                {kind === "author" ? "Договір з автором" : "Угода учасника"}
              </h1>
              <p className="mt-1.5 text-[15px] text-gray-600 leading-relaxed">
                {updates.length > 0 ? "Ми оновили умови. Перегляньте, що змінилося, і підтвердьте згоду, щоб продовжити." : "Перш ніж продовжити, ознайомтеся з умовами й підтвердьте згоду."}
              </p>
            </div>
          </div>

          {updates.length > 0 && (
            <section aria-labelledby="gate-changes" className="mt-5 rounded-2xl bg-[#f6f7ff] ring-1 ring-[#e5e7f5] p-4">
              <h2 id="gate-changes" className="font-semibold text-[15px]">Що змінилося</h2>
              <ul className="mt-2 list-disc pl-5 space-y-1 text-[14px] text-gray-700">
                {updates.flatMap((u) => (u.changesSummary ?? "").split("\n").filter(Boolean)).map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </section>
          )}

          <div className="mt-5">
            <p className="text-[13px] font-semibold text-gray-500">Документи · відкриваються в новій вкладці</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {DOCS[kind].map((d) => {
                const seen = opened.includes(d.href);
                return (
                  <li key={d.href}>
                    <a
                      href={d.href}
                      target="_blank"
                      rel="noopener"
                      onClick={() => setOpened((o) => (o.includes(d.href) ? o : [...o, d.href]))}
                      className={`inline-flex items-center gap-2 min-h-[40px] px-3.5 rounded-xl text-[14px] font-semibold ring-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4338ca] ${seen ? "bg-[#eef0fd] text-[#4338ca] ring-[#c9cffa]" : "text-[#3b27a8] ring-[#d9d4f7] hover:bg-[#f3f4ff]"}`}
                    >
                      <Icon name={seen ? "check" : "note"} size={16} />
                      {d.label}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="mt-5">
            {step === "items" ? (
              <>
                <fieldset>
                  <legend className="text-[13px] font-semibold text-gray-500">Обов’язкові</legend>
                  <ul className="mt-2 space-y-2">{required.map(itemRow)}</ul>
                </fieldset>
                {optional.length > 0 && (
                  <fieldset className="mt-4">
                    <legend className="text-[13px] font-semibold text-gray-500">За бажанням</legend>
                    <ul className="mt-2 space-y-2">{optional.map(itemRow)}</ul>
                  </fieldset>
                )}
                {error && <p role="alert" className="mt-4 text-[14px] text-red-700">{error}</p>}
                <button
                  type="button"
                  onClick={submitItems}
                  disabled={!allRequired || busy}
                  className="mt-5 w-full min-h-[50px] rounded-2xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-white text-[15px] font-semibold shadow-[0_10px_24px_-12px_rgba(91,61,245,0.7)] hover:opacity-95 disabled:opacity-45 disabled:shadow-none disabled:cursor-default focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4338ca] focus-visible:ring-offset-2"
                >
                  {busy
                    ? "Зберігаємо…"
                    : !allRequired
                      ? `Відмітьте обов’язкові пункти · ${doneCount} з ${required.length}`
                      : kind === "author"
                        ? "Надіслати код на пошту"
                        : "Продовжити"}
                </button>
              </>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void submitCode();
                }}
                className="rounded-2xl bg-[#f6f7ff] ring-1 ring-[#e5e7f5] p-5"
              >
                <div className="flex items-start gap-3">
                  <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#4338ca] ring-1 ring-[#e5e7f5]">
                    <Icon name="mail" size={18} />
                  </span>
                  <p className="text-[14px] text-gray-800 leading-relaxed">{OTP_TEXT.replace("{{email автора}}", email || "вашу пошту")}</p>
                </div>
                <label htmlFor="gate-code" className="mt-4 block text-[13px] font-semibold text-gray-500">Код з листа</label>
                <input
                  id="gate-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="mt-1.5 w-full sm:w-56 min-h-[52px] rounded-xl bg-white ring-1 ring-[#c9cffa] px-4 text-[24px] text-center tracking-[0.4em] tabular-nums focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4338ca]"
                />
                {error && <p role="alert" className="mt-3 text-[14px] text-red-700">{error}</p>}
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    disabled={code.length !== 6 || busy}
                    className="min-h-[48px] px-6 rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-white font-semibold hover:opacity-95 disabled:opacity-45 disabled:cursor-default focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4338ca] focus-visible:ring-offset-2"
                  >
                    {busy ? "Перевіряємо…" : "Підписати договір"}
                  </button>
                  <button
                    type="button"
                    onClick={resend}
                    disabled={wait > 0 || busy}
                    className="min-h-[48px] px-4 rounded-xl bg-white ring-1 ring-[#c9cffa] text-[#3b27a8] font-semibold hover:bg-[#f3f4ff] disabled:opacity-50 disabled:cursor-default focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4338ca]"
                  >
                    {wait > 0 ? `Надіслати ще раз (${wait} с)` : "Надіслати ще раз"}
                  </button>
                  <button type="button" onClick={() => { setStep("items"); setCode(""); setError(null); }} className="min-h-[48px] px-2 text-[#3b27a8] font-semibold hover:underline underline-offset-4">
                    Назад
                  </button>
                </div>
              </form>
            )}
          </div>

          <div className="mt-5 pt-4 border-t border-[#ece9f8] flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <p className="flex items-center gap-2 text-[13px] text-gray-500">
              {kind === "participant" && <Icon name="lifebuoy" size={16} className="shrink-0 text-[#7c5cf0]" />}
              {kind === "participant" ? "У кризовій ситуації телефонуйте 112. Не погоджуєтеся — можна вийти з акаунта." : "Не погоджуєтеся — можна вийти з акаунта."}
            </p>
            <button type="button" onClick={leave} disabled={busy} className="min-h-[40px] px-3 -mr-3 rounded-xl text-[14px] text-[#3b27a8] font-semibold hover:bg-[#f3f4ff] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4338ca]">
              Вийти з акаунта
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
