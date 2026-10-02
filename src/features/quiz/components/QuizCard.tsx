// src/features/quiz/components/QuizCard.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { submitQuizAnswers, type QuizResultItem } from "../actions";

type QuestionForDisplay = {
  id: string;
  question: string;
  options: string[];
};

type QuizCardProps = {
  chapterId: string;
};

/**
 * Renders all 5 questions at once with a single submit button at the end
 * (simpler than one-question-at-a-time, per Sprint 12's explicit "pick
 * simpler" allowance). No visual polish/animations — that's Sprint 15.
 */
export function QuizCard({ chapterId }: QuizCardProps) {
  const [questions, setQuestions] = useState<QuestionForDisplay[] | null>(null);
  const [selections, setSelections] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    score: number;
    passed: boolean;
    results: QuizResultItem[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadQuestions() {
    setLoading(true);
    setError(null);
    setResult(null);
    setSelections({});
    try {
      const res = await fetch(`/api/quiz/${chapterId}/questions`, {
        credentials: "include",
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? "Greška pri učitavanju pitanja.");
      setQuestions(data.questions);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadQuestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterId]);

  function selectAnswer(questionId: string, optionIndex: number) {
    if (result) return; // locked after submission
    setSelections((prev) => ({ ...prev, [questionId]: optionIndex }));
  }

  async function handleSubmit() {
    if (!questions) return;
    if (Object.keys(selections).length < questions.length) {
      setError("Molimo odgovorite na sva pitanja prije predaje.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const answers = questions.map((q) => ({
        questionId: q.id,
        selectedIndex: selections[q.id],
      }));
      const response = await submitQuizAnswers(chapterId, answers);
      if (!response.success) {
        setError(response.error);
        return;
      }
      setResult({ score: response.score, passed: response.passed, results: response.results });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <p className="text-gray-600">Učitavanje pitanja...</p>;
  }

  if (!questions) {
    return <p className="text-red-600">{error ?? "Pitanja nisu dostupna."}</p>;
  }

  const resultByQuestionId = new Map((result?.results ?? []).map((r) => [r.questionId, r]));

  return (
    <div className="space-y-6">
      {questions.map((q, index) => {
        const questionResult = resultByQuestionId.get(q.id);
        const selected = selections[q.id];

        return (
          <div key={q.id} className="p-4 bg-white rounded border border-gray-200">
            <p className="font-medium text-idss-dark-blue mb-3">
              {index + 1}. {q.question}
            </p>
            <div className="space-y-2">
              {q.options.map((option, optionIndex) => {
                const isSelected = selected === optionIndex;
                let optionClass = "border-gray-300";
                if (questionResult) {
                  if (optionIndex === questionResult.correctIndex) {
                    optionClass = "border-green-500 bg-green-50";
                  } else if (isSelected && !questionResult.correct) {
                    optionClass = "border-red-500 bg-red-50";
                  }
                } else if (isSelected) {
                  optionClass = "border-idss-dark-blue bg-blue-50";
                }

                return (
                  <button
                    key={optionIndex}
                    type="button"
                    onClick={() => selectAnswer(q.id, optionIndex)}
                    disabled={!!result}
                    className={`w-full text-left p-3 rounded border-2 transition ${optionClass}`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
            {questionResult && (
              <p className="mt-3 text-sm text-gray-600">
                <span
                  className={
                    questionResult.correct
                      ? "text-green-700 font-medium"
                      : "text-red-700 font-medium"
                  }
                >
                  {questionResult.correct ? "Tačno. " : "Netačno. "}
                </span>
                {questionResult.explanation}
              </p>
            )}
          </div>
        );
      })}

      {error && <p className="text-red-600">{error}</p>}

      {!result && (
        <button onClick={handleSubmit} disabled={submitting} className="btn-primary">
          {submitting ? "Predaja u toku..." : "Predaj odgovore"}
        </button>
      )}

      {result && (
        <div
          className="p-4 rounded border-2"
          style={{ borderColor: result.passed ? "#58cc02" : "#e31b23" }}
        >
          <p className="font-semibold mb-2">Rezultat: {result.score} / 5</p>
          {result.passed ? (
            <div>
              <p className="text-green-700 mb-3">
                Čestitamo! Sljedeće poglavlje je otključano.
              </p>
              <Link href="/handbook" className="btn-primary inline-block">
                Nazad na priručnik
              </Link>
            </div>
          ) : (
            <div>
              <p className="text-red-700 mb-3">
                Potrebno je 5/5 tačnih odgovora za otključavanje sljedećeg poglavlja.
              </p>
              <button onClick={loadQuestions} className="btn-primary">
                Pokušaj ponovo
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
