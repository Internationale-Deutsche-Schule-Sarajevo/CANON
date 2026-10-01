/**
 * GeminiProvider
 * Implements AIProvider interface using Google Gemini API.
 * Generation model:  gemini-2.5-flash (exact string — do not change)
 * Embedding model:   gemini-embedding-001 (exact string — do not change)
 * All API calls go through GeminiKeyManager for key rotation.
 */

import type {
  AIProvider,
  EmbedTaskType,
  GenerateOptions,
  GenerateResult,
  EmbedResult,
  TranscribeImageResult,
} from "../ai-provider.interface";
import { getKeyManager } from "./gemini-key-manager";

const GENERATION_MODEL = "gemini-2.5-flash";
const EMBEDDING_MODEL = "gemini-embedding-001";
const GENERATION_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const EMBEDDING_BASE_URL = "https://generativelanguage.googleapis.com/v1";

// OCR transcription is deterministic-leaning (low temperature) and pages can
// contain a lot of text, so it gets the same 8192 headroom as chapter
// generation rather than a smaller cap.
const OCR_MAX_OUTPUT_TOKENS = 8192;
const OCR_TEMPERATURE = 0.3;

export class GeminiProvider implements AIProvider {
  /**
   * Generate text using gemini-2.5-flash.
   * Uses round-robin key rotation via GeminiKeyManager.
   * Rotates key on HTTP 429. Throws immediately on other errors.
   */
  async generate(
    prompt: string,
    systemPrompt: string,
    options: GenerateOptions,
  ): Promise<GenerateResult> {
    const manager = getKeyManager();

    // Retry loop for 429 handling
    for (let attempt = 0; attempt < 8; attempt++) {
      const { key, index } = await manager.getKey();

      const url = `${GENERATION_BASE_URL}/models/${GENERATION_MODEL}:generateContent?key=${key}`;
      const body = {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: options.maxTokens,
          temperature: options.temperature,
        },
      };

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (response.status === 429) {
          manager.markThrottled(index);
          manager.logCall(index, 429, "generation", "throttled");
          continue; // retry with next key
        }

        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          manager.logCall(index, response.status, "generation", "error");
          throw new Error(
            `Gemini generation failed: HTTP ${response.status} — ${JSON.stringify(error)}`,
          );
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        const tokensUsed = data.usageMetadata?.totalTokenCount ?? 0;
        const finishReason: string | undefined = data.candidates?.[0]?.finishReason;

        manager.logCall(index, 200, "generation", "success");

        return {
          text,
          tokensUsed,
          keyIndexUsed: index,
          modelString: GENERATION_MODEL,
          finishReason,
        };
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("Gemini generation failed")
        ) {
          throw error; // non-retryable error
        }
        throw error;
      }
    }

    throw new Error(
      "Gemini generation failed: all 8 keys exhausted after retries.",
    );
  }

  /**
   * Transcribe an image's text content using the same gemini-2.5-flash
   * multimodal model — no separate OCR API/dependency.
   */
  async transcribeImage(
    imageBase64: string,
    mimeType: string,
    prompt: string,
  ): Promise<TranscribeImageResult> {
    const manager = getKeyManager();

    for (let attempt = 0; attempt < 8; attempt++) {
      const { key, index } = await manager.getKey();

      const url = `${GENERATION_BASE_URL}/models/${GENERATION_MODEL}:generateContent?key=${key}`;
      const body = {
        contents: [
          {
            role: "user",
            parts: [
              { inline_data: { mime_type: mimeType, data: imageBase64 } },
              { text: prompt },
            ],
          },
        ],
        generationConfig: {
          maxOutputTokens: OCR_MAX_OUTPUT_TOKENS,
          temperature: OCR_TEMPERATURE,
        },
      };

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (response.status === 429) {
          manager.markThrottled(index);
          manager.logCall(index, 429, "generation", "throttled");
          continue; // retry with next key
        }

        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          manager.logCall(index, response.status, "generation", "error");
          throw new Error(
            `Gemini transcription failed: HTTP ${response.status} — ${JSON.stringify(error)}`,
          );
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        const tokensUsed = data.usageMetadata?.totalTokenCount ?? 0;
        const finishReason: string | undefined = data.candidates?.[0]?.finishReason;

        manager.logCall(index, 200, "generation", "success");

        return {
          text,
          tokensUsed,
          keyIndexUsed: index,
          modelString: GENERATION_MODEL,
          finishReason,
        };
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("Gemini transcription failed")
        ) {
          throw error; // non-retryable error
        }
        throw error;
      }
    }

    throw new Error(
      "Gemini transcription failed: all 8 keys exhausted after retries.",
    );
  }

  /**
   * Generate embeddings using gemini-embedding-001.
   * Dimension: 3072 (fixed — never change).
   * Batch size: max 100 texts per call.
   */
  async embed(texts: string[], taskType: EmbedTaskType): Promise<EmbedResult> {
    if (texts.length === 0) {
      return { vectors: [], dimension: 3072 };
    }

    if (texts.length > 100) {
      throw new Error("Embedding batch size exceeded: max 100 texts per call.");
    }

    const manager = getKeyManager();

    for (let attempt = 0; attempt < 8; attempt++) {
      const { key, index } = await manager.getKey();

      const url = `${EMBEDDING_BASE_URL}/models/${EMBEDDING_MODEL}:batchEmbedContents?key=${key}`;
      const body = {
        requests: texts.map((text) => ({
          model: `models/${EMBEDDING_MODEL}`,
          content: { parts: [{ text }] },
          taskType,
        })),
      };

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (response.status === 429) {
          manager.markThrottled(index);
          manager.logCall(index, 429, "embedding", "throttled");
          continue;
        }

        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          manager.logCall(index, response.status, "embedding", "error");
          throw new Error(
            `Gemini embedding failed: HTTP ${response.status} — ${JSON.stringify(error)}`,
          );
        }

        const data = await response.json();
        const vectors: number[][] = (data.embeddings ?? []).map(
          (e: { values: number[] }) => e.values,
        );

        manager.logCall(index, 200, "embedding", "success");

        return { vectors, dimension: 3072 };
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("Gemini embedding failed")
        ) {
          throw error;
        }
        throw error;
      }
    }

    throw new Error(
      "Gemini embedding failed: all 8 keys exhausted after retries.",
    );
  }
}
