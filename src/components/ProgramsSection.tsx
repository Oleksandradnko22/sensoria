import { useEffect, useRef, useState } from "react";
import CourseCard from "./CourseCard";

const programs: any[] = [
  {
    title: "Зниження тривожності",
    author: "Олена Мельник",
    meta: "6 модулів • 18 уроків",
    price: "1200",
    recommended: true,
  },
  {
    title: "Робота зі стресом",
    author: "Андрій Коваленко",
    meta: "5 модулів • 16 уроків",
    price: "1500",
    recommended: true,
  },
  {
    title: "Здорова самооцінка",
    author: "Марія Шевченко",
    meta: "6 модулів • 22 уроки",
    price: "Безкоштовно",
  },
  {
    title: "Усвідомленість у житті",
    author: "Ігор Петренко",
    meta: "4 модулі • 14 уроків",
    price: "900",
    recommended: true,
  },
  {
    title: "Контроль емоцій",
    author: "Світлана Бондар",
    meta: "5 модулів • 20 уроків",
    price: "1100",
    createdAt: "2026-05-01",
  },
];

export default function ProgramsSection({ onOpen = () => {} }: any) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  // ширина шага (карточка + gap)
  const STEP = 260 + 24; // 260px карточка + gap-6 (24px)

  // автоподсказка (1 раз чуть двигаем)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const t = setTimeout(() => {
      el.scrollTo({ left: 80, behavior: "smooth" });
      setTimeout(() => {
        el.scrollTo({ left: 0, behavior: "smooth" });
      }, 800);
    }, 800);

    return () => clearTimeout(t);
  }, []);

  // считаем активный индекс для точек
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollLeft / STEP);
    setActive(Math.min(programs.length - 1, Math.max(0, idx)));
  };

  // переход по точке
  const goTo = (i: number) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ left: i * STEP, behavior: "smooth" });
  };

  return (
    <section 
      id="programs"
      className="max-w-7xl mx-auto px-6 py-24 text-white relative overflow-visible">
      {/* HEADER */}
      <div className="mb-10">
        <h2 className="text-4xl md:text-5xl font-bold mb-3">
          Популярні програми
        </h2>
        <p className="text-white/70 text-lg">
          Оберіть програму для свого стану
        </p>
      </div>

      {/* СЛАЙДЕР */}
      <div className="relative pt-2">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="
            flex gap-6
            overflow-x-auto
            no-scrollbar
            pb-6
            pr-10

            cursor-grab active:cursor-grabbing
          "
        >
          {programs.map((program, i) => (
            <div 
            key={i} 
            className="
            shrink-0
            w-[300px]
            ">
              <CourseCard
                program={program}
                onClick={() => onOpen(program)}
              />
            </div>
          ))}
        </div>

        {/* ПЛАВАЮЩАЯ ПОДСКАЗКА-СТРЕЛКА (не кнопка) */}
        <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-white/60 animate-pulse">
          →
        </div>
      </div>

      {/* ТОЧКИ */}
      <div className="flex justify-center gap-2 mt-6">
        {programs.map((_, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            className={`
              h-2.5 rounded-full transition-all
              ${i === active ? "w-6 bg-white" : "w-2.5 bg-white/30"}
            `}
          />
        ))}
      </div>

      {/* КНОПКА */}
      <div className="flex justify-center mt-12">
        <button
          className="
            relative px-8 py-3.5 rounded-xl
            bg-white/10 border border-white/30
            backdrop-blur-md
            overflow-hidden
            transition
            hover:scale-[1.03]
          "
        >
          <span className="relative z-10">
            Переглянути всі програми →
          </span>

          {/* glass shine */}
          <span
            className="
              absolute inset-0
              bg-gradient-to-r from-transparent via-white/40 to-transparent
              translate-x-[-100%]
              animate-[shine_3s_linear_infinite]
            "
          />
        </button>
      </div>

      {/* keyframes */}
      <style>
        {`
          @keyframes shine {
            100% {
              transform: translateX(100%);
            }
          }
        `}
      </style>
    </section>
  );
}