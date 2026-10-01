/**
 * POST /api/chatbot/message
 * Role required: any logged-in user
 * Runs the full O-8 chatbot pipeline (see features/chatbot/pipeline.ts) for
 * one user message and returns the stored turn. Non-streaming — see chat
 * plan discussion: AIProvider.generate() has no streaming path anywhere in
 * this codebase, and max_tokens 1024 keeps the wait short regardless.
 */

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/db/supabase";
import { getUserByEmailDirect } from "@/features/authentication/repository";
import { ChatMessageSchema } from "@/features/chatbot/schemas/message.schema";
import { sendChatMessage, ChatbotRateLimitError } from "@/features/chatbot/pipeline";

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.json(
      { success: false, error: "Niste prijavljeni." },
      { status: 401 },
    );
  }

  const dbUser = await getUserByEmailDirect(user.email);
  if (!dbUser) {
    return NextResponse.json(
      { success: false, error: "Niste prijavljeni." },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Neispravan zahtjev." },
      { status: 400 },
    );
  }

  const parsed = ChatMessageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Neispravna poruka." },
      { status: 400 },
    );
  }

  try {
    const result = await sendChatMessage(dbUser.id, parsed.data.message);
    return NextResponse.json({
      success: true,
      turnId: result.turnId,
      response: result.response,
      confidence: result.confidence,
      sources: result.sources.map((s) => ({
        chapterId: s.id || null,
        title: s.title,
      })),
    });
  } catch (error) {
    if (error instanceof ChatbotRateLimitError) {
      return NextResponse.json(
        {
          success: false,
          error: "Dostigli ste ograničenje od 20 poruka po satu. Pokušajte kasnije.",
          resetAtMs: error.resetAtMs,
        },
        { status: 429 },
      );
    }

    const message = error instanceof Error ? error.message : "Server error";
    console.error("[API /chatbot/message] Fatal:", message);
    return NextResponse.json(
      { success: false, error: "Greška na serveru. Pokušajte ponovo." },
      { status: 500 },
    );
  }
}
