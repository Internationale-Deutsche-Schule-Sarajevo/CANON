// src/app/(dashboard)/super-admin/pipeline/page.tsx
import { PipelineStatusView } from "@/components/admin/PipelineStatusView";

export default function SuperAdminPipelinePage() {
  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <h1 className="text-3xl font-bold text-idss-dark-blue mb-2">Stanje obrade dokumenata</h1>
      <p className="text-gray-600 mb-6">
        Embedding, generisanje poglavlja, kviza i sažetka se pokreću automatski nakon odobrenja dokumenta (pojedinačno
        ili &quot;Odobri sve&quot; iz pregleda na čekanju) i nastavljaju se sami u pozadini. Dugme ispod je fallback
        za ručno guranje reda naprijed bez čekanja na sljedeći automatski pokušaj.
      </p>
      <PipelineStatusView showRunButton={true} />
    </div>
  );
}
