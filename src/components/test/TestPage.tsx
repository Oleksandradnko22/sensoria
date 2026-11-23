import { Icon, type IconName } from "../ui/Icon";
import { useState, useEffect, useMemo, useRef } from "react";

import QuestionCard from "./QuestionCard";
import LoadingScreen from "./LoadingScreen";

import { buildQuestionnaire, type AssessmentAnswer } from "./questions";
import { isPrimaryStateId } from "../../utils/primaryState";

import { calculateResults } from "../../utils/calculateResults";
import funnelStore from "../../store/funnelStore";

type Props = {
  onComplete: (answers: AssessmentAnswer[]) => void;
};

// A micro-insight interstitial shown after a given question number. Two
// moments today (Q5/Q10) — the RFC-004 baseline, kept as the validated
// starting point. Extending this to more moments is just adding another
// entry here; nothing else in this file needs to change (RFC-004).
type MicroInsight = {
  triggerAfterQuestion: number;
  icon: IconName;
  title: string;
  text: string;
};

// One honest pause half-way (the questionnaire is 10–13 questions now): no pretend «analysis» while the person answers.
const halfwayInsight = (total: number): MicroInsight => ({
  triggerAfterQuestion: Math.ceil(total / 2),
  icon: "sparkle",
  title: "Половину пройдено",
  text: "Дякуємо, що відповідаєте чесно: так підбір матеріалів буде точнішим.",
});

const MICRO_INSIGHT_PROGRESS_CAPTIONS = [
  "Ще кілька питань…",
  "Ще кілька питань…",
  "Ще кілька питань…",
  "Продовжуємо…",
];

export default function TestPage({
  onComplete,
}: Props) {

  const [current, setCurrent] = useState(0);
  // the questions for the state(s) the person chose (questions.ts, version 2)
  const questions = useMemo(() => {
    const p = funnelStore.selectedState?.id;
    const s = funnelStore.secondaryState?.id ?? null;
    return isPrimaryStateId(p ?? "") ? buildQuestionnaire(p as never, s && isPrimaryStateId(s) ? s : null) : [];
  }, []);
  const MICRO_INSIGHTS = useMemo(() => [halfwayInsight(questions.length)], [questions.length]);

  const [answers, setAnswers] = useState<AssessmentAnswer[]>([]);

  const [showLoading, setShowLoading] =
    useState(false);

  // The active micro-insight interstitial, or null when none is showing.
  const [activeMicroInsight, setActiveMicroInsight] =
    useState<MicroInsight | null>(null);

  const [progressStep, setProgressStep] =
    useState(0);

  useEffect(() => {

    if (activeMicroInsight === null) return;

    const timer = setTimeout(() => {

      setActiveMicroInsight(null);

      setCurrent((prev) => prev + 1);

    }, 4000);

    return () => clearTimeout(timer);

  }, [activeMicroInsight]);

  useEffect(() => {

    if (activeMicroInsight === null) return;

    setProgressStep(0);

    const step1 =
      setTimeout(() => {
        setProgressStep(1);
      }, 500);

    const step2 =
      setTimeout(() => {
        setProgressStep(2);
      }, 1200);

    const step3 =
      setTimeout(() => {
        setProgressStep(3);
      }, 2000);

    return () => {
      clearTimeout(step1);
      clearTimeout(step2);
      clearTimeout(step3);
    };

  }, [activeMicroInsight]);

  // ANSWER
  const insightShown = useRef(false);

  const handleBack = () => {
    if (current === 0) return;
    const prevId = questions[current - 1].id;
    setAnswers((prev) => prev.filter((a) => a.questionId !== prevId));
    setCurrent(current - 1);
  };

  const handleAnswer = (answer: AssessmentAnswer) => {
    // a fast double click must not answer the next question too: only the question on screen counts, once
    if (answer.questionId !== questions[current]?.id || answers.some((a) => a.questionId === answer.questionId)) return;
    const updated = [...answers, answer];

    setAnswers(updated);

    const nextQuestion = current + 1;

    const microInsight = MICRO_INSIGHTS.find(
      (insight) => insight.triggerAfterQuestion === nextQuestion
    );

    // the halfway pause is shown once, not again after going back and re-answering
    if (microInsight && !insightShown.current) {
      insightShown.current = true;
      setActiveMicroInsight(microInsight);
      return;
    }

    if (nextQuestion >= questions.length) {
      setShowLoading(true);
    } else {
      setCurrent(nextQuestion);
    }
  };

  if (activeMicroInsight !== null) {

    return (

      <div
        className="
        min-h-screen
        flex
        items-center
        justify-center
        px-4
        sm:px-6
        "
      >

        <div
          className="
          max-w-xl
          w-full

          rounded-[32px]

          bg-white/10
          backdrop-blur-2xl

          border border-white/20

          px-6
          py-10
          sm:p-10

          text-center
          text-white
          "
        >

          <div className="text-6xl mb-6">
            <span className="inline-flex"><Icon name={activeMicroInsight.icon} size={60} /></span>
          </div>

          <h2 className="text-[28px] sm:text-4xl font-bold leading-tight mb-4 sm:mb-6">
            {activeMicroInsight.title}
          </h2>

          <p className="text-white/75 text-[16px] sm:text-lg leading-relaxed">
            {activeMicroInsight.text}
          </p>

        <div className="flex justify-center mt-10">

    <div className="relative w-16 h-16">

      <div
        className="
          absolute
          inset-0

          rounded-full

          border-[3px]
          border-white/10
        "
      />

      <div
        className="
          absolute
          inset-0

          rounded-full

          border-[3px]
          border-transparent
          border-t-white

          animate-spin
        "
      />

    </div>

  </div>

  <p
    className="
      mt-6
      text-center
      text-white/60
      text-sm
    "
  >
    {MICRO_INSIGHT_PROGRESS_CAPTIONS[progressStep]}
  </p>

        </div>

      </div>

    );
  }

  // LOADING
  if (showLoading) {
    return (
      <LoadingScreen
        onFinish={() => {

          calculateResults(funnelStore.selectedState, answers);

          onComplete(answers);
        }}
      />
    );
  }

  // One question per screen (RFC-004). «Назад» is allowed since version 2 (owner, 22.11.2026): scoring runs only
  // at the end (calculateResults), so going back simply drops the previous answer and asks it again.
  // opened without a chosen state (e.g. a direct link): nothing to ask yet
  if (questions.length === 0 || !questions[current]) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 text-center text-white">
        <div>
          <p className="mb-6 text-lg text-white/80">Спершу оберіть стан, з яким хочете попрацювати.</p>
          <a href="/" className="inline-flex min-h-[48px] items-center rounded-full bg-white px-6 font-semibold text-[#1e3a8a]">На головну</a>
        </div>
      </div>
    );
  }

  return (
    <QuestionCard
      question={questions[current]}
      current={current + 1}
      total={questions.length}
      onAnswer={handleAnswer}
      onBack={current > 0 ? handleBack : undefined}
    />
  );
}