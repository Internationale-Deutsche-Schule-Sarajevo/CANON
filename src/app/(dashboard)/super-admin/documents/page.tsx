// src/app/(dashboard)/super-admin/documents/page.tsx
import Link from "next/link";
import { DocumentReviewPanel } from "@/components/admin/DocumentReviewPanel";

export default function SuperAdminDocumentsPage() {
  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="flex items-start justify-between gap-4 mb-6">
        <h1 className="text-3xl font-bold text-idss-dark-blue">
          Pregled dokumenata na čekanju
        </h1>
        <Link href="/super-admin/pipeline" className="text-sm text-idss-dark-blue underline whitespace-nowrap mt-2">
          Stanje obrade →
        </Link>
      </div>
      <p className="text-gray-600 mb-6">
        Dokumenti koje su uploadovali Admini čekaju ovdje na odobrenje. Nijedan dokument ne
        može postati aktivan bez eksplicitnog odobrenja Super Admina. Nakon odobrenja, poglavlje/kviz/sažetak se
        generišu automatski — status prati stranica &quot;Stanje obrade&quot;.
      </p>
      <DocumentReviewPanel />
    </div>
  );
}
