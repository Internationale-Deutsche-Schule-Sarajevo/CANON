// src/components/admin/DocumentReviewPanel.tsx
"use client";

import { useEffect, useState } from "react";

type DiffSummary = {
  hasExistingDocument: boolean;
  contentAvailable?: boolean;
  isIdentical?: boolean;
  oldLineCount?: number;
  newLineCount?: number;
  firstDifferentLine?: number | null;
  hashChanged?: boolean;
};

type StagingDocument = {
  id: string;
  original_name: string;
  mime_type: string | null;
  file_size_bytes: number | null;
  content_hash: string | null;
  created_at: string;
  uploaded_by: string | null;
  uploader: { full_name: string; email: string } | null;
  metadata: {
    ocr_used?: boolean;
    manual_review_needed?: boolean;
    extraction_error?: string | null;
    diff_summary?: DiffSummary;
  } | null;
};

function formatBytes(bytes: number | null): string {
  if (!bytes) return "?";
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function DiffBadge({ diff }: { diff?: DiffSummary }) {
  if (!diff || !diff.hasExistingDocument) {
    return <span className="text-xs text-blue-700 bg-blue-50 px-2 py-1 rounded">Nov dokument</span>;
  }
  if (!diff.contentAvailable) {
    return (
      <span className="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded">
        Postoji aktivna verzija, prethodni sadržaj nedostupan za poređenje
      </span>
    );
  }
  if (diff.isIdentical) {
    return <span className="text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded">Bez izmjena</span>;
  }
  return (
    <span className="text-xs text-orange-700 bg-orange-50 px-2 py-1 rounded">
      Izmjena: {diff.oldLineCount} -&gt; {diff.newLineCount} linija, prva razlika na liniji{" "}
      {diff.firstDifferentLine ?? "?"}
    </span>
  );
}

export function DocumentReviewPanel() {
  const [documents, setDocuments] = useState<StagingDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [approvingAll, setApprovingAll] = useState(false);

  async function fetchStaging() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/documents/staging", { credentials: "include" });
      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? "Greška pri učitavanju.");
      setDocuments(data.documents ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  // Initial data loading intentionally updates local state from an external API.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchStaging();
  }, []);

  async function handleApprove(id: string) {
    setActingOn(id);
    try {
      const res = await fetch(`/api/admin/documents/${id}/approve`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? "Odobrenje nije uspjelo.");
      // Approval itself succeeded even if embedding generation failed
      // (best-effort — see review-pipeline.ts). Surface it, don't hide it:
      // the document is live but won't be findable via the chatbot until
      // embedding is retried.
      if (data.embeddingError) {
        alert(
          `Dokument je odobren, ali generisanje embeddinga nije uspjelo: ${data.embeddingError}\n` +
            "Dokument neće biti pretraživ putem IDSS Asistenta dok se ovo ne popravi.",
        );
      }
      await fetchStaging();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setActingOn(null);
    }
  }

  async function submitReject(id: string) {
    if (rejectReason.trim().length < 10) {
      alert("Razlog odbijanja mora imati najmanje 10 karaktera.");
      return;
    }
    setActingOn(id);
    try {
      const res = await fetch(`/api/admin/documents/${id}/reject`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? "Odbijanje nije uspjelo.");
      setRejectingId(null);
      setRejectReason("");
      await fetchStaging();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setActingOn(null);
    }
  }

  if (loading) {
    return <div className="p-4 text-gray-500">Učitavanje dokumenata na čekanju...</div>;
  }

  if (error) {
    return <div className="p-4 text-red-600">{error}</div>;
  }

  async function handleApproveAll() {
    if (!confirm(`Odobriti svih ${documents.length} dokumenata na čekanju odjednom? Obrada (poglavlja/kviz/sažetak) će se nastaviti automatski u pozadini.`)) {
      return;
    }
    setApprovingAll(true);
    try {
      const res = await fetch("/api/admin/documents/approve-all", { method: "POST", credentials: "include" });
      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? "Bulk odobrenje nije uspjelo.");
      if (data.failed?.length > 0) {
        alert(`Odobreno: ${data.approved.length}. Nije uspjelo za ${data.failed.length} dokumenata -- provjeri konzolu za detalje.`);
        console.error("[DocumentReviewPanel] approve-all failures:", data.failed);
      }
      await fetchStaging();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setApprovingAll(false);
    }
  }

  if (documents.length === 0) {
    return (
      <div className="p-4 bg-gray-50 rounded border border-gray-200 text-gray-500">
        Nema dokumenata koji čekaju odobrenje.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {documents.length > 1 && (
        <div className="flex justify-end">
          <button
            onClick={handleApproveAll}
            disabled={approvingAll || actingOn !== null}
            className="bg-idss-dark-blue text-white px-4 py-2 rounded hover:opacity-90 disabled:opacity-50 transition text-sm"
          >
            {approvingAll ? "Odobravanje u toku..." : `Odobri sve (${documents.length})`}
          </button>
        </div>
      )}
      {documents.map((doc) => (
        <div key={doc.id} className="p-4 bg-white rounded border border-gray-200 shadow-sm">
          <div className="flex justify-between items-start gap-4">
            <div>
              <h4 className="font-semibold text-idss-dark-blue">{doc.original_name}</h4>
              <p className="text-xs text-gray-500">
                {doc.uploader?.full_name ?? "Nepoznat korisnik"} ({doc.uploader?.email ?? "?"}) —{" "}
                {formatBytes(doc.file_size_bytes)} —{" "}
                {new Date(doc.created_at).toLocaleString("bs-BA")}
              </p>
            </div>
            <DiffBadge diff={doc.metadata?.diff_summary} />
          </div>

          <div className="flex flex-wrap gap-2 mt-2">
            {doc.metadata?.ocr_used && !doc.metadata?.manual_review_needed && (
              <span className="text-xs text-blue-700 bg-blue-50 px-2 py-1 rounded">
                Tekst izdvojen putem OCR-a
              </span>
            )}
            {doc.metadata?.manual_review_needed && (
              <span className="text-xs text-red-700 bg-red-50 px-2 py-1 rounded">
                Potreban ručni pregled (ekstrakcija{doc.metadata?.ocr_used ? " (i nakon OCR-a)" : ""} nije uspjela)
              </span>
            )}
          </div>

          <div className="flex gap-3 mt-4">
            <button
              onClick={() => handleApprove(doc.id)}
              disabled={actingOn === doc.id}
              className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-50 transition text-sm"
            >
              {actingOn === doc.id ? "Obrada..." : "Odobri"}
            </button>
            <button
              onClick={() => setRejectingId(rejectingId === doc.id ? null : doc.id)}
              disabled={actingOn === doc.id}
              className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 disabled:opacity-50 transition text-sm"
            >
              Odbij
            </button>
          </div>

          {rejectingId === doc.id && (
            <div className="mt-3 space-y-2">
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Razlog odbijanja (najmanje 10 karaktera)"
                className="w-full border border-gray-300 rounded p-2 text-sm"
                rows={3}
              />
              <button
                onClick={() => submitReject(doc.id)}
                disabled={actingOn === doc.id}
                className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 disabled:opacity-50 transition text-sm"
              >
                Potvrdi odbijanje
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
