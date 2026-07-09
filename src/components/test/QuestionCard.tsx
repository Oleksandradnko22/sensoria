import { motion } from "framer-motion";

import type { Question } from "./questions";

import ProgressBar from "./ProgressBar";

type Props = {
  question: Question;

  current: number;

  total: number;

  onAnswer: (scores: any) => void;
};

export default function QuestionCard({
  question,
  current,
  total,
  onAnswer,
}: Props) {
  
  return (
    <motion.div
      initial={{
        opacity: 0,
        y: 40,
        scale: 0.97,
      }}

      animate={{
        opacity: 1,
        y: 0,
        scale: 1,
      }}

      exit={{
        opacity: 0,
        y: -30,
        scale: 0.96,
      }}

      transition={{
        duration: 0.45,
        ease: "easeOut",
      }}

      className="
        min-h-screen
        flex
        items-center
        justify-center
        px-6
      "
    >
      <div
        className="
          max-w-3xl
          w-full

          rounded-3xl

          bg-white/10
          backdrop-blur-2xl

          border border-white/20

          p-10

          text-white
        "
      >
        <ProgressBar
          current={current}
          total={total}
        />

        <h1
          className="
            text-4xl
            font-bold
            leading-tight

            mt-10
            mb-10
          "
        >
          {question.question}
        </h1>

        <div className="flex flex-col gap-4">

          {question.answers.map((answer, index) => (

            <motion.button
              key={index}

              whileHover={{
                scale: 1.02,
                y: -2,
              }}

              whileTap={{
                scale: 0.98,
              }}

              onClick={() => {

  onAnswer({
  scores: answer.scores,
  answerIndex: index,
});

}}

             className="
  w-full
  text-left

  p-6

  min-h-[88px]

  flex
  items-center

  rounded-2xl

  bg-white/5
  border border-white/10

  hover:bg-white/10
  hover:border-white/20

  transition

  text-lg
"
            >
              {answer.text}
            </motion.button>

          ))}

        </div>
      </div>
    </motion.div>
  );
}
