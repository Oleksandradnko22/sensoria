import { useState, useRef } from "react";

type Item = {
  q: string;
  a: string;
};

const faq: Item[] = [
  {
    q: "Чи підходять ці програми мені?",
    a: "Так. Програми створені для різних станів — від тривожності до вигорання. Пройдіть тест і отримайте персональну рекомендацію.",
  },
  {
    q: "Скільки часу займає проходження?",
    a: "У середньому 10–20 хвилин на день. Ви самі обираєте темп.",
  },
  {
    q: "Чи це замінює психолога?",
    a: "Ні. Це інструмент самодопомоги. У складних станах варто звернутись до спеціаліста.",
  },
  {
    q: "Як зрозуміти, яку програму обрати?",
    a: "Ми підберемо її автоматично після короткого тесту.",
  },
  {
    q: "Чи можна проходити у своєму темпі?",
    a: "Так. Без дедлайнів і обмежень.",
  },
];

export default function FAQSection({onopentest = () => {}}: any) {
  const [open, setOpen] = useState<number | null>(0);
  const refs = useRef<(HTMLDivElement | null)[]>([]);

  const toggle = (i: number) => {
    setOpen(open === i ? null : i);
  };

  return (
    <section className="relative z-10 w-full pt-16 pb-24 text-white">
      <div className="max-w-7xl mx-auto px-6">

        {/* HEADER */}
        <div className="mb-14">
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            Часті запитання
          </h2>
          <p className="text-white/70 text-lg">
            Відповіді на ключові питання перед початком
          </p>
        </div>

        {/* FAQ */}
        <div className="flex flex-col gap-4">
          {faq.map((item, i) => {
            const isOpen = open === i;

            return (
              <div
                key={i}
                className={`
                  rounded-xl
                  border
                  transition
                  overflow-hidden
                  ${
                    isOpen
                      ? "border-white/30 bg-white/10"
                      : "border-white/10 bg-white/5 hover:bg-white/10"
                  }
                `}
              >
                {/* QUESTION */}
                <button
                  onClick={() => toggle(i)}
                  className="
                    w-full flex items-center justify-between
                    px-6 py-5 text-left
                  "
                >
                  <div className="flex items-center gap-3">
                    {/* ICON */}
                    <div
                      className={`
                        w-6 h-6 flex items-center justify-center
                        rounded-full text-xs font-bold
                        transition
                        ${
                          isOpen
                            ? "bg-white text-black"
                            : "bg-white/20 text-white"
                        }
                      `}
                    >
                      ?
                    </div>

                    <span className="text-lg font-medium">
                      {item.q}
                    </span>
                  </div>

                  <span
                    className={`
                      text-xl transition-transform duration-300
                      ${isOpen ? "rotate-45" : ""}
                    `}
                  >
                    +
                  </span>
                </button>

                {/* ANSWER */}
                <div
                  ref={(el) => {
                    if (el) refs.current[i] = el;
                  }}
                  style={{
                    maxHeight: isOpen
                      ? (refs.current[i]?.scrollHeight ||200) + "px"
                      : "0px",
                  }}
                  className="
                    px-6
                    text-white/70 text-sm leading-relaxed
                    overflow-hidden
                    transition-all duration-300 ease-in-out
                  "
                >
                  <div className="pb-5">
                    {item.a}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {/* CTA BLOCK */}
        <div
          className="
            mt-20
            rounded-2xl
            p-10
            text-center
            border border-white/15
            bg-gradient-to-br from-white/10 to-white/5
            backdrop-blur-md
          "
        >
          <h3 className="text-2xl md:text-3xl font-semibold mb-4">
            Все ще є питання?
          </h3>

          <p className="text-white/70 mb-8 max-w-[800px] mx-auto text-center leading-relaxed">
            Пройдіть короткий тест — і ми підберемо програму саме під ваш стан та цілі
          </p>

          <button
            onClick={onopentest}
            className="
              px-8 py-3.5
              rounded-xl
              bg-white text-black
              font-medium
              hover:bg-gray-100
              hover:scale-[1.03]
              active:scale-[0.97]
              transition
            "
          >
            Пройти тест →
          </button>
        </div>

      </div>
    </section>
  );
}