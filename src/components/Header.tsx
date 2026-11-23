import { useEffect, useRef, useState } from "react";
import { Icon } from "./ui/Icon";
import logo from "../assets/logo.png";
import { programs as demoPrograms, type Program } from "../data/programs";
import { meditations } from "../data/meditations";
import { guides } from "../data/guides";
import type { Profile } from "../lib/auth";
import { requestOpenCart } from "../lib/cartStore";
import { useCartView } from "../lib/useCartView";

type Props = {
  onOpenTest: () => void;
  onGoHome?: () => void;
  onOpenCatalog: () => void;
  onOpenGuides: () => void;
  onOpenMeditations: () => void;
  // Search-result clicks go straight to the specific item instead of
  // just its general catalog — separate from the onOpen* handlers
  // above, which are for the generic nav links (logo menu, "Каталог").
  onSelectProgram: (id: string) => void;
  onSelectGuide: (id: string) => void;
  onSelectMeditation: (id: string) => void;
  // Both "Увійти як автор" and "Увійти як учасник" used to have no
  // onClick at all — dead buttons sitting on every page.
  onOpenAuthorDashboard: () => void;
  onOpenParticipantDashboard: () => void;
  // Optional — defaults to the static demo catalog so every existing
  // call site keeps working unchanged. App.tsx passes in the merged
  // demo+real list so search also finds published author content.
  programs?: Program[];
  // Logged-in profile, if any — swaps "Увійти як..." for a single "Мій
  // кабінет" button once someone's actually signed in, instead of
  // still inviting them to log in as something they already are.
  session?: Profile | null;
};

