/**
 * AI Provider Interface
 * All AI operations go through this interface — never call provider SDKs directly.
 * Swapping providers (Gemini → Claude → OpenAI) requires only a new implementation class.
 */

export type EmbedTaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

export type GenerateOptions = {
  // 4096 added in Sprint 12 for quiz question generation (15 questions/chapter);
  // existing 512/2048/8192 callers (chapter generation) unaffected.
  // 65536 added for the chapter-truncation fix: 8192 was a self-imposed cap,
  // not an API limit — the real ceiling for gemini-2.5-flash is 65536, and
  // thinking tokens share that same output budget, so 8192 truncated any
  // document whose reasoning + prose exceeded it.
  // 1024 added for the chatbot (Sprint 16 P-7 system prompt spec: max_tokens
  // 1024) — short, grounded answers only, not full chapter-length prose.
  maxTokens: 512 | 1024 | 2048 | 4096 | 8192 | 65536;
  // 0.5 added in Sprint 12 for quiz question generation; existing 0.3/0.7
  // callers unaffected.
  temperature: 0.3 | 0.5 | 0.7;
  language?: "bs" | "de" | "en";
};

export type GenerateResult = {
  text: string;
  tokensUsed: number;
  keyIndexUsed: number;
  modelString: string;
  // Gemini's candidates[0].finishReason ("STOP", "MAX_TOKENS", ...) when the
  // provider response exposes it; undefined otherwise. Callers that need to
  // detect truncation (e.g. the chapter-regeneration script) should treat a
  // missing value as "unknown", not as STOP.
  finishReason?: string;
};

export type EmbedResult = {
  vectors: number[][];
  dimension: 3072;
};

export type TranscribeImageResult = {
  text: string;
  tokensUsed: number;
  keyIndexUsed: number;
  modelString: string;
  finishReason?: string;
};

export interface AIProvider {
  generate(
    prompt: string,
    systemPrompt: string,
    options: GenerateOptions,
  ): Promise<GenerateResult>;

  embed(texts: string[], taskType: EmbedTaskType): Promise<EmbedResult>;

  /**
   * Transcribe the text content of a single image using the provider's
   * multimodal generation model (OCR via the same model used for generation —
   * no separate OCR API). imageBase64 is raw base64 (no data: URL prefix).
   */
  transcribeImage(imageBase64: string, mimeType: string, prompt: string): Promise<TranscribeImageResult>;
}
