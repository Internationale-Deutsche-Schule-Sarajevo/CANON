// src/app/(dashboard)/admin/documents/status/page.tsx
import { PipelineStatusView } from "@/components/admin/PipelineStatusView";

export default function AdminDocumentsStatusPage() {
  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <h1 className="text-3xl font-bold text-idss-dark-blue mb-2">Stanje obrade dokumenata</h1>
      <p className="text-gray-600 mb-6">
        Pregled bez mogućnosti pokretanja obrade — poglavlja, kviz i sažeci se generišu automatski nakon što Super
        Admin odobri dokument. Za pokretanje obrade van reda kontaktirajte Super Admina.
      </p>
      <PipelineStatusView showRunButton={false} />
    </div>
  );
}
