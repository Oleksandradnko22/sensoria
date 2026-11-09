import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Icon } from "../components/ui/Icon";
import { LEGAL } from "../data/legalOperator";

// The platform's own address, already used for payout requests (AuthorFinance).
export const CONTACT_EMAIL = LEGAL.email;

const mailto = (subject: string) => `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`;

type Props = {
  onOpenParticipantDashboard: () => void;
  onOpenAuthorDashboard: () => void;
  onOpenFaq: () => void;
};

const card =
  "relative overflow-hidden rounded-3xl border border-white/70 p-6 sm:p-7 text-[#0f172a] shadow-[0_24px_60px_-26px_rgba(15,23,100,0.55)] flex flex-col";
const action =
  "inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-xl font-semibold text-[14px] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4338ca] focus-visible:ring-offset-2";
const secondary = `${action} bg-white/80 border border-[#c9cffa] text-[#3b27a8] hover:bg-white`;
const primary = `${action} bg-gradient-to-r from-blue-500 to-purple-500 text-white hover:opacity-90`;

/* ---------- decorative art (aria-hidden, behind content) ---------- */

function EnvelopeArt({ className = "" }: { className?: string }) {
  // unique gradient id: the art is rendered twice on the page
  const gid = `ct-env-${useId().replace(/:/g, "")}`;
  return (
    <svg aria-hidden="true" viewBox="0 0 220 150" fill="none" className={className}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".62" />
          <stop offset="1" stopColor="#b9a8ff" stopOpacity=".3" />
        </linearGradient>
      </defs>
      <g transform="rotate(-8 112 76)">
        <rect x="44" y="30" width="136" height="92" rx="14" fill={`url(#${gid})`} stroke="#fff" strokeOpacity=".5" />
        <path d="M50 40L112 86L174 40" stroke="#fff" strokeOpacity=".75" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      </g>
    </svg>
  );
}

function WindowArt({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 220 150" fill="none" className={className}>
      <rect x="40" y="26" width="130" height="94" rx="14" fill="#fff" fillOpacity=".7" stroke="#b9c8ff" />
      <rect x="40" y="26" width="130" height="20" rx="14" fill="#cfdcff" />
      <circle cx="54" cy="36" r="3" fill="#fff" />
      <circle cx="65" cy="36" r="3" fill="#fff" />
      <circle cx="96" cy="78" r="16" fill="#d3e2ff" />
      <circle cx="96" cy="73" r="6" fill="#7c96f0" />
      <path d="M84 90c3-7 21-7 24 0" stroke="#7c96f0" strokeWidth="3" strokeLinecap="round" />
      <rect x="124" y="64" width="34" height="5" rx="2.5" fill="#cfdcff" />
      <rect x="124" y="76" width="26" height="5" rx="2.5" fill="#cfdcff" />
      <rect x="124" y="88" width="30" height="5" rx="2.5" fill="#cfdcff" />
    </svg>
  );
}

function QuestionArt({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 220 150" fill="none" className={className}>
      <rect x="70" y="20" width="100" height="100" rx="20" fill="#fff" fillOpacity=".7" stroke="#bfe9de" transform="rotate(6 120 70)" />
      <path d="M104 62c0-9 7-15 16-15s16 6 16 14c0 11-14 12-14 22" stroke="#6aa0e8" strokeWidth="6" strokeLinecap="round" transform="rotate(6 120 70)" />
      <circle cx="123" cy="92" r="4" fill="#6aa0e8" transform="rotate(6 120 70)" />
      <path d="M176 140c-12-8-18-22-16-38 14 6 20 22 16 38z" fill="#5cc9b3" fillOpacity=".85" />
      <path d="M176 140c10-12 22-18 34-18-4 14-16 22-34 18z" fill="#3fb59f" fillOpacity=".7" />
    </svg>
  );
}

const line = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" } as const;

type Other = { title: string; text: string; icon: ReactNode; link?: { label: string; href: string }; socials?: boolean };

// Paste the real profile URLs here when the accounts exist. An empty url keeps
// the icon visible but inactive (no link), so nothing points to a dead page.
const SOCIALS: { key: string; label: string; url: string; icon: ReactNode }[] = [
  {
    key: "instagram",
    label: "Instagram",
    url: "",
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...line}>
        <rect x="4" y="4" width="16" height="16" rx="5" />
        <circle cx="12" cy="12" r="3.6" />
        <path d="M16.8 7.2h.01" />
      </svg>
    ),
  },
  {
    key: "tiktok",
    label: "TikTok",
    url: "",
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...line}>
        <path d="M14 4v10.2a3.7 3.7 0 11-3.7-3.7M14 4c.3 2.4 1.9 3.9 4.2 4.1" />
      </svg>
    ),
  },
  {
    key: "threads",
    label: "Threads",
    url: "",
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...line}>
        <path d="M16.8 10.6C16.4 7.6 14.6 6 12 6c-2.7 0-4.6 2.2-4.6 6s1.9 6 4.6 6c2.4 0 3.9-1.3 3.9-3 0-2-1.8-2.9-4-2.9-1.5 0-2.4.6-2.4 1.5s.8 1.4 1.7 1.4c1.6 0 2.7-1.2 2.7-3.9" />
      </svg>
    ),
  },
  {
    key: "telegram",
    label: "Telegram",
    url: "",
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...line}>
        <path d="M20.5 4.5L3.5 11l5.2 1.9L10.5 19l2.6-3.4 4 3 3.4-15.1zM8.7 12.9l8-5.6" />
      </svg>
    ),
  },
];

