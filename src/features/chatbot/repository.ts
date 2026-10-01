/**
 * Chatbot Repository
 * All database access for the IDSS Asistent chatbot.
 * Never call these from Client Components — only from Server Components,
 * Server Actions, pipeline.ts, and API routes. Uses createSupabaseDirectAdmin()
 * throughout (service role, no RLS/cookies) — callers resolve "who is the
 * current user" themselves and pass the resulting public.users.id in explicitly,
 * same convention as features/handbook/repository.ts and features/quiz/repository.ts.
 *
 * Conversation model: one ever-growing conversation per user (chatbot_conversations
 * has no title/status column — schema reads as a permanent per-user log, matching
 * CONSTITUTION.md P-7 "All conversations stored permanently"). getOrCreateConversation()
 * reuses the user's existing conversation row if one exists; there is no "start a
 * new conversation" concept in this MVP.
 */

import { createSupabaseDirectAdmin } from "@/lib/db/supabase";

export type ChatTurn = {
  id: string;
  userMessage: string;
  response: string;
  confidence: "HIGH" | "LOW";
  createdAt: string;
  sources: ChapterSource[];
};

/**
 * Finds the user's existing conversation, or creates one. One row per user —
 * see module doc comment for why there's no multi-conversation concept yet.
 */
export async function getOrCreateConversation(userId: string): Promise<string> {
  const supabase = createSupabaseDirectAdmin();

  const { data: existing, error: findError } = await supabase
    .from("chatbot_conversations")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (findError) throw new Error(`getOrCreateConversation (find) failed: ${findError.message}`);
  if (existing) return existing.id;

  const { data: created, error: insertError } = await supabase
    .from("chatbot_conversations")
    .insert({ user_id: userId })
    .select("id")
    .single();
  if (insertError) throw new Error(`getOrCreateConversation (insert) failed: ${insertError.message}`);
  return created.id;
}

/**
 * Full turn history for a conversation, oldest first — used to render the
 * chat page's initial state server-side. Sources are re-resolved from the
 * stored chunk_ids for each HIGH-confidence turn (not stored redundantly at
 * insert time) so a reload shows the same citations a live answer would.
 * LOW-confidence turns skip resolution — ChatMessage never renders a
 * citation for a refusal anyway, and it saves a query per refused turn.
 */
export async function getConversationTurns(conversationId: string): Promise<ChatTurn[]> {
  const supabase = createSupabaseDirectAdmin();
  const { data, error } = await supabase
    .from("chatbot_turns")
    .select("id, user_message, response, confidence, chunk_ids, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`getConversationTurns failed: ${error.message}`);

  const turns: ChatTurn[] = [];
  for (const row of data ?? []) {
    const confidence = row.confidence as "HIGH" | "LOW";
    const sources = confidence === "HIGH" ? await getSourcesForChunkIds(row.chunk_ids ?? []) : [];
    turns.push({
      id: row.id,
      userMessage: row.user_message,
      response: row.response,
      confidence,
      createdAt: row.created_at,
      sources,
    });
  }
  return turns;
}

export type InsertTurnInput = {
  conversationId: string;
  userMessage: string;
  response: string;
  confidence: "HIGH" | "LOW";
  chunkIds: string[];
  similarityScores: number[];
  keyIndexUsed: number | null;
  tokensUsed: number | null;
};

/**
 * Stores one turn (P-7: "All conversations stored permanently") and bumps
 * the parent conversation's updated_at so it always reflects the last activity.
 */
export async function insertTurn(input: InsertTurnInput): Promise<string> {
  const supabase = createSupabaseDirectAdmin();

  const { data, error } = await supabase
    .from("chatbot_turns")
    .insert({
      conversation_id: input.conversationId,
      user_message: input.userMessage,
      response: input.response,
      confidence: input.confidence,
      chunk_ids: input.chunkIds,
      similarity_scores: input.similarityScores,
      key_index_used: input.keyIndexUsed,
      tokens_used: input.tokensUsed,
    })
    .select("id")
    .single();
  if (error) throw new Error(`insertTurn failed: ${error.message}`);

  const { error: touchError } = await supabase
    .from("chatbot_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", input.conversationId);
  if (touchError) {
    // Non-fatal — the turn is already durably stored, which is the part P-7
    // actually requires. A stale conversation.updated_at is cosmetic.
    console.error(`[ChatbotRepository] insertTurn: touching conversation updated_at failed: ${touchError.message}`);
  }

  return data.id;
}

export type ChapterSource = { id: string; title: string };

/**
 * Maps document_id -> published handbook_chapters row, for citing sources
 * under a chatbot answer. Only published chapters are returned — a chunk
 * belonging to a document without a published chapter yields no entry for
 * that document_id, and the caller falls back to a generic citation (see
 * pipeline.ts) rather than silently dropping the source.
 */
export async function getChapterSourcesForDocumentIds(
  documentIds: string[],
): Promise<Map<string, ChapterSource>> {
  const map = new Map<string, ChapterSource>();
  if (documentIds.length === 0) return map;

  const supabase = createSupabaseDirectAdmin();
  const { data, error } = await supabase
    .from("handbook_chapters")
    .select("id, title, document_id")
    .in("document_id", documentIds)
    .eq("is_published", true);
  if (error) throw new Error(`getChapterSourcesForDocumentIds failed: ${error.message}`);

  for (const row of data ?? []) {
    map.set(row.document_id, { id: row.id, title: row.title });
  }
  return map;
}

const GENERIC_SOURCE: ChapterSource = { id: "", title: "Interni dokumenti škole" };

/**
 * documentIds -> distinct, ordered ChapterSource[] for citation display.
 * Shared by pipeline.ts (live answer, already has documentIds from the
 * retrieval result) and getSourcesForChunkIds() below (historical turns,
 * which only have chunk_ids stored). A document without a published
 * chapter still needs to surface as *something* — falls back to one
 * generic entry rather than silently dropping the source.
 */
export async function resolveChapterSources(documentIds: string[]): Promise<ChapterSource[]> {
  if (documentIds.length === 0) return [];

  const chapterMap = await getChapterSourcesForDocumentIds(documentIds);
  const sources: ChapterSource[] = [];
  const seen = new Set<string>();
  let hasUnresolved = false;

  for (const documentId of documentIds) {
    const chapter = chapterMap.get(documentId);
    if (chapter) {
      if (!seen.has(chapter.id)) {
        seen.add(chapter.id);
        sources.push(chapter);
      }
    } else {
      hasUnresolved = true;
    }
  }

  if (hasUnresolved) sources.push(GENERIC_SOURCE);
  return sources;
}

/** chunk_ids (as stored on a chatbot_turns row) -> ChapterSource[], for re-hydrating history. */
export async function getSourcesForChunkIds(chunkIds: string[]): Promise<ChapterSource[]> {
  if (chunkIds.length === 0) return [];

  const supabase = createSupabaseDirectAdmin();
  const { data, error } = await supabase
    .from("document_chunks")
    .select("document_id")
    .in("id", chunkIds);
  if (error) throw new Error(`getSourcesForChunkIds failed: ${error.message}`);

  const documentIds = Array.from(new Set((data ?? []).map((r) => r.document_id)));
  return resolveChapterSources(documentIds);
}
