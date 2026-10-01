// src/app/(dashboard)/admin/documents/upload/page.tsx
import Link from "next/link";
import { DocumentUploadWidget } from "@/components/admin/DocumentUploadWidget";

export default function AdminDocumentUploadPage() {
  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="flex items-start justify-between gap-4 mb-6">
        <h1 className="text-3xl font-bold text-idss-dark-blue">
          Upload dokumenta
        </h1>
        <Link href="/admin/documents/status" className="text-sm text-idss-dark-blue underline whitespace-nowrap mt-2">
          Stanje obrade →
        </Link>
      </div>
      <p className="text-gray-600 mb-6">
        Uploadujte novi ili ažurirani dokument. Dokument se sprema u status &quot;staging&quot;
        i čeka odobrenje Super Admina prije nego postane vidljiv u aplikaciji.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <DocumentUploadWidget />
        <div className="p-4 bg-gray-50 rounded border border-gray-200">
          <h4 className="font-semibold text-idss-dark-blue">Kako radi obrada</h4>
          <ul className="list-disc list-inside text-sm text-gray-600 mt-2 space-y-1">
            <li>Provjera formata i veličine fajla</li>
            <li>Izdvajanje teksta i konverzija u Markdown</li>
            <li>Poređenje sa trenutnom aktivnom verzijom (ako postoji)</li>
            <li>Dijeljenje sadržaja na dijelove (chunkove) za pretragu</li>
            <li>Super Admin pregleda i odobrava ili odbija dokument</li>
            <li>Nakon odobrenja: embedding, poglavlje, kviz i sažetak se generišu automatski (pratite napredak na &quot;Stanje obrade&quot;)</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