export default function Header({
  onOpenTest,
  onGoHome,
  onOpenCatalog,
  onOpenGuides,
  onOpenMeditations,
  onSelectProgram,
  onSelectGuide,
  onSelectMeditation,
  onOpenAuthorDashboard,
  onOpenParticipantDashboard,
  programs = demoPrograms,
  session = null,
}: Props) {
  const cartCount = useCartView(programs, session?.id, session?.role === "participant").count;
  const [open, setOpen] = useState(false);
  // Phone menu (below md the search, catalog and sign-in live in this panel).
  const [menuOpen, setMenuOpen] = useState(false);
  // A plain `let timeout` here gets reassigned on every render, but the
  // JSX below reads it correctly today only because onMouseEnter and
  // onMouseLeave from the same render share the same closure. A ref is
  // the correct tool for a timer id that needs to survive across
  // renders — this removes that fragility rather than relying on it.
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Real search across all three catalogs (programs, meditations, guides)
  // — this used to be a purely decorative input with no state at all.
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const q = query.trim().toLowerCase();
  const matchedPrograms = q
    ? programs.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.author.toLowerCase().includes(q)
      )
    : [];
  const matchedMeditations = q
    ? meditations.filter((m) => m.title.toLowerCase().includes(q))
    : [];
  const matchedGuides = q
    ? guides.filter(
        (g) =>
          g.title.toLowerCase().includes(q) ||
          g.author.toLowerCase().includes(q)
      )
    : [];
  const hasResults =
    matchedPrograms.length + matchedMeditations.length + matchedGuides.length >
    0;

  // Close the results dropdown on outside click.
  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setMenuOpen(false);
        setSearchOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const goToProgram = (id: string) => {
    setQuery("");
    setSearchOpen(false);
    setMenuOpen(false);
    onSelectProgram(id);
  };
  const goToMeditation = (id: string) => {
    setQuery("");
    setSearchOpen(false);
    setMenuOpen(false);
    onSelectMeditation(id);
  };
  const goToGuide = (id: string) => {
    setQuery("");
    setSearchOpen(false);
    setMenuOpen(false);
    onSelectGuide(id);
  };

  // header buttons on the white phone-menu sheet
  const sheetBtn = "max-lg:border-[#e3e6f3] max-lg:bg-[#f4f5fd] max-lg:text-[#1e2a78] max-lg:hover:bg-[#eceefb] max-lg:focus-visible:ring-[#3b6df0]";

  return (
    <header className="w-full absolute top-0 left-0 z-[100]">
      {/* phone menu open: the page behind dims and blurs; a tap on it closes the menu */}
      {menuOpen && (
        <div
          aria-hidden="true"
          onClick={() => setMenuOpen(false)}
          className="lg:hidden fixed inset-0 -z-10 bg-[#0b1340]/45 backdrop-blur-[3px] animate-[menuFade_0.2s_ease-out] motion-reduce:animate-none"
        />
      )}
      <div
        className="page-container relative isolate py-4 lg:py-6 flex flex-wrap lg:flex-nowrap items-center justify-between"
      >
        {/* phone menu: the white sheet unfolds from the top, then its content fades in */}
        {menuOpen && (
          <div
            aria-hidden="true"
            className="lg:hidden absolute inset-0 -z-10 bg-white rounded-b-[28px] shadow-[0_30px_80px_-24px_rgba(10,20,90,0.55)] origin-top animate-[sheetIn_0.26s_cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:animate-none"
          />
        )}

        {/* LOGO — goes to the home page */}
        <button
          type="button"
          onClick={() => onGoHome?.()}
          aria-label="Sensoria — на головну"
          className={`flex items-center gap-0.5 rounded-lg transition-colors duration-200 ${menuOpen ? "text-white max-lg:text-[#3b55e0]" : "text-white"} focus:outline-none focus-visible:ring-2 focus-visible:ring-white`}
        >
          <img src={logo} alt="" aria-hidden="true" className={`w-10 h-10 object-contain relative -top-[1.5px] ${menuOpen ? "max-lg:hidden" : ""}`} />
          {/* on the white phone-menu sheet: the logo in the same brand blue as the name next to it */}
          {menuOpen && (
            <span
              aria-hidden="true"
              className="lg:hidden w-10 h-10 relative -top-[1.5px] bg-[#3b55e0]"
              style={{ WebkitMask: `url(${logo}) center / contain no-repeat`, mask: `url(${logo}) center / contain no-repeat` }}
            />
          )}
          <span className="font-semibold text-lg tracking-wide">
            SENSORIA
          </span>
        </button>

        {/* SEARCH — real, live filtering across programs/meditations/
            guides (was previously a decorative input with no state). */}
        <div
          ref={searchRef}
          className={`${menuOpen ? "flex max-lg:animate-[menuItemIn_0.3s_0.06s_ease-out_both] motion-reduce:animate-none" : "hidden"} lg:flex order-3 lg:order-none basis-full lg:basis-auto mt-3 lg:mt-0 max-lg:flex-wrap items-center flex-1 lg:max-w-[460px] lg:mx-8 relative`}
        >
          <span aria-hidden="true" className={`pointer-events-none absolute z-10 left-4 top-[22px] -translate-y-1/2 text-white/80 ${menuOpen ? "max-lg:text-[#8a90ad]" : ""}`}>
            <Icon name="search" size={18} />
          </span>
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSearchOpen(true);
            }}
            onFocus={() => {
              if (query) setSearchOpen(true);
            }}
            placeholder="Знайти програму / медитацію / гайд…"
            aria-label="Пошук програм, медитацій і гайдів"
            className={`
              w-full pl-11 pr-4 py-2.5 min-h-[44px] text-[16px] lg:text-[14px] rounded-xl
              bg-white/10 border border-white/20
              placeholder-white/60 text-white
              focus:outline-none
              focus:border-white/40
              focus:bg-white/15
              transition
              ${menuOpen ? "max-lg:bg-[#f4f5fd] max-lg:border-[#e3e6f3] max-lg:text-[#0f172a] max-lg:placeholder-[#8a90ad] max-lg:focus:bg-white max-lg:focus:border-[#3b6df0]" : ""}
            `}
          />

          {searchOpen && q && (
            <div
              // phones: results sit right under the field on the white menu sheet (the menu rows hide while
              // searching); desktop: a dropdown card under the field
              className="
                absolute top-full left-0 mt-3 w-full
                max-h-[70vh] overflow-y-auto
                rounded-2xl bg-white text-black
                shadow-[0_10px_30px_rgba(0,0,0,0.12)]
                border border-gray-200
                p-3
                z-50
                animate-[fadeIn_0.15s_ease]
                max-lg:static max-lg:basis-full max-lg:mt-2 max-lg:max-h-[60vh] max-lg:shadow-none max-lg:border-0 max-lg:rounded-none max-lg:p-0 max-lg:-mx-1
              "
            >
              {!hasResults && (
                <div className="px-3 py-4 text-sm text-gray-500 text-center">
                  Нічого не знайдено за «{query}»
                </div>
              )}

              {matchedPrograms.length > 0 && (
                <div className="mb-2">
                  <div className="px-3 pt-1 pb-1 text-xs text-gray-400">
                    Програми
                  </div>
                  {matchedPrograms.slice(0, 4).map((p) => (
                    <button
                      key={p.id}
                      onClick={() => goToProgram(p.id)}
                      className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-100 transition text-left"
                    >
                      <span className="text-gray-500"><Icon name="program" size={20} /></span>
                      <span className="min-w-0">
                        <span className="block font-medium truncate">
                          {p.title}
                        </span>
                        <span className="block text-xs text-gray-500 truncate">
                          {p.author}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {matchedMeditations.length > 0 && (
                <div className="mb-2">
                  <div className="px-3 pt-1 pb-1 text-xs text-gray-400">
                    Медитації
                  </div>
                  {matchedMeditations.slice(0, 4).map((m) => (
                    <button
                      key={m.id}
                      onClick={() => goToMeditation(m.id)}
                      className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-100 transition text-left"
                    >
                      <span className="text-gray-500"><Icon name="meditation" size={20} /></span>
                      <span className="min-w-0">
                        <span className="block font-medium truncate">
                          {m.title}
                        </span>
                        <span className="block text-xs text-gray-500 truncate">
                          {m.duration}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {matchedGuides.length > 0 && (
                <div>
                  <div className="px-3 pt-1 pb-1 text-xs text-gray-400">
                    Гайди
                  </div>
                  {matchedGuides.slice(0, 4).map((g) => (
                    <button
                      key={g.id}
                      onClick={() => goToGuide(g.id)}
                      className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-100 transition text-left"
                    >
                      <span className="text-gray-500"><Icon name="guide" size={20} /></span>
                      <span className="min-w-0">
                        <span className="block font-medium truncate">
                          {g.title}
                        </span>
                        <span className="block text-xs text-gray-500 truncate">
                          {g.author}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT */}
        <div className="relative flex items-center text-white">

          {/* CATALOG */}
          <div
            className="hidden lg:block mr-6"
            onMouseEnter={() => {
              if (timeoutRef.current) clearTimeout(timeoutRef.current);
              setOpen(true);
            }}
            onMouseLeave={() => {
              timeoutRef.current = setTimeout(() => setOpen(false), 150);
            }}
          >
            <button
              onClick={() => setOpen((prev) => !prev)}
              aria-expanded={open}
              aria-haspopup="true"
              className="flex items-center gap-2 min-h-[44px] text-white/80 hover:text-white transition"
            >
              Каталог
              <span aria-hidden="true" className={`inline-flex transition ${open ? "rotate-90" : "-rotate-90"}`}>
                <Icon name="chevron" size={14} />
              </span>
            </button>

            {open && (
              <div
                className="
                  absolute top-full right-0 mt-4
                  w-[660px]
                  rounded-2xl
                  bg-white text-black
                  shadow-[0_10px_30px_rgba(0,0,0,0.12)]
                  border border-gray-200
                  p-6
                  grid grid-cols-2 gap-6
                  z-50
                  animate-[fadeIn_0.2s_ease]
                "
              >
                {/* LEFT */}
                <div className="flex flex-col gap-2">

                  <button
  onClick={onOpenCatalog}
  className="
    p-3
    rounded-xl
    hover:bg-gray-100
    transition
    text-left
  "
>
  <div className="font-medium flex items-center gap-2">
    <Icon name="program" size={16} /> Програми
  </div>

  <div className="text-sm text-gray-500">
    Курси для роботи зі станом
  </div>
</button>
              
                   
                   <button
  onClick={onOpenGuides}
  className="
    p-3 rounded-xl
    hover:bg-gray-100
    transition
    text-left
    w-full
  "
>
  <div className="font-medium flex items-center gap-2">
    <Icon name="guide" size={16} /> Гайди
  </div>

  <div className="text-sm text-gray-500">
    Практичні матеріали та поради
  </div>
</button>

                  <button
                    onClick={onOpenMeditations}
                    className="p-3 rounded-xl hover:bg-gray-100 transition text-left"
                  >
                    <div className="font-medium flex items-center gap-2"><Icon name="meditation" size={16} /> Медитації</div>
                    <div className="text-sm text-gray-500">
                      Для заспокоєння та фокусу
                    </div>
                  </button>

                </div>

                {/* RIGHT (переработано) */}
                <div className="flex flex-col justify-center px-2">

                  <div className="mb-6">
                    <div className="text-xs text-gray-400 mb-2">
                      Швидкий старт
                    </div>

                    <h3 className="font-semibold text-lg mb-3">
                      Пройти тест
                    </h3>

                    <p className="text-sm text-gray-500 leading-relaxed">
                      Підберемо програму під ваш стан та цілі за кілька хвилин 
                    </p>
                  </div>

                  <button
                    onClick={onOpenTest}
                    className="
                    w-full py-3.5
                      rounded-xl
                      bg-gradient-to-r from-blue-500 to-purple-500
                      text-white font-medium
                      hover:opacity-90
                      transition
                    "
                  >
                    <span className="inline-flex items-center gap-2"><Icon name="brain" size={16} /> Почати тест →</span>
                  </button>

                </div>
              </div>
            )}
          </div>

          {/* ACTION BUTTONS */}
          <div className="hidden lg:flex items-center gap-4">
            {session ? (
              <button
                onClick={
                  session.role === "author"
                    ? onOpenAuthorDashboard
                    : onOpenParticipantDashboard
                }
                className="
                px-4 py-2 rounded-xl
                bg-white/10 border border-white/20
                hover:bg-white/20
                transition
              ">
                Мій кабінет
              </button>
            ) : (
              <>
                <button
                  onClick={onOpenParticipantDashboard}
                  className="
                  px-4 min-h-[44px] rounded-xl
                  bg-white/10 border border-white/25 text-white
                  hover:bg-white/20
                  transition
                ">
                  Увійти як учасник
                </button>

                <button
                  onClick={onOpenAuthorDashboard}
                  className="
                  px-4 min-h-[44px] rounded-xl
                  border border-white/35 text-white/90
                  hover:bg-white/10 hover:text-white
                  transition
                ">
                  Увійти як автор
                </button>
              </>
            )}
          </div>

          {/* CART */}
          <button
            type="button"
            onClick={requestOpenCart}
            aria-label={cartCount > 0 ? `Кошик, матеріалів: ${cartCount}` : "Кошик"}
            className={`relative inline-flex max-lg:mr-2 lg:ml-2 min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-white/25 bg-white/10 text-white transition hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white ${menuOpen ? sheetBtn : ""}`}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 4h2l2.4 11h10.2L20 8H6.2" />
              <circle cx="9" cy="19.5" r="1.4" />
              <circle cx="17" cy="19.5" r="1.4" />
            </svg>
            {cartCount > 0 && (
              <span aria-hidden="true" className="absolute -right-1.5 -top-1.5 flex h-[20px] min-w-[20px] items-center justify-center rounded-full bg-white px-1 text-[12px] font-semibold text-[#4338ca]">
                {cartCount}
              </span>
            )}
          </button>

          {/* PHONE MENU BUTTON */}
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label={menuOpen ? "Закрити меню" : "Відкрити меню"}
            className={`lg:hidden min-h-[44px] min-w-[44px] rounded-xl border border-white/25 bg-white/10 text-white flex items-center justify-center transition hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white ${menuOpen ? sheetBtn : ""}`}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              {menuOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h10" />}
            </svg>
          </button>

        </div>

        {/* PHONE MENU PANEL — on the white sheet: formats as rows with a short line each, then sign-in,
            then crisis help */}
        {menuOpen && !(searchOpen && q) && (
          <nav
            id="mobile-menu"
            aria-label="Меню"
            className="lg:hidden order-4 basis-full mt-3 -mx-2 text-[#0f172a] animate-[menuItemIn_0.34s_0.12s_ease-out_both] motion-reduce:animate-none"
          >
            <ul>
              {[
                { label: "Програми", note: "Покрокові курси від авторів", icon: "program" as const, tint: "bg-[#ece8ff] text-[#5b3fd1]", run: onOpenCatalog },
                { label: "Гайди", note: "Практичні матеріали й вправи", icon: "guide" as const, tint: "bg-[#d9f2ea] text-[#0f766e]", run: onOpenGuides },
                { label: "Медитації", note: "Аудіопрактики для спокою й сну", icon: "meditation" as const, tint: "bg-[#e0eaff] text-[#2557d6]", run: onOpenMeditations },
                { label: "Пройти тест", note: "Підбір матеріалів під ваш стан", icon: "compass" as const, tint: "bg-gradient-to-br from-[#3b6df0] to-[#7c5cf0] text-white", run: onOpenTest },
              ].map((i) => (
                <li key={i.label}>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      i.run();
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left hover:bg-[#f4f5fd] active:bg-[#eceefb] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3b6df0]"
                  >
                    <span aria-hidden="true" className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${i.tint}`}>
                      <Icon name={i.icon} size={20} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[16px] font-semibold leading-tight">{i.label}</span>
                      <span className="block text-[13px] text-[#5b6280] mt-0.5 truncate">{i.note}</span>
                    </span>
                    <span aria-hidden="true" className="shrink-0 text-[#b3b8d0] -rotate-90">
                      <Icon name="chevron" size={18} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            <div className="mt-2 pt-3 px-1 pb-1 border-t border-[#eef0fa]">
              {session ? (
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    (session.role === "author" ? onOpenAuthorDashboard : onOpenParticipantDashboard)();
                  }}
                  className="w-full min-h-[48px] rounded-2xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-white text-[16px] font-semibold shadow-[0_8px_20px_-8px_rgba(76,80,230,0.6)]"
                >
                  Мій кабінет
                </button>
              ) : (
                <>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onOpenParticipantDashboard();
                    }}
                    className="w-full min-h-[48px] rounded-2xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-white text-[16px] font-semibold shadow-[0_8px_20px_-8px_rgba(76,80,230,0.6)]"
                  >
                    Увійти як учасник
                  </button>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onOpenAuthorDashboard();
                    }}
                    className="w-full min-h-[44px] mt-1 rounded-2xl text-[15px] font-medium text-[#3b3fb5] hover:bg-[#f4f5fd] transition-colors"
                  >
                    Ви автор? Увійти як автор
                  </button>
                </>
              )}
              <a
                href="/crisis-help"
                onClick={() => setMenuOpen(false)}
                className="mt-1 flex items-center justify-center gap-1.5 min-h-[40px] rounded-2xl text-[14px] font-semibold text-[#be123c] hover:bg-[#fff1f3] transition-colors"
              >
                <Icon name="lifebuoy" size={16} />
                Допомога в кризі
              </a>
            </div>
          </nav>
        )}
      </div>

      {/* ANIMATION */}
      <style>
        {`
          @keyframes sheetIn {
            from { opacity: 0; transform: scaleY(0.9); }
            to { opacity: 1; transform: none; }
          }
          @keyframes menuItemIn {
            from { opacity: 0; transform: translateY(-6px); }
            to { opacity: 1; transform: none; }
          }
          @keyframes menuFade {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes fadeIn {
            from {
              opacity: 0;
              transform: translateY(10px) scale(0.98);
            }
            to {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }
        `}
      </style>
    </header>
  );
}