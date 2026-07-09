import { motion } from "framer-motion";
import { useEffect, useState } from "react";

type Props = {
  onFinish: () => void;
};

export default function LoadingScreen({
  onFinish,
}: Props) {
  const [progress, setProgress] = useState(0);

const loadingTexts = [
  "Аналізуємо взаємозв'язки між відповідями",
  "Визначаємо основні закономірності",
  "Формуємо емоційний профіль",
  "Підбираємо персональні рекомендації",
];

  useEffect(() => {

  const timer = setInterval(() => {

    setProgress((prev) => {

      if (prev >= 100) {

  console.log("100%");

  clearInterval(timer);

  setTimeout(() => {

    console.log("CALLING onFinish");

    onFinish();

  }, 400);

  return 100;
}

      return prev + 2;

    });

  }, 80);

  return () => clearInterval(timer);

}, []);

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
<div className="relative z-10">

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

    <div className="text-center">

  <p
    className="
      text-white/70
      text-lg
      leading-relaxed
      mb-8
      max-w-xl
      mx-auto
    "
  >
    {
      loadingTexts[
        Math.min(
          Math.floor(progress / 25),
          3
        )
      ]
    }
  </p>

  <div
    className="
      h-3
      rounded-full
      bg-white/10
      overflow-hidden
      mb-4
    "
  >

    <div
      className="
        h-full
        rounded-full

        bg-gradient-to-r
        from-cyan-400
        via-blue-400
        to-purple-400

        transition-all
        duration-300
      "
      style={{
        width: `${progress}%`,
      }}
    />

  </div>

  <div
    className="
      text-white/60
      text-sm
    "
  >
    {progress}%
  </div>

</div>

    </div>

  </div>

</motion.div>
    );
}
