// src/app/(dashboard)/chatbot/page.tsx
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/db/supabase";
import { getUserByEmailDirect } from "@/features/authentication/repository";
import { getOrCreateConversation, getConversationTurns } from "@/features/chatbot/repository";
import { ChatInterface } from "@/features/chatbot/components/ChatInterface";

export default async function ChatbotPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect("/login");

  const dbUser = await getUserByEmailDirect(user.email);
  if (!dbUser) redirect("/login");

  const conversationId = await getOrCreateConversation(dbUser.id);
  const turns = await getConversationTurns(conversationId);

  return (
    <div className="container mx-auto p-6 max-w-3xl">
      <h1 className="text-3xl font-bold text-idss-dark-blue mb-2">IDSS Asistent</h1>
      <p className="text-gray-600 mb-6">
        Institucionalni asistent za nastavnike — odgovara isključivo na osnovu
        zvaničnih dokumenata škole.
      </p>
      <ChatInterface
        initialTurns={turns.map((t) => ({
          id: t.id,
          userMessage: t.userMessage,
          response: t.response,
          confidence: t.confidence,
          sources: t.sources.map((s) => ({ chapterId: s.id || null, title: s.title })),
        }))}
      />
    </div>
  );
}
