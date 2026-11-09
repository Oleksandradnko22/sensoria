import { motion } from "framer-motion";
import type { Question, AssessmentAnswer } from "./questions";
import ProgressBar from "./ProgressBar";

type Props = {
  question: Question;
  current: number;
  total: number;
  onAnswer: (answer: AssessmentAnswer) => void;
};

export default function QuestionCard({ question, current, total, onAnswer }: Props) {
  // Larger cards / more whitespace are locked requirements (RFC-004); exact
  // values deferred to Product/Design — simplest neutral increase for now.
  // Answer cards: no `min-h`/`flex items-center` (that fixed a height
  // taller than the text needed and centered into it, which is what
  // made the old `p-7` read as uneven top-to-bottom vs. left-to-right).
  // Padding is deliberately asymmetric per Sasha's follow-up: less `py`
  // than `px` so each card reads as wider and shorter, not a square.
  return (
    <motion.div
      initial={{ opacity: 0, y: 40, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -30, scale: 0.96 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      className="min-h-screen flex items-center justify-center px-6"
    >
      <div className="max-w-3xl w-full rounded-3xl bg-white/10 backdrop-blur-2xl border border-white/20 p-12 text-white">
        <ProgressBar current={current} total={total} />
        <h1 className="text-4xl font-bold leading-tight mt-12 mb-12">{question.question}</h1>
        <div className="flex flex-col gap-7">
          {question.answers.map((answer, index) => (
            <motion.button
              key={index}
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                onAnswer({
                  questionId: question.id,
                  answerIndex: index,
                  scores: answer.scores,
                });
              }}
              className="w-full text-left px-11 py-5 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition text-lg"
            >
              {answer.text}
            </motion.button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}