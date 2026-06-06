import { useState } from "react";
import logo from "../assets/logo.png";

export default function Header({ onOpenTest, onOpenCatalog, onOpenGuides }: any) {
  const [open, setOpen] = useState(false);
  let timeout: any;

  return (
    <header className="w-full absolute top-0 left-0 z-[100]">
      <div className="max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">

        {/* LOGO */}
        <div className="flex items-center gap-0.5 text-white">
          <img src={logo} alt="logo" className="w-10 h-10 object-contain relative -top-[1.5px]" />
          <span className="font-semibold text-lg tracking-wide">
            SENSORIA
          </span>
        </div>

        {/* SEARCH */}
        <div className="hidden md:flex items-center flex-1 max-w-md mx-10">
          <input
            type="text"
            placeholder="Знайти програму / медитацію"
            className="
              w-full px-4 py-2.5 rounded-xl
              bg-white/10 border border-white/20
              placeholder-white/60 text-white
              focus:outline-none
              focus:border-white/40
              focus:bg-white/15
              transition
            "
          />
        </div>

        {/* RIGHT */}
        <div className="flex items-center text-white">

          {/* CATALOG */}
          <div
            className="relative hidden md:block mr-6"
            onMouseEnter={() => {
              clearTimeout(timeout);
              setOpen(true);
            }}
            onMouseLeave={() => {
              timeout = setTimeout(() => setOpen(false), 150);
            }}
          >
            <button
              onClick={() => setOpen((prev) => !prev)}
              className="flex items-center gap-2 text-white/80 hover:text-white transition"
            >
              Каталог
              <span className={`transition ${open ? "rotate-180" : ""}`}>
                ▾
              </span>
            </button>

            {open && (
              <div
                className="
                  absolute top-full left-0 mt-4
                  ml-[-220px]
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
  <div className="font-medium">
    📘 Програми
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
  <div className="font-medium">
    📄 Гайди
  </div>

  <div className="text-sm text-gray-500">
    Практичні матеріали та поради
  </div>
</button>

                  <button className="p-3 rounded-xl hover:bg-gray-100 transition text-left">
                    <div className="font-medium">🧘 Медитації</div>
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
                    🧠 Почати тест →
                  </button>

                </div>
              </div>
            )}
          </div>

          {/* ACTION BUTTONS */}
          <div className="flex items-center gap-4">
            <button className="
              px-4 py-2 rounded-xl
              bg-white/10 border border-white/20
              hover:bg-white/20
              transition
            ">
              Увійти як студент
            </button>

            <button className="
              px-4 py-2 rounded-xl
              border border-white/40
              hover:bg-white/10
              transition
            ">
              Увійти як автор
            </button>
          </div>

        </div>
      </div>

      {/* ANIMATION */}
      <style>
        {`
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