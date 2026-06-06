type Props = {
  onStart: () => void;
};

export default function TestIntro({ onStart }: Props) {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">

      <div
        className="
          max-w-2xl w-full
          rounded-3xl
          bg-white/10
          backdrop-blur-2xl
          border border-white/20
          p-10
          text-white
        "
      >

        <h1 className="text-4xl font-bold leading-tight mb-6">
          Зрозумійте свій поточний емоційний стан
        </h1>

        <p className="text-white/75 text-lg leading-relaxed mb-8">
          Тест допоможе визначити ваш емоційний фокус
          та підібрати програми, які можуть бути корисними саме зараз.
        </p>

        <div className="flex gap-4 flex-wrap mb-10">
          <div className="px-4 py-2 rounded-xl bg-white/10">
            ⏱️ ~3 хвилини
          </div>

          <div className="px-4 py-2 rounded-xl bg-white/10">
            🔒 Конфіденційно
          </div>

          <div className="px-4 py-2 rounded-xl bg-white/10">
            🧠 20 питань
          </div>
        </div>

        <button
          onClick={onStart}
          className="
            w-full py-4 rounded-2xl
            bg-white text-black
            font-semibold text-lg
            hover:scale-[1.02]
            transition
          "
        >
          Почати тест →
        </button>
      </div>

    </div>
  );
}