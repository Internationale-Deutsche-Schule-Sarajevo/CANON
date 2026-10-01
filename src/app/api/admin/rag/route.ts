/**
 * POST /api/admin/rag
 * Role required: super_admin
 * Triggers RAG indexing pipeline for all active documents
 *
 * TEMPORARILY DISABLED (2026-08-16, director-approved — see chat, "Sprint 16
 * embedding space check"). indexAllDocuments() -> rag-pipeline.ts still calls
 * the old Gemini embedTexts() (3072-dim), while every other embedding path
 * (retriever.ts query side, review-pipeline.ts on-approval side) has been on
 * the local 768-dim model since the Aug-5 Sprint 16 fix (commit 1eafdf9).
 * Running this today would: (1) attempt to insert 3072-dim vectors into the
 * vector(768) document_chunks.embedding column, and (2) does a delete-then-
 * insert per document with content re-read from disk via
 * documents.metadata.relative_path — confirmed, for at least the 4
 * legacy-USTAV documents just OCR-fixed this session (Agenda, Rjesenje
 * Maturalna Komisija, both Pravila učionice), that path still points at
 * stale ASSETS/*.md stub files ("this is a binary file"), not the corrected
 * document_chunks content. Since the delete runs before the insert is
 * attempted, a dimension-mismatch failure would leave the document with
 * zero chunks — not stale content, no content. Re-enable only after
 * rag-pipeline.ts is migrated to embedTextsLocal() + in-place chunk updates
 * (matching review-pipeline.ts's pattern) and its content source is verified
 * against document_chunks, not repo/ASSETS/*.md stubs.
 */

import { createSupabaseServerClient } from "@/lib/db/supabase";
import { getUserByEmailDirect } from "@/features/authentication/repository";
import { isSuperAdmin } from "@/lib/permissions";
import { NextResponse } from "next/server";

export async function POST() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Niste prijavljeni." },
        { status: 401 },
      );
    }

    const dbUser = await getUserByEmailDirect(user.email!);
    if (!dbUser || !isSuperAdmin(dbUser.role)) {
      return NextResponse.json(
        { success: false, error: "Samo Super Admin." },
        { status: 403 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error:
          "RAG indexiranje je privremeno onemogućeno: koristi pogrešan embedding model " +
          "(3072-dim umjesto 768-dim) i briše postojeće chunkove prije upisa novih, čitajući " +
          "sadržaj sa diska koji je za dio legacy dokumenata zastario. Popravka je u toku " +
          "(Sprint 16 embedding-space unifikacija). Kontaktirajte Super Admina za detalje.",
      },
      { status: 409 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    console.error("[RAG API] Fatal:", message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
