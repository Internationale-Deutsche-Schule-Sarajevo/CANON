// src/features/chatbot/components/ChatMessage.tsx
export type ChatMessageProps = {
  userMessage: string;
  response: string;
  confidence: "HIGH" | "LOW";
  sources?: { chapterId: string | null; title: string }[];
};

/**
 * Renders one turn: the user's question, then the assistant's answer.
 * LOW confidence (refusal) renders identically to a normal answer — no
 * "confidence" badge shown to the end user, the refusal text speaks for
 * itself — except it never carries a source citation (nothing was retrieved
 * with enough confidence to ground it in).
 */
export function ChatMessage({ userMessage, response, confidence, sources }: ChatMessageProps) {
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <div
          className="max-w-[80%] rounded-lg px-4 py-2 text-white"
          style={{ background: "var(--idss-dark-blue)", borderRadius: "var(--radius)" }}
        >
          {userMessage}
        </div>
      </div>

      <div className="flex justify-start">
        <div className="max-w-[80%] card">
          <p className="text-gray-800 whitespace-pre-wrap">{response}</p>
          {confidence === "HIGH" && sources && sources.length > 0 && (
            <p className="text-xs text-gray-500 mt-2">
              Izvor: {sources.map((s) => s.title).join(", ")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
