import { useState, useEffect } from "react";

import QuestionCard from "./QuestionCard";
import LoadingScreen from "./LoadingScreen";

import { questions } from "./questions";

import { calculateResults } from "../../utils/calculateResults";

type Props = {
  onComplete: (answers: any[]) => void;
};

export default function TestPage({
  onComplete,
}: Props) {

  useEffect(() => {
  console.log("MOUNT");

  return () => {
    console.log("UNMOUNT");
  };
}, []);

  const [current, setCurrent] = useState(0);

  const [answers, setAnswers] = useState<any[]>([]);

  const [showLoading, setShowLoading] =
    useState(false);

    const [insightStep, setInsightStep] =
  useState<number | null>(null);

  const [progressStep, setProgressStep] =
  useState(0);

  useEffect(() => {

  if (insightStep === null) return;

  const timer = setTimeout(() => {

    setInsightStep(null);

    setCurrent((prev) => prev + 1);

  }, 4000);

  return () => clearTimeout(timer);

}, [insightStep]);

useEffect(() => {

  if (insightStep === null) return;

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

}, [insightStep]);

  // ANSWER
  const handleAnswer = (scores: any) => {
    const updated = [...answers, scores];

    setAnswers(updated);

    // LAST QUESTION
    const nextQuestion = current + 1;

if (nextQuestion === 5) {
  setInsightStep(1);
  return;
}

if (nextQuestion === 10) {
  setInsightStep(2);
  return;
}

if (nextQuestion >= questions.length) {
  setShowLoading(true);
} else {
  setCurrent(nextQuestion);
}
  };

if (insightStep !== null) {

  const insightData = {

    1: {
      emoji: "✨",
      title:
        "Ми вже бачимо перші закономірності",

      text:
        "Ваші відповіді допомагають точніше визначити ключові фактори, що впливають на ваш стан.",
    },

    2: {
      emoji: "🧠",
      title:
        "Ваш емоційний профіль майже сформовано",

      text:
        "Залишилось лише кілька відповідей для побудови персонального результату.",
    },

  };

  const currentInsight =
    insightData[
      insightStep as keyof typeof insightData
    ];

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
          {currentInsight.emoji}
        </div>

        <h2 className="text-4xl font-bold mb-6">
          {currentInsight.title}
        </h2>

        <p className="text-white/70 text-lg leading-relaxed">
          {currentInsight.text}
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
  {
    progressStep === 0
      ? "Аналізуємо відповіді..."
      : progressStep === 1
      ? "Виявляємо закономірності..."
      : progressStep === 2
      ? "Формуємо профіль..."
      : "Готуємо наступний етап..."
  }
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

          calculateResults(answers);

          onComplete(answers);
        }}
      />
    );
  }

  // RESULTS
  return (
    <QuestionCard
      question={questions[current]}
      current={current + 1}
      total={questions.length}
      onAnswer={handleAnswer}
    />
  );
}
