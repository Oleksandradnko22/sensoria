import { motion } from "framer-motion";
import type { Question, AssessmentAnswer } from "./questions";
import ProgressBar from "./ProgressBar";

type Props = {
  question: Question;
  current: number;
  total: number;
  onAnswer: (answer: AssessmentAnswer) => void;
  /** back to the previous question (absent on the first one) */
  onBack?: () => void;
};

export default function QuestionCard({ question, current, total, onAnswer, onBack }: Props) {
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
      className="min-h-screen flex items-center justify-center px-4 py-8 sm:px-6"
    >
      <div className="max-w-3xl w-full rounded-3xl bg-white/10 backdrop-blur-2xl border border-white/20 p-6 text-white sm:p-12">
        <ProgressBar current={current} total={total} />
        <div className="mt-4 h-9">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="-ml-2 inline-flex min-h-[36px] cursor-pointer items-center gap-1.5 rounded-full px-2 text-[14px] text-white/70 transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <span aria-hidden="true">←</span> Назад
            </button>
          )}
        </div>
        <p className="mt-4 text-[13px] sm:mt-6 font-semibold uppercase tracking-[0.12em] text-white/60">{question.lead}</p>
        <h1 className="text-[26px] sm:text-4xl font-bold leading-tight mt-3 mb-8 sm:mb-10">{question.question}</h1>
        <div className="flex flex-col gap-4 sm:gap-7">
          {question.answers.map((answer, index) => (
            <motion.button
              key={index}
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                onAnswer({
                  questionId: question.id,
                  answerIndex: index,
                  kind: question.kind,
                  scores: answer.scores,
                });
              }}
              className="w-full text-left px-6 py-4 sm:px-11 sm:py-5 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition text-lg cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              {answer.text}
            </motion.button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}