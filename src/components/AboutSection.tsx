export default function AboutSection() {
  return (
    <section className="max-w-7xl mx-auto px-6 pt-12 pb-28">

      <div className="
        relative
        rounded-3xl

        bg-gradient-to-br from-white/90 to-white/70
        backdrop-blur-2xl

        border border-white/40

        p-10 md:p-14

        shadow-[0_30px_120px_rgba(0,0,0,0.25)]

        overflow-hidden
      ">

        {/* LIGHT GLOW */}
        <div className="
          absolute -top-20 -left-20 w-60 h-60
          bg-blue-400/20 rounded-full blur-[80px]
        "/>

        <div className="
          absolute -bottom-20 -right-20 w-60 h-60
          bg-purple-400/20 rounded-full blur-[80px]
        "/>

        {/* CONTENT */}
        <div className="relative z-10 text-center max-w-2xl mx-auto">

          <h2 className="text-3xl font-semibold mb-4 text-[#0f172a]">
            Як працює Sensoria
          </h2>

          <p className="text-gray-600 leading-relaxed">
            Sensoria — це платформа, де ви можете самостійно працювати зі своїм станом.
            Обирайте програму, проходьте її у зручному темпі та отримуйте практичні
            інструменти для реальних змін.
          </p>

        </div>

        {/* FEATURES */}
        <div className="relative z-10 grid md:grid-cols-3 gap-10 mt-14 text-center">

          <div>
            <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-white flex items-center justify-center">
              🛡️
            </div>
            <h3 className="font-semibold mb-2 text-[#0f172a]">Безпечний простір</h3>
            <p className="text-sm text-gray-500">
              Без оцінювання та тиску. Ви рухаєтесь у власному темпі.
            </p>
          </div>

          <div>
            <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-white/60 flex items-center justify-center">
              🎓
            </div>
            <h3 className="font-semibold mb-2 text-[#0f172a]">Практичні програми</h3>
            <p className="text-sm text-gray-500">
              Кожна програма — це чіткі кроки, які можна застосувати у житті.
            </p>
          </div>

          <div>
            <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-white/60 flex items-center justify-center">
              ⏱️
            </div>
            <h3 className="font-semibold mb-2 text-[#0f172a]">Гнучкий формат</h3>
            <p className="text-sm text-gray-500">
              Проходьте матеріал тоді, коли це зручно саме вам.
            </p>
          </div>

        </div>

        {/* STATS */}
        <div className="relative z-10 grid md:grid-cols-3 gap-8 mt-16 text-center">

          <div>
            <p className="text-3xl font-bold text-[#0f172a]">
              1000+
            </p>
            <p className="text-gray-500 text-sm mt-1">
              користувачів вже з нами
            </p>
          </div>

          <div>
            <p className="text-3xl font-bold text-[#0f172a]">
              10+
            </p>
            <p className="text-gray-500 text-sm mt-1">
              доступних програм
            </p>
          </div>

          <div>
            <p className="text-3xl font-bold text-[#0f172a]">
              Регулярні
            </p>
            <p className="text-gray-500 text-sm mt-1">
              оновлення програм
            </p>
          </div>

        </div>

      </div>

    </section>
  );
}