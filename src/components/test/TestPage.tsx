import { useState } from "react";

import QuestionCard from "./QuestionCard";
import ResultsPage from "./ResultsPage";
import LoadingScreen from "./LoadingScreen";

import { questions } from "./questions";

import {
  calculateResults,
  getTopCategories,
} from "./testUtils";

import { setActiveTags } from "../../store/recommendationStore";


export default function TestPage({
    onHome,
}: any) {
  const [started] = useState(true);

  const [current, setCurrent] = useState(0);

  const [answers, setAnswers] = useState<any[]>([]);

  const [finished, setFinished] = useState(false);

  const [showLoading, setShowLoading] =
    useState(false);

  // ANSWER
  const handleAnswer = (scores: any) => {
    const updated = [...answers, scores];

    setAnswers(updated);

    // LAST QUESTION
    if (current + 1 >= questions.length) {
      setShowLoading(true);
    } else {
      setCurrent((prev) => prev + 1);
    }
  };

  // LOADING
  if (showLoading) {
    return (
      <LoadingScreen
        onFinish={() => {

          setShowLoading(false);

          setTimeout(() => {
            setFinished(true);
          }, 100);
        }}
      />
    );
  }

  // RESULTS
  if (finished) {
    const results = calculateResults(answers);

    const topCategories =
      getTopCategories(results);

      setActiveTags(topCategories);

    const fullResults = results

    return (
      <ResultsPage
        topCategories={topCategories}
        results={fullResults}
        onHome={() => {
          setCurrent(0);
          setAnswers([]);
          setFinished(false);

            onHome();
        }}
      />
    );
  }

  // QUESTIONS
  return (
    <QuestionCard
      question={questions[current]}
      current={current + 1}
      total={questions.length}
      onAnswer={handleAnswer}
    />
  );
}