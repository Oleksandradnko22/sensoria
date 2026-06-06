import logo from '../assets/logo.png';
export default function Footer({ onopentest }: any) {
  return (
    <footer className="relative z-10 bg-white text-black mt-24">
      <div className="max-w-7xl mx-auto px-6 py-16">

        <div className="grid md:grid-cols-3 gap-10">

          {/* LOGO */}
          <div>
            <div className="
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
</div>

            <p className="text-gray-500 mt-4 text-sm max-w-xs">
              Простір для розвитку та внутрішнього 
              <br></br>балансу
            </p>
          </div>

          {/* PLATFORM */}
          <div>
            <h4 className="font-semibold mb-4">Платформа</h4>
            <ul className="space-y-2 text-gray-500 text-sm">
              <li>Програми</li>
              <li>Медитації</li>
              <li>
                <button 
                  onClick={onopentest}
                  className="cursor-pointer hover:text-black transition"
                >
                  Психологічний тест
                </button>
              </li>
            </ul>
          </div>

          {/* SUPPORT */}
          <div>
            <h4 className="font-semibold mb-4">Підтримка</h4>
            <ul className="space-y-2 text-gray-500 text-sm">
              <li>Контакти</li>
              <li>Питання та відповіді</li>
              <li>Умови використання</li>
            </ul>
          </div>

        </div>

        {/* BOTTOM */}
        <div className="border-t mt-12 pt-6 text-center text-gray-400 text-sm">
          © 2026 Sensoria. Всі права захищені.
        </div>

      </div>
    </footer>
  );
}