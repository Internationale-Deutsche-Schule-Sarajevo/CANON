/**
 * Local Embedder — Sprint 16 (embedding-space unification)
 *
 * Runs `Xenova/paraphrase-multilingual-mpnet-base-v2` in-process via
 * transformers.js (`@huggingface/transformers`), quantized (`dtype: "q8"`).
 * This is the ONLY embedding path for both query-side retrieval
 * (`lib/rag/retriever.ts`) and on-approval document indexing
 * (`features/documents/review-pipeline.ts`) — see DECISION_LOG.md DL-P-006
 * for why, and why this replaces `lib/rag/embedder.ts` (Gemini) for those
 * two call sites specifically.
 *
 * Model identity was NOT assumed — it was verified empirically against the
 * live DB. `document_chunks.embedding` already held 5,720 vector(768) rows
 * from an untracked one-off bulk-import script (no model name recorded
 * anywhere in the repo or DB). Re-embedding the full 5,739-chunk corpus to
 * make it match a *guessed* model would have been exactly the kind of
 * mass-regeneration the ACA work order forbids, and guessing wrong would
 * have silently corrupted retrieval. Instead: pulled a stored chunk +
 * vector, re-embedded the identical text locally with `all-mpnet-base-v2`,
 * `paraphrase-multilingual-mpnet-base-v2`, `multilingual-e5-base`, and
 * `LaBSE` (all 768-dim), and diffed cosine similarity against the stored
 * vector. `paraphrase-multilingual-mpnet-base-v2` @ fp32 came back at
 * cosine 0.9999999999996 (bit-identical) on a short chunk and 0.96+ on a
 * longer one (tokenizer-truncation-length noise, not a different model);
 * every other candidate came back under 0.17. That is the source model.
 * Conclusion: reuse the existing 5,720 vectors as-is, do NOT re-embed the
 * corpus — only backfill the 19 NULL-embedding chunks and embed new
 * documents on approval, all through this module.
 *
 * dtype is "q8" (~278MB), not fp32 (~1.1GB): verified cosine 0.99+ vs the
 * fp32 vectors on the same text (quantization noise, same semantic space —
 * query and stored vectors are always compared to each other, never to a
 * fp32 reference, so this does not reintroduce a space mismatch). Chosen
 * over fp32 for cold-start download size and Vercel Functions' ephemeral
 * /tmp footprint, which matters more than the last 0.01 of cosine fidelity
 * for top-5 nearest-neighbour ranking.
 */

// Import through the package root, but resolve that root to the web/WASM build
// via the Turbopack alias in next.config.ts. The package exports map only
// exposes the package root; using the Node entry would eagerly load
// `onnxruntime-node` and trigger the Vercel serverless native-binary failure.
import {
  env,
  pipeline,
  type FeatureExtractionPipeline,
} from "@huggingface/transformers";

const MODEL_ID = "Xenova/paraphrase-multilingual-mpnet-base-v2";
const MODEL_DTYPE = "q8" as const;
export const LOCAL_EMBEDDING_DIMENSION = 768;

// Force the WASM ONNX backend instead of the native onnxruntime-node binding,
// which fails on Vercel serverless because it expects libonnxruntime.so.1 to
// be present in the container. Using the public CDN-wasm assets keeps the
// model portable in serverless environments without requiring native binaries.
if (!env.backends.onnx?.wasm) {
  env.backends.onnx = { ...env.backends.onnx, wasm: {} };
}
env.backends.onnx.wasm!.wasmPaths =
  "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0/dist/";

env.useWasmCache = true;

// Cached across warm Fluid Compute invocations — loading the model is the
// expensive part (~278MB download + ONNX session init on first call in a
// given server instance), not the per-text inference after that.
let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

async function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!extractorPromise) {
    extractorPromise = Promise.resolve(
      pipeline("feature-extraction", MODEL_ID, {
        dtype: MODEL_DTYPE,
        device: "wasm",
      }),
    );
  }
  return extractorPromise;
}

/**
 * Embed an array of texts locally, one at a time (transformers.js does not
 * batch feature-extraction the way the Gemini API batches — sequential
 * calls are the supported usage). Mean-pooled, L2-normalized, 768-dim.
 * Empty input returns an empty array without loading the model.
 */
export async function embedTextsLocal(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const extractor = await getExtractor();
  const vectors: number[][] = [];

  for (const text of texts) {
    const output = await extractor(text, { pooling: "mean", normalize: true });
    vectors.push(Array.from(output.data as Float32Array));
  }

  return vectors;
}
