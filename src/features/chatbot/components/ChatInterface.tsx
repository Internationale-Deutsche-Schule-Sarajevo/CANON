"use client";

import { useState } from "react";
import { ChatMessage } from "./ChatMessage";

type Turn = {
  id: string;
  userMessage: string;
  response: string;
  confidence: "HIGH" | "LOW";
  sources?: { chapterId: string | null; title: string }[];
};

type ChatInterfaceProps = {
  initialTurns: Turn[];
};

export function ChatInterface({ initialTurns }: ChatInterfaceProps) {
  const [turns, setTurns] = useState<Turn[]>(initialTurns);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    const message = input.trim();
    if (!message || sending) return;

    setSending(true);
    setError(null);
    setInput("");

    try {
      const response = await fetch("/api/chatbot/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.error ?? "Greška na serveru. Pokušajte ponovo.");
        setInput(message); // don't lose what the user typed
        return;
      }

      setTurns((prev) => [
        ...prev,
        {
          id: data.turnId,
          userMessage: message,
          response: data.response,
          confidence: data.confidence,
          sources: data.sources,
        },
      ]);
    } catch {
      setError("Greška u vezi sa serverom. Provjerite internet konekciju.");
      setInput(message);
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 min-h-[300px]">
        {turns.length === 0 && (
          <p className="text-gray-600">
            Postavite pitanje o internim dokumentima škole. IDSS Asistent odgovara
            isključivo na osnovu zvaničnih dokumenata.
          </p>
        )}
        {turns.map((turn) => (
          <ChatMessage
            key={turn.id}
            userMessage={turn.userMessage}
            response={turn.response}
            confidence={turn.confidence}
            sources={turn.sources}
          />
        ))}
        {sending && <p className="text-gray-500 text-sm">IDSS Asistent razmišlja...</p>}
      </div>

      {error && (
        <p className="text-sm" style={{ color: "var(--game-fail-red)" }}>
          {error}
        </p>
      )}

      <div className="sticky bottom-0 bg-white border-t border-gray-200 pt-4 flex gap-2 items-end">
        <textarea
          className="flex-1 border border-gray-300 rounded p-2 resize-none"
          style={{ borderRadius: "var(--radius)" }}
          rows={2}
          maxLength={2000}
          placeholder="Postavite pitanje..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={sending}
        />
        <button
          className="btn-primary"
          onClick={handleSend}
          disabled={sending || input.trim().length === 0}
        >
          {sending ? "Šalje se..." : "Pošalji"}
        </button>
      </div>
    </div>
  );
}
