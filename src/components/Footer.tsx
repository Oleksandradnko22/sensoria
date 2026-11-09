import logo from '../assets/logo.png';
type Props = {
  onOpenTest: () => void;
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
};

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
}: Props) {
  return (
    <footer className={`relative z-10 bg-white text-black ${compact ? "mt-4 sm:mt-6" : "mt-8 sm:mt-24"}`}>
      <div className="page-container py-8 sm:py-16">

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-6 sm:gap-10">

          {/* LOGO */}
          <div className="col-span-2 lg:col-span-1">
            <button type="button" onClick={() => onGoHome?.()} aria-label="Sensoria — на головну" className="
  focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300
  inline-flex items-center justify-center gap-0.1
  bg-blue-600 text-white
  pl-3 pr-5 py-2 rounded-full font-semibold
">
  <img
    src={logo}
    alt="Sensoria"
    className="w-8 h-8 object-contain brightness-0 invert"
  />

  <span className="text-[14px] tracking-wide">
    SENSORIA
    </span>
</button>

            <p className="text-gray-600 mt-4 t-small max-w-xs">
              Простір для розвитку та внутрішнього 
              <br></br>балансу
            </p>
          </div>

          {/* PLATFORM */}
          <div>
            <h4 className="t-h3 mb-2 sm:mb-4">Платформа</h4>
            <ul className="space-y-1 text-gray-600 t-small">
              <li><button type="button" onClick={onOpenCatalog} className="inline-flex items-center min-h-[32px] cursor-pointer hover:text-black transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded">Програми</button></li>
              <li><button type="button" onClick={onOpenGuides} className="inline-flex items-center min-h-[32px] cursor-pointer hover:text-black transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded">Гайди</button></li>
              <li><button type="button" onClick={onOpenMeditations} className="inline-flex items-center min-h-[32px] cursor-pointer hover:text-black transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded">Медитації</button></li>
            </ul>
          </div>

          {/* SUPPORT */}
          <div>
            <h4 className="t-h3 mb-2 sm:mb-4">Корисне</h4>
            <ul className="space-y-1 text-gray-600 t-small">
              <li><button type="button" onClick={onOpenTest} className="inline-flex items-center min-h-[32px] cursor-pointer hover:text-black transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded">Психологічний тест</button></li>
              <li><button type="button" onClick={onOpenContacts} className="inline-flex items-center min-h-[32px] cursor-pointer hover:text-black transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded">Контакти</button></li>
              <li><button type="button" onClick={onOpenTerms} className="inline-flex items-center min-h-[32px] cursor-pointer hover:text-black transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded">Умови використання</button></li>
              <li><button type="button" onClick={onOpenPrivacy} className="inline-flex items-center min-h-[32px] cursor-pointer hover:text-black transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded">Політика конфіденційності</button></li>
              <li><button type="button" onClick={onOpenRefunds} className="inline-flex items-center min-h-[32px] cursor-pointer hover:text-black transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded">Політика повернення коштів</button></li>
            </ul>
          </div>

        </div>

        {/* BOTTOM */}
        <div className="border-t mt-8 sm:mt-12 pt-5 sm:pt-6 pb-14 sm:pb-0 text-center text-gray-500 t-small">
          © 2026 Sensoria. Всі права захищені.
        </div>

      </div>
    </footer>
  );
}