import Link from "next/link";

export default function HomeUI() {
  return (
    <main className="flex flex-col">

      {/* HERO */}
      <section className="min-h-screen flex flex-col items-center justify-center text-center px-6">
        <h1 className="text-5xl font-bold mb-4">Sensoria</h1>
        <p className="text-lg text-gray-600 mb-6 max-w-xl">
          Платформа для ментального здоровʼя, розвитку та внутрішнього балансу
        </p>

        <Link
          href="/catalog"
          className="bg-black text-white px-6 py-3 rounded-xl"
        >
          Знайти курс
        </Link>
      </section>

      {/* FEATURES */}
      <section className="py-16 px-6 grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
        <div className="p-6 border rounded-xl">
          <h3 className="font-semibold mb-2">Медитації</h3>
          <p className="text-gray-600">Практики для зниження стресу</p>
        </div>

        <div className="p-6 border rounded-xl">
          <h3 className="font-semibold mb-2">Курси</h3>
          <p className="text-gray-600">Навчання від експертів</p>
        </div>

        <div className="p-6 border rounded-xl">
          <h3 className="font-semibold mb-2">Психологія</h3>
          <p className="text-gray-600">Робота з емоціями</p>
        </div>
      </section>

      {/* CTA (твой блок адаптированный) */}
      <section className="py-16 bg-gradient-to-br from-[#3d4ed7] to-[#8b5cf6] text-white text-center px-6">
        <h2 className="text-3xl font-bold mb-4">
          Почніть свій шлях до балансу вже сьогодні
        </h2>

        <p className="mb-6 text-white/90">
          Пройдіть короткий тест, щоб дізнатися, які програми підходять саме вам
        </p>

        <Link
          href="/catalog"
          className="inline-block px-8 py-3 bg-white text-[#3d4ed7] rounded-xl"
        >
          Пройти тест
        </Link>
      </section>

    </main>
  );
}
