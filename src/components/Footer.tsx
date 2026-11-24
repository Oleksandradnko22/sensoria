import logo from '../assets/logo.png';
import { Icon } from './ui/Icon';
import { LEGAL } from '../data/legalOperator';

type Props = {
  onOpenTest?: () => void;
  onGoHome?: () => void;
  onOpenCatalog?: () => void;
  onOpenGuides?: () => void;
  onOpenContacts?: () => void;
  onOpenTerms?: () => void;
  onOpenPrivacy?: () => void;
  onOpenRefunds?: () => void;
  // Less space above the footer (pages whose content already ends with air).
  compact?: boolean;
  onOpenMeditations?: () => void;
  // before the platform opens: no «Платформа» links (catalogs, test) — they lead nowhere yet
  hidePlatform?: boolean;
};

// Footer: brand · Платформа · Підтримка · Документи. Every legal document stays public and one click away
// (the offers, the policy and the refund rules must be readable before anyone agrees to them) — they are
// just grouped in one column instead of mixed with the rest. A page that passes no handler for a link
// (catalogs, cart) gets a plain link to that address instead of a dead button.
type Item = { label: string; onClick?: () => void; href?: string; path?: string };

const linkClass =
  "inline-flex items-center min-h-[28px] text-[14px] sm:text-[15px] text-[#3b4160] hover:text-[#3b6df0] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3b6df0] rounded";

const headingClass = "text-[11px] sm:text-[12px] font-semibold uppercase tracking-[0.1em] text-[#8a90ad] mb-2 sm:mb-3";

function Column({ title, items, className = "" }: { title: string; items: Item[]; className?: string }) {
  return (
    <nav aria-label={title} className={className}>
      <h4 className={headingClass}>{title}</h4>
      <ul className="space-y-0.5">
        {items.map((it) => (
          <li key={it.label}>
            {it.href || !it.onClick ? (
              <a href={it.href ?? it.path} className={linkClass}>
                {it.label}
              </a>
            ) : (
              <button type="button" onClick={it.onClick} className={linkClass}>
                {it.label}
              </button>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default function Footer({
  onOpenTest,
  onGoHome,
  onOpenCatalog,
  onOpenGuides,
  onOpenContacts,
  onOpenTerms,
  onOpenPrivacy,
  onOpenRefunds,
  compact = false,
  onOpenMeditations,
  hidePlatform = false,
}: Props) {
  const platform: Item[] = [
    { label: "Програми", onClick: onOpenCatalog, path: "/programs" },
    { label: "Гайди", onClick: onOpenGuides, path: "/guides" },
    { label: "Медитації", onClick: onOpenMeditations, path: "/meditations" },
    { label: "Психологічний тест", onClick: onOpenTest, path: "/start" },
  ];
  const documents: Item[] = [
    { label: "Умови використання", onClick: onOpenTerms, path: "/terms" },
    { label: "Політика конфіденційності", onClick: onOpenPrivacy, path: "/privacy" },
    { label: "Правила повернення коштів", onClick: onOpenRefunds, path: "/refunds" },
    { label: "Угода учасника", href: "/participant-agreement" },
    { label: "Договір з автором (оферта)", href: "/author-agreement" },
  ];

  const go = (handler?: () => void) => (e: React.MouseEvent) => {
    if (!handler) return; // no handler on this page: the plain link opens the address
    e.preventDefault();
    handler();
  };

  return (
    <footer className={`relative z-10 bg-white text-[#0f172a] ${compact ? "mt-4 sm:mt-6" : "mt-8 sm:mt-12"}`}>
      <div className="page-container pt-8 sm:pt-14 pb-5">
        <div className="grid grid-cols-1 min-[360px]:grid-cols-2 md:grid-cols-3 min-[2200px]:grid-cols-[1.4fr_1fr_1fr_1.2fr] gap-x-4 min-[375px]:gap-x-6 gap-y-7 md:gap-x-8 lg:gap-x-10">
          {/* BRAND */}
          <div className="min-[360px]:col-span-2 md:col-span-3 md:flex md:items-center md:gap-5 pb-1 md:pb-6 md:border-b md:border-[#eceef7] min-[2200px]:col-span-1 min-[2200px]:block min-[2200px]:pb-0 min-[2200px]:border-0">
            <a
              href="/"
              onClick={go(onGoHome)}
              aria-label="Sensoria — на головну"
              className="shrink-0 whitespace-nowrap inline-flex items-center gap-1 bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-white pl-2.5 pr-4 py-1.5 rounded-full font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3b6df0] focus-visible:ring-offset-2"
            >
              <img src={logo} alt="" className="w-7 h-7 object-contain brightness-0 invert" />
              <span className="text-[13px] tracking-wide">SENSORIA</span>
            </a>
            <p className="text-[14px] sm:text-[15px] leading-relaxed text-[#5b6280] mt-3 md:mt-0 min-[2200px]:mt-3 min-[2200px]:max-w-[34ch]">
              Психологічні програми, гайди й медитації від авторів — для розвитку та внутрішнього балансу.
            </p>
          </div>

          {!hidePlatform && <Column title="Платформа" items={platform} />}

          {/* SUPPORT: contacts, mail, and crisis help set apart in colour so it is easy to find */}
          <nav aria-label="Підтримка">
            <h4 className={headingClass}>Підтримка</h4>
            <ul className="space-y-0.5">
              <li>
                <a href="/contacts" onClick={go(onOpenContacts)} className={linkClass}>
                  Контакти
                </a>
              </li>
              <li>
                <a href={`mailto:${LEGAL.email}`} className={linkClass}>
                  Написати нам
                </a>
              </li>
              <li>
                <a
                  href="/crisis-help"
                  className="inline-flex items-center gap-1.5 whitespace-nowrap min-h-[28px] text-[14px] sm:text-[15px] font-semibold text-[#be123c] hover:text-[#9f1239] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#be123c] rounded"
                >
                  <Icon name="lifebuoy" size={16} />
                  Допомога в кризі
                </a>
              </li>
            </ul>
          </nav>

          {/* DOCUMENTS */}
          <nav aria-label="Документи" className={hidePlatform ? "min-[360px]:col-span-2 md:col-span-2 min-[2200px]:col-span-2" : "min-[360px]:col-span-2 md:col-span-1"}>
            <h4 className={headingClass}>Документи</h4>
            {/* two columns from 480 px up to tablets (fills the right side), one on narrow phones and in the one-row layout from 768 px */}
            <ul className={`space-y-0.5 min-[480px]:columns-2 min-[480px]:gap-x-6 ${hidePlatform ? "md:columns-2 md:gap-x-10" : "md:columns-1"} [&>li]:break-inside-avoid`}>
              {documents.map((d) => (
                <li key={d.label}>
                  <a href={d.href ?? d.path} onClick={go(d.onClick)} className={linkClass}>
                    {d.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        {/* BOTTOM */}
        <div className="border-t border-[#eceef7] mt-7 sm:mt-10 pt-4 pb-14 sm:pb-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[12px] sm:text-[13px] text-[#8a90ad]">
          <span>© 2026 Sensoria. Усі права захищено.</span>
          <a href="/contacts" onClick={go(onOpenContacts)} className="underline underline-offset-4 hover:text-[#3b6df0] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3b6df0] rounded">
            Реквізити оператора
          </a>
        </div>
      </div>
    </footer>
  );
}
