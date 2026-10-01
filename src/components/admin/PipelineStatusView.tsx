// src/components/admin/PipelineStatusView.tsx
"use client";

import { useEffect, useState } from "react";

type StepKey = "embedding" | "chapter" | "quiz" | "summary";

const STEP_LABELS: Record<StepKey, string> = {
  embedding: "Embedding",
  chapter: "Poglavlje",
  quiz: "Kviz",
  summary: "Sažetak",
};

type StatusSummary = {
  lastProcessedAt: string | null;
  currentlyRunning: boolean;
  steps: Record<StepKey, { done: number; queued: number; needsReview: number }>;
  needsReview: {
    documentId: string;
    documentName: string;
    step: StepKey;
    reason: string;
    attempts: number;
  }[];
};

/**
 * Shared status view for both dashboards described in the approved plan
 * (misty-hugging-galaxy.md, tacka 4): admin (read-only, showRunButton=false)
 * and super-admin (full, showRunButton=true). Both read the same
 * GET /api/admin/pipeline/status -- the only difference is whether the
 * "Pokreni obradu sada" button is rendered (server still enforces the role
 * check on POST /api/admin/pipeline/run-now regardless of what the UI shows).
 */
export function PipelineStatusView({
  showRunButton,
}: {
  showRunButton: boolean;
}) {
  const [summary, setSummary] = useState<StatusSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  async function fetchStatus() {
    try {
      const res = await fetch("/api/admin/pipeline/status", {
        credentials: "include",
      });
      const data = await res.json();
      if (!data.success)
        throw new Error(data.error ?? "Greška pri učitavanju statusa.");
      setSummary(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 15000);
    return () => clearInterval(interval);
  }, []);

  async function handleRunNow() {
    setRunning(true);
    try {
      const res = await fetch("/api/admin/pipeline/run-now", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!data.success)
        throw new Error(data.error ?? "Pokretanje nije uspjelo.");
      await fetchStatus();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  if (error) {
    return (
      <div className="p-4 text-red-600 bg-red-50 rounded border border-red-200">
        {error}
      </div>
    );
  }

  if (!summary) {
    return <div className="p-4 text-gray-500">Učitavanje stanja obrade...</div>;
  }

  const steps = Object.entries(summary.steps) as [
    StepKey,
    StatusSummary["steps"][StepKey],
  ][];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-600">
        <span>
          Posljednja obrada:{" "}
          {summary.lastProcessedAt
            ? new Date(summary.lastProcessedAt).toLocaleString("bs-BA")
            : "još nikad"}
        </span>
        <span>
          Trenutno u toku:{" "}
          <strong>{summary.currentlyRunning ? "da" : "ne"}</strong>
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border border-gray-200 rounded overflow-hidden">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-2"></th>
              <th className="text-right p-2">Gotovo</th>
              <th className="text-right p-2">Čeka na red</th>
              <th className="text-right p-2 text-amber-700">⚠ Na provjeri</th>
            </tr>
          </thead>
          <tbody>
            {steps.map(([key, counts]) => (
              <tr key={key} className="border-t border-gray-100">
                <td className="p-2 font-medium text-idss-dark-blue">
                  {STEP_LABELS[key]}
                </td>
                <td className="p-2 text-right">{counts.done}</td>
                <td className="p-2 text-right">{counts.queued}</td>
                <td className="p-2 text-right">
                  {counts.needsReview > 0 ? (
                    <span className="text-amber-700 font-semibold">
                      {counts.needsReview}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showRunButton && (
        <div className="flex justify-end">
          <button
            onClick={handleRunNow}
            disabled={running}
            className="bg-idss-dark-blue text-white px-4 py-2 rounded hover:opacity-90 disabled:opacity-50 transition text-sm"
          >
            {running ? "Pokretanje..." : "Pokreni obradu sada"}
          </button>
        </div>
      )}

      {summary.needsReview.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded space-y-3">
          <h4 className="font-semibold text-amber-800">
            ⚠ Na provjeri ({summary.needsReview.length}) — zahtijeva ljudski
            pregled, obrada je zaustavljena za ove stavke da se ne troši kvota
            uzalud:
          </h4>
          <ul className="space-y-2 text-sm">
            {summary.needsReview.map((item, i) => (
              <li
                key={`${item.documentId}-${item.step}-${i}`}
                className="border-t border-amber-200 pt-2 first:border-t-0 first:pt-0"
              >
                <div className="font-medium">
                  {item.documentName} — {STEP_LABELS[item.step]}
                </div>
                <div className="text-gray-600">
                  {item.step === "embedding"
                    ? "Ručno – pokreni postojećom skriptom"
                    : `Razlog: ${item.reason} (pokušano ${item.attempts}× )`}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
