import { motion } from "framer-motion";
import { useEffect, useState } from "react";

type Props = {
  onFinish: () => void;
};

const steps = [
  "Аналізуємо ваші відповіді...",
  "Визначаємо емоційні патерни...",
  "Формуємо персональний профіль...",
  "Підбираємо рекомендації...",
];

export default function LoadingScreen({
  onFinish,
}: Props) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (active >= steps.length - 1) {
      const final = setTimeout(() => {
        onFinish();
      }, 1200);

      return () => clearTimeout(final);
    }

    const timer = setTimeout(() => {
      setActive((prev) => prev + 1);
    }, 1400);

    return () => clearTimeout(timer);
  }, [active]);

  return (
    <motion.div
  initial={{
    opacity: 0,
  }}

  animate={{
    opacity: 1,
  }}

  exit={{
    opacity: 0,
    }}

  transition={{
    duration: 0.5,
  }}
      className="
      min-h-screen 

      flex 
      items-center
      justify-center
      
        px-6
      text-white"
    >

 {/* GLOW */}
        <div
          className="
            absolute -top-20 -left-20
            w-60 h-60
            bg-blue-400/20
            rounded-full
            blur-[90px]
          "
        />

        <div
          className="
            absolute -bottom-20 -right-20
            w-60 h-60
            bg-purple-400/20
            rounded-full
            blur-[90px]
          "
        ></div>

       {/* CONTENT */}
<div className="relative z-10"/>

<div
    className="
      max-w-2xl
      w-full

      rounded-[32px]

      bg-white/10
      backdrop-blur-2xl

      border border-white/20

      p-10
    "
  >

  {/* SPINNER */}
  <div className="flex justify-center mb-10">

    <div className="relative w-20 h-20">

      <div
        className="
          absolute inset-0
          rounded-full
          border-4 border-white/10
        "
      />

      <div
        className="
          absolute inset-0
          rounded-full
          border-4 border-transparent
          border-t-white
          animate-spin
        "
      />

    </div>

  </div>

    {/* TITLE */}
    <h1 className="text-4xl font-bold text-center text-white mb-10">
      Формуємо ваш результат
    </h1>

    {/* STEPS */}
    <div className="flex flex-col gap-4">

      {steps.map((step, i) => {
        const completed = i <= active;

        return (
          <div
            key={i}
            className={`
              flex items-center gap-4
              px-5 py-4
              rounded-2xl

              border transition-all duration-500

              ${
                completed
                  ? "bg-white/10 border-white/20 text-white"
                  : "bg-white/5 border-white/5 text-white/40"
              }
            `}
          >
            <div
              className={`
                w-7 h-7 rounded-full
                flex items-center justify-center
                text-sm

                ${
                  completed
                    ? "bg-white text-black"
                    : "bg-white/10"
                }
              `}
            >
              {completed ? "✓" : ""}
            </div>

            <span className="text-sm md:text-base">
              {step}
            </span>

          </div>
        );
      })}

    </div>

  </div>

</motion.div>
    );
}