export default function ContactsPage({ onOpenParticipantDashboard, onOpenAuthorDashboard, onOpenFaq }: Props) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const h1Ref = useRef<HTMLHeadingElement>(null);

  // SPA page change: set the tab title and move focus to the heading so
  // keyboard / screen-reader users start at the top of the new page.
  useEffect(() => {
    const prev = document.title;
    const desc = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const prevDesc = desc?.content;
    document.title = "Контакти — Sensoria";
    if (desc) desc.content = "Контакти Sensoria: електронна пошта, допомога в кабінеті, відповіді на часті запитання, співпраця та зворотний зв’язок.";
    h1Ref.current?.focus({ preventScroll: true });
    return () => {
      document.title = prev;
      if (desc && prevDesc !== undefined) desc.content = prevDesc;
    };
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(CONTACT_EMAIL);
      setCopyFailed(false);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked: say so; the address stays visible and selectable
      setCopied(false);
      setCopyFailed(true);
      window.setTimeout(() => setCopyFailed(false), 3000);
    }
  };

  const others: Other[] = [
    {
      title: "Соціальні мережі",
      text: "Новини, корисний контент і підтримка спільноти.",
      socials: true,
      icon: (
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" {...line}>
          <path d="M20.5 4.5L3.5 11l5.2 1.9L10.5 19l2.6-3.4 4 3 3.4-15.1z" />
        </svg>
      ),
    },
    {
      title: "Співпраця",
      text: "Для партнерств, медіа та корпоративних запитів.",
      icon: (
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" {...line}>
          <path d="M8 12l3 3 5-6M3 12a9 9 0 1018 0 9 9 0 00-18 0z" />
        </svg>
      ),
      link: { label: "Написати про співпрацю", href: mailto("Співпраця") },
    },
    {
      title: "Зворотний зв’язок",
      text: "Діліться ідеями, щоб зробити Sensoria ще кращою.",
      icon: (
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" {...line}>
          <path d="M4 5h16v11H9l-5 4z" />
          <path d="M8.5 10.5h7" />
        </svg>
      ),
      link: { label: "Надіслати пропозицію", href: mailto("Пропозиція щодо Sensoria") },
    },
    {
      title: "Екстрена допомога",
      text: "Sensoria не замінює роботу з психологом і не є екстреною службою. Якщо вам потрібна негайна підтримка, зверніться до фахівця або місцевих служб допомоги.",
      icon: (
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" {...line}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5M12 8h.01" />
        </svg>
      ),
    },
  ];

  return (
    <main className="relative overflow-hidden page-container pt-28 sm:pt-32 pb-6 sm:pb-8 text-white">
      {/* HERO */}
      <div className="relative max-w-2xl">
        <EnvelopeArt className="pointer-events-none hidden md:block absolute left-[calc(100%+5rem)] lg:left-[calc(100%+9rem)] top-1 w-[240px] lg:w-[300px]" />
        <h1 ref={h1Ref} tabIndex={-1} className="fluid-h2 font-bold mb-3 outline-none">Контакти</h1>
        <p className="text-white fluid-lead">Є питання, пропозиція чи потрібна допомога? Напишіть нам.</p>
      </div>

      {/* THREE MAIN OPTIONS */}
      <div className="relative mt-8 sm:mt-12 grid lg:grid-cols-3 gap-4 lg:gap-6">
        <section aria-labelledby="c-mail" className={`${card} bg-gradient-to-br from-[#f6f2ff] to-[#e6e0ff]`}>
          <EnvelopeArt className="pointer-events-none absolute right-2 top-2 w-[44%] max-w-[170px] opacity-80 [&_*]:!stroke-[#b9a8ff]" />
          <span className="relative w-11 h-11 rounded-xl bg-[#e1d9ff] text-[#5b3fd1] flex items-center justify-center">
            <Icon name="mail" size={22} />
          </span>
          <h2 id="c-mail" className="relative t-h3 mt-6">Електронна пошта</h2>
          <p className="relative t-body text-gray-700 mt-1.5">Для будь-яких питань щодо платформи, співпраці та відгуків.</p>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="relative mt-4 inline-flex items-center gap-2 rounded-xl bg-white/80 border border-[#d4cdfb] px-4 min-h-[44px] font-medium text-[#3b27a8] underline underline-offset-4 break-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4338ca]"
          >
            <Icon name="mail" size={18} />
            {CONTACT_EMAIL}
          </a>
          <div className="relative mt-auto pt-5 flex flex-wrap gap-3">
            <a href={`mailto:${CONTACT_EMAIL}`} className={primary}>
              Написати листа
            </a>
            <button type="button" onClick={copy} className={secondary}>
              {copied ? "Скопійовано" : copyFailed ? "Не вдалося скопіювати" : "Скопіювати адресу"}
            </button>
          </div>
          <span role="status" className="sr-only">{copied ? "Адресу скопійовано" : copyFailed ? "Не вдалося скопіювати адресу" : ""}</span>
        </section>

        <section aria-labelledby="c-help" className={`${card} bg-gradient-to-br from-[#f0f5ff] to-[#dce7ff]`}>
          <WindowArt className="pointer-events-none absolute right-2 top-2 w-[44%] max-w-[170px] opacity-90" />
          <span className="relative w-11 h-11 rounded-xl bg-[#d3e2ff] text-[#2557d6] flex items-center justify-center">
            <Icon name="shield" size={22} />
          </span>
          <h2 id="c-help" className="relative t-h3 mt-6">Допомога в кабінеті</h2>
          <p className="relative t-body text-gray-700 mt-1.5">
            Проблема з контентом, оплатою чи доступом? У розділі «Допомога» кабінету можна надіслати звернення й побачити його статус.
          </p>
          <div className="relative mt-auto pt-5 flex flex-wrap gap-3">
            <button type="button" onClick={onOpenParticipantDashboard} className={secondary}>
              Кабінет учасника <span aria-hidden="true">→</span>
            </button>
            <button type="button" onClick={onOpenAuthorDashboard} className={secondary}>
              Кабінет автора <span aria-hidden="true">→</span>
            </button>
          </div>
        </section>

        <section aria-labelledby="c-faq" className={`${card} bg-gradient-to-br from-[#effaf7] to-[#d9f2ea]`}>
          <QuestionArt className="pointer-events-none absolute right-2 top-2 w-[44%] max-w-[170px] opacity-90" />
          <span className="relative w-11 h-11 rounded-xl bg-[#cdeee5] text-[#0f766e] flex items-center justify-center">
            <Icon name="search" size={22} />
          </span>
          <h2 id="c-faq" className="relative t-h3 mt-6">Часті запитання</h2>
          <p className="relative t-body text-gray-700 mt-1.5">Відповіді на ключові питання про програми, медитації та гайди — можливо, вже є те, що вам потрібно.</p>
          <div className="relative mt-auto pt-5">
            <button type="button" onClick={onOpenFaq} className={secondary}>
              Перейти до відповідей <span aria-hidden="true">→</span>
            </button>
          </div>
        </section>
      </div>

      {/* OTHER WAYS — compact, divided, no nested cards */}
      <section aria-labelledby="c-other" className="relative mt-10 sm:mt-14 pt-8 border-t border-white/20">
        <h2 id="c-other" className="t-h3 mb-6">Інші способи зв’язку</h2>
        <ul className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-0 lg:divide-x lg:divide-white/20">
          {others.map((o) => (
            <li key={o.title} className="flex gap-4 lg:px-6 lg:first:pl-0 lg:last:pr-0">
              <span className="shrink-0 w-12 h-12 rounded-full bg-white/15 border border-white/25 flex items-center justify-center text-white">{o.icon}</span>
              <div className="min-w-0">
                <h3 className="font-semibold">{o.title}</h3>
                <p className="t-small text-white mt-1 leading-relaxed">{o.text}</p>
                {o.socials && (
                  <div className="mt-3 flex flex-wrap gap-2.5">
                    {SOCIALS.map((so) =>
                      so.url ? (
                        <a
                          key={so.key}
                          href={so.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={so.label}
                          className="w-10 h-10 rounded-full bg-white/15 border border-white/25 flex items-center justify-center text-white hover:bg-white/25 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                        >
                          {so.icon}
                        </a>
                      ) : (
                        <span
                          key={so.key}
                          title={`${so.label} — скоро`}
                          className="w-10 h-10 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-white/55 cursor-default"
                        >
                          <span className="sr-only">{so.label}, скоро</span>
                          {so.icon}
                        </span>
                      ),
                    )}
                  </div>
                )}
                {o.link && (
                  <a
                    href={o.link.href}
                    className="mt-3 inline-flex items-center gap-1.5 min-h-[32px] t-small font-semibold text-white underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-white rounded"
                  >
                    {o.link.label} <span aria-hidden="true">→</span>
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
