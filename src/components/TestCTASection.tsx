export default function TestCTA() {
  return (
    <section className="px-6 mt-32 mb-20">
      <div
        className="
          max-w-5xl mx-auto
          rounded-3xl
          px-8 py-16
          text-center
          text-white
          relative overflow-hidden

          shadow-[0_20px_60px_rgba(0,0,0,0.25)]
        "
        style={{
          background: "linear-gradient(135deg, #1e40ff 0%, #7c3aed 100%)",
        }}
      >
        {/* мягкое свечение внутри */}
        <div className="absolute inset-0 opacity-20 bg-white blur-3xl pointer-events-none" />

        {/* CONTENT */}
        <h2 className="text-3xl md:text-4xl font-bold mb-4 relative z-10">
          Почніть свій шлях до балансу вже сьогодні
        </h2>

        <p className="text-white/80 text-lg mb-8 max-w-2xl mx-auto relative z-10">
          Пройдіть короткий тест, щоб дізнатися, які програми підходять саме вам
        </p>

        {/* BUTTON */}
        <button
          className="
            relative z-10
            px-8 py-3.5
            rounded-xl
            bg-white text-black
            font-medium

            transition-all duration-300
            hover:scale-[1.05]
            active:scale-[0.97]

            shadow-md hover:shadow-xl
          "
        >
          Пройти тест →
        </button>
      </div>
    </section>
  );
}