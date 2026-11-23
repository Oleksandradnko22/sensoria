import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { Question, AssessmentAnswer } from "./questions";
import logo from "../../assets/logo.png";

type Props = {
  question: Question;
  current: number;
  total: number;
  onAnswer: (answer: AssessmentAnswer) => void;
  /** back to the previous question (absent on the first one) */
  onBack?: () => void;
};

// One question per screen (RFC-004). Phones: no card around the question (the whole width goes to the text, so all
// answers fit on one screen); from 640 px — the glass card. The top bar is the same as on the first step: the logo
// home and where the person is. Progress is a thin «living» bar (spring fill).
export default function QuestionCard({ question, current, total, onAnswer, onBack }: Props) {
  const progress = (current / total) * 100;
  // the chosen answer is shown for a moment (highlight + check) before the next question opens
  const [picked, setPicked] = useState<number | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(() => {
    setPicked(null);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [question.id]);
  const choose = (index: number) => {
    if (picked !== null) return;
    const answer = question.answers[index];
    if (!answer) return;
    setPicked(index);
    timer.current = window.setTimeout(() => {
      onAnswer({ questionId: question.id, answerIndex: index, kind: question.kind, scores: answer.scores });
    }, 300);
  };
  // keyboard: 1–4 choose an answer (laptops)
  const chooseRef = useRef(choose);
  chooseRef.current = choose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= 9) chooseRef.current(n - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="funnel-page question-page relative flex flex-col overflow-hidden px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pb-8 sm:pt-6 lg:pb-5"
    >
      {/* phones: soft rings low on the screen (as in the home hero), so the space under the answers is calm, not empty */}
      <div aria-hidden="true" className="test-rings pointer-events-none absolute inset-x-0 bottom-0 h-[55%] sm:hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_100%,rgba(168,232,255,0.22),transparent_65%)]" />
        <svg viewBox="0 0 400 400" className="test-rings-svg absolute left-1/2 top-[38%] w-[150%] max-w-[620px] -translate-x-1/2 opacity-[0.16]" fill="none" stroke="white">
          <circle cx="200" cy="200" r="70" strokeWidth="1" />
          <circle cx="200" cy="200" r="120" strokeWidth="1" />
          <circle cx="200" cy="200" r="170" strokeWidth="1" />
          <circle cx="200" cy="200" r="220" strokeWidth="1" className="test-ring-outer" />
          <circle cx="200" cy="200" r="270" strokeWidth="1" className="test-ring-extra" />
        </svg>
      </div>
      {/* portrait tablets only: very light rings behind the card, the same motif as on phones and the home hero */}
      <div aria-hidden="true" className="test-bg-rings pointer-events-none absolute inset-0 hidden">
        <svg viewBox="0 0 400 400" className="absolute left-1/2 top-1/2 w-[min(1400px,170vmax)] -translate-x-1/2 -translate-y-1/2 opacity-[0.08]" fill="none" stroke="white">
          <circle cx="200" cy="200" r="90" strokeWidth="0.6" />
          <circle cx="200" cy="200" r="130" strokeWidth="0.6" />
          <circle cx="200" cy="200" r="170" strokeWidth="0.6" />
        </svg>
      </div>
      <div className="qbar relative mx-auto flex w-full max-w-3xl items-center justify-between gap-3 sm:max-w-[640px] lg:max-w-[720px]">
        <a
          href="/"
          aria-label="Sensoria — на головну"
          className="tb-logo inline-flex items-center gap-1 rounded-full bg-white/10 py-1.5 pl-2.5 pr-4 text-white sm:gap-1.5 sm:py-2 sm:pl-3 sm:pr-5 ring-1 ring-white/15 backdrop-blur transition-colors hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <img src={logo} alt="" className="tb-logo-img h-7 w-7 object-contain brightness-0 invert sm:h-9 sm:w-9" />
          <span className="tb-logo-text text-[14px] font-semibold tracking-wide sm:text-[16px]">SENSORIA</span>
        </a>
        <span className="tb-chip rounded-full bg-white/10 px-3.5 py-1.5 text-[13px] font-semibold text-white/85 ring-1 ring-white/15 sm:px-5 sm:py-2.5 sm:text-[16px]">
          Крок 2 · Тест
        </span>
      </div>

      <div className="qcard-wrap relative flex flex-1 flex-col pt-7 sm:flex-row sm:items-center sm:justify-center sm:py-10 lg:py-5">
        <div className="qcard w-full max-w-3xl text-white sm:max-w-[640px] lg:max-w-[720px] sm:rounded-[32px] sm:border sm:border-white/20 sm:bg-white/10 sm:p-10 sm:backdrop-blur-2xl md:p-12 lg:px-12 lg:py-9">
          {/* progress: back on the left (from the second question), «3 з 13» on the right */}
          <div className="flex h-9 items-center justify-between sm:h-11">
            {onBack ? (
              <button
                type="button"
                onClick={() => {
                  // a pending answer (the 0.3 s highlight) must not land on the question we go back from
                  if (timer.current) window.clearTimeout(timer.current);
                  timer.current = null;
                  setPicked(null);
                  onBack();
                }}
                className="-ml-2 inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-2 text-[14px] font-medium text-white/75 sm:min-h-[44px] sm:-ml-3 sm:px-3 sm:text-[16px] transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="sm:h-[18px] sm:w-[18px]">
                  <path d="M19 12H5M11 18l-6-6 6-6" />
                </svg>
                Назад
              </button>
            ) : (
              <span />
            )}
            <motion.span key={current} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="text-[13px] font-semibold text-white/65 sm:text-[16px]">
              {current} з {total}
            </motion.span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/15" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={current} aria-label={`Питання ${current} з ${total}`}>
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-[#a8e8ff] to-[#e4ddff]"
              animate={{ width: `${progress}%` }}
              transition={{ type: "spring", stiffness: 120, damping: 20 }}
            />
          </div>

          <p className="qlead mt-7 text-[12px] font-semibold uppercase tracking-[0.12em] text-white/60 sm:mt-9 sm:text-[13px] lg:mt-7">{question.lead}</p>
          <h1 className="mb-7 mt-3 text-[24px] font-bold leading-[1.2] min-[380px]:text-[26px] min-[420px]:text-[28px] sm:mb-9 sm:mt-3 lg:mb-7 sm:text-[34px] md:text-4xl">{question.question}</h1>

          <div className="qanswers flex flex-col gap-3 sm:gap-4 lg:gap-3">
            {question.answers.map((answer, index) => (
              <motion.button
                key={index}
                type="button"
                whileTap={{ scale: 0.98 }}
                aria-pressed={picked === index}
                onClick={() => choose(index)}
                className={`group flex w-full items-center justify-between gap-4 rounded-[20px] border border-white/12 bg-white/[0.08] px-5 py-4 text-left text-[16px] min-[380px]:py-[18px] min-[380px]:text-[17px] font-medium leading-snug text-white transition-colors hover:border-white/30 hover:bg-white/[0.14] focus:outline-none focus-visible:ring-2 focus-visible:ring-white sm:rounded-2xl sm:px-7 sm:py-5 sm:text-lg lg:py-4 ${picked === index ? "!border-white/80 !bg-white/[0.22]" : ""}`}
              >
                {answer.text}
                <span aria-hidden="true" className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition sm:h-7 sm:w-7 ${picked === index ? "bg-white text-[#2b3fd0]" : "ring-1 ring-inset ring-white/40 group-hover:ring-white/70"}`}>
                  {picked === index && (
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                  )}
                </span>
              </motion.button>
            ))}
          </div>
        </div>
        <p className="mt-auto pt-8 text-center text-[13px] leading-relaxed text-white/65 sm:hidden">
          Немає правильних чи неправильних відповідей — обирайте те, що ближче саме вам.
        </p>
      </div>
    </motion.div>
  );
}
