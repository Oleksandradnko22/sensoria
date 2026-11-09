import { Icon, type IconName } from "../ui/Icon";
import { useState, useEffect } from "react";

import QuestionCard from "./QuestionCard";
import LoadingScreen from "./LoadingScreen";

import { questions, type AssessmentAnswer } from "./questions";

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

const MICRO_INSIGHTS: MicroInsight[] = [
  {
    triggerAfterQuestion: 5,
    icon: "sparkle",
    title: "Ми вже бачимо перші закономірності",
    text: "Ваші відповіді допомагають точніше визначити ключові фактори, що впливають на ваш стан.",
  },
  {
    triggerAfterQuestion: 10,
    icon: "brain",
    title: "Ваш емоційний профіль майже сформовано",
    text: "Залишилось лише кілька відповідей для побудови персонального результату.",
  },
];

const MICRO_INSIGHT_PROGRESS_CAPTIONS = [
  "Аналізуємо відповіді...",
  "Виявляємо закономірності...",
  "Формуємо профіль...",
  "Готуємо наступний етап...",
];

export default function TestPage({
  onComplete,
}: Props) {

  const [current, setCurrent] = useState(0);

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
  const handleAnswer = (answer: AssessmentAnswer) => {
    const updated = [...answers, answer];

    setAnswers(updated);

    const nextQuestion = current + 1;

    const microInsight = MICRO_INSIGHTS.find(
      (insight) => insight.triggerAfterQuestion === nextQuestion
    );

    if (microInsight) {
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
        px-6
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

          p-10

          text-center
          text-white
          "
        >

          <div className="text-6xl mb-6">
            <span className="inline-flex"><Icon name={activeMicroInsight.icon} size={60} /></span>
          </div>

          <h2 className="text-4xl font-bold mb-6">
            {activeMicroInsight.title}
          </h2>

          <p className="text-white/70 text-lg leading-relaxed">
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

  // One question per screen is a locked invariant (RFC-004), not just the
  // current behavior — `current` only ever addresses a single question.
  // Assessment stays strictly linear: no back navigation exists anywhere
  // in this flow, and none should be added (RFC-004: correction isn't the
  // goal, re-editing an answer would require re-running category scoring
  // mid-flow).
  return (
    <QuestionCard
      question={questions[current]}
      current={current + 1}
      total={questions.length}
      onAnswer={handleAnswer}
    />
  );
}