// src/components/admin/DocumentUploadWidget.tsx
"use client";

import { useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/db/supabase-browser";
import { STAGING_BUCKET } from "@/features/documents/constants";
import {
  MAX_FILE_SIZE_BYTES,
  ALLOWED_EXTENSIONS,
} from "@/features/documents/schemas/document-upload.schema";

type ConfirmResult = {
  success: boolean;
  documentId?: string;
  filename?: string;
  chunksCreated?: number;
  ocrUsed?: boolean;
  manualReviewNeeded?: boolean;
  isDuplicate?: boolean;
  diffSummary?: {
    hasExistingDocument: boolean;
    contentAvailable?: boolean;
    isIdentical?: boolean;
    oldLineCount?: number;
    newLineCount?: number;
    firstDifferentLine?: number | null;
    hashChanged?: boolean;
  };
  error?: string;
};

/**
 * Upload is a 3-step direct-to-storage flow so the file body never passes through
 * our Next.js server (bypassing Vercel's ~4.5MB serverless request body limit):
 * 1. POST /api/documents/upload-url  — get a signed Supabase Storage upload URL
 * 2. Browser PUTs the file straight to Supabase Storage using that signed URL
 * 3. POST /api/documents/confirm-upload — server downloads the file from Storage
 *    itself (no incoming body limit there) and runs extraction/chunking
 */
export function DocumentUploadWidget() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [stage, setStage] = useState("");
  const [result, setResult] = useState<ConfirmResult | null>(null);

  async function handleUpload() {
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setResult({ success: false, error: "Odaberite fajl prije uploada." });
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setResult({
        success: false,
        error: "Fajl prelazi maksimalnu dozvoljenu veličinu od 10MB.",
      });
      return;
    }
    if (!ALLOWED_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext))) {
      setResult({
        success: false,
        error: "Nepodržana ekstenzija fajla. Dozvoljeno je samo: .pdf, .docx, .xlsx, .png, .jpg, .jpeg",
      });
      return;
    }

    setUploading(true);
    setResult(null);

    try {
      // Step 1: request a signed upload URL (no file body sent yet)
      setStage("Priprema uploada...");
      const urlRes = await fetch("/api/documents/upload-url", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        }),
      });
      const urlData = await urlRes.json();
      if (!urlData.success) {
        throw new Error(urlData.error ?? "Priprema uploada nije uspjela.");
      }

      const { documentId, storagePath, token } = urlData as {
        documentId: string;
        storagePath: string;
        token: string;
      };

      // Step 2: upload directly to Supabase Storage — bypasses our Next.js server entirely
      setStage("Upload fajla...");
      const supabase = createSupabaseBrowserClient();
      const { error: uploadError } = await supabase.storage
        .from(STAGING_BUCKET)
        .uploadToSignedUrl(storagePath, token, file);
      if (uploadError) {
        throw new Error(`Upload fajla nije uspio: ${uploadError.message}`);
      }

      // Step 3: confirm — server downloads from Storage itself and runs the pipeline
      setStage("Obrada dokumenta...");
      const confirmRes = await fetch("/api/documents/confirm-upload", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId,
          storagePath,
          filename: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        }),
      });
      const confirmData = (await confirmRes.json()) as ConfirmResult;
      setResult(confirmData);

      if (confirmData.success && inputRef.current) {
        inputRef.current.value = "";
      }
    } catch (err) {
      setResult({ success: false, error: err instanceof Error ? err.message : String(err) });
    } finally {
      setUploading(false);
      setStage("");
    }
  }

  return (
    <div className="p-4 bg-white rounded border border-gray-200 shadow-sm">
      <h3 className="text-lg font-semibold text-idss-dark-blue mb-2">
        Upload dokumenta
      </h3>
      <p className="text-sm text-gray-600 mb-4">
        Dozvoljeni formati: PDF, DOCX, XLSX, PNG, JPG. Maksimalna veličina: 10MB.
        Skenirani/fotografisani dokumenti se automatski čitaju putem OCR-a.
      </p>

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/png,image/jpeg"
        className="block w-full text-sm text-gray-700 mb-4 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-idss-dark-blue file:text-white file:cursor-pointer"
        disabled={uploading}
      />

      <button
        onClick={handleUpload}
        disabled={uploading}
        className="w-full bg-idss-dark-blue text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50 transition"
      >
        {uploading ? stage || "Upload u toku..." : "Uploaduj dokument"}
      </button>

      {result && (
        <div
          className={`mt-4 p-3 rounded text-sm ${
            result.success
              ? "bg-green-50 border border-green-200 text-green-800"
              : "bg-red-50 border border-red-200 text-red-800"
          }`}
        >
          {result.success ? (
            <div className="space-y-1">
              <p className="font-medium">Dokument je uspješno obrađen: {result.filename}</p>
              <p>Broj chunkova: {result.chunksCreated}</p>
              {result.ocrUsed && !result.manualReviewNeeded && (
                <p className="text-blue-700">
                  Tekst je izdvojen putem OCR-a (dokument je bio skeniran/slikovni).
                </p>
              )}
              {result.manualReviewNeeded && (
                <p className="text-amber-700">
                  Automatska ekstrakcija teksta nije uspjela ili je rezultat prekratak (i nakon OCR-a).
                  Potreban je ručni pregled.
                </p>
              )}
              {result.isDuplicate && (
                <p className="text-gray-600">
                  Sadržaj je identičan trenutno aktivnom dokumentu istog naziva.
                </p>
              )}
              {result.diffSummary?.hasExistingDocument && (
                <p className="text-gray-600">
                  Postoji aktivna verzija ovog dokumenta.{" "}
                  {result.diffSummary.contentAvailable
                    ? result.diffSummary.isIdentical
                      ? "Sadržaj je nepromijenjen."
                      : `Broj linija: ${result.diffSummary.oldLineCount} -> ${result.diffSummary.newLineCount}.`
                    : "Prethodni sadržaj nije dostupan za poređenje (stariji uvoz)."}
                </p>
              )}
              <p className="pt-1">Dokument čeka odobrenje Super Admina.</p>
            </div>
          ) : (
            <p>{result.error}</p>
          )}
        </div>
      )}
    </div>
  );
}
