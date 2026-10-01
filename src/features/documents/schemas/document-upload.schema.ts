/**
 * Document Upload — Zod validation schemas
 * Sprint 09: Document Upload and Approval Workflow
 *
 * Upload is a two-step, direct-to-storage flow (see upload-pipeline.ts):
 * 1. RequestUploadUrlSchema — client asks for a signed Storage upload URL (no file body).
 * 2. ConfirmUploadSchema — client confirms the direct upload finished (no file body either;
 *    the server downloads the file from Storage itself to run extraction).
 */

import { z } from "zod";

export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  // Scanned/photographed documents — transcribed transparently via OCR
  // (see src/features/documents/services/ocr.ts). Callers never need to
  // know or decide whether a document is text or scanned.
  "image/png",
  "image/jpeg",
] as const;

export const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".xlsx", ".png", ".jpg", ".jpeg"] as const;

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

function isAllowedMimeType(mimeType: string): boolean {
  return ALLOWED_MIME_TYPES.includes(mimeType as (typeof ALLOWED_MIME_TYPES)[number]);
}

function hasAllowedExtension(filename: string): boolean {
  return ALLOWED_EXTENSIONS.some((ext) => filename.toLowerCase().endsWith(ext));
}

export const RequestUploadUrlSchema = z
  .object({
    filename: z.string().min(1, "Naziv fajla je obavezan"),
    mimeType: z.string().min(1, "Tip fajla je obavezan"),
    sizeBytes: z.number().int().positive("Fajl je prazan"),
  })
  .refine((data) => isAllowedMimeType(data.mimeType), {
    message: "Nepodržan tip fajla. Dozvoljeno je samo: PDF, DOCX, XLSX, PNG, JPG.",
    path: ["mimeType"],
  })
  .refine((data) => hasAllowedExtension(data.filename), {
    message: "Nepodržana ekstenzija fajla. Dozvoljeno je samo: .pdf, .docx, .xlsx, .png, .jpg, .jpeg",
    path: ["filename"],
  })
  .refine((data) => data.sizeBytes <= MAX_FILE_SIZE_BYTES, {
    message: "Fajl prelazi maksimalnu dozvoljenu veličinu od 10MB.",
    path: ["sizeBytes"],
  });

// Kept as an alias — this was the pre-signed-URL flow's schema name and is still
// a fitting description of "the metadata that describes an uploadable file".
export const UploadFileMetaSchema = RequestUploadUrlSchema;

export const ConfirmUploadSchema = z
  .object({
    documentId: z.string().uuid("Neispravan ID dokumenta"),
    storagePath: z.string().min(1, "Putanja u Storage-u je obavezna"),
    filename: z.string().min(1, "Naziv fajla je obavezan"),
    mimeType: z.string().min(1, "Tip fajla je obavezan"),
    sizeBytes: z.number().int().positive("Fajl je prazan"),
  })
  .refine((data) => isAllowedMimeType(data.mimeType), {
    message: "Nepodržan tip fajla. Dozvoljeno je samo: PDF, DOCX, XLSX, PNG, JPG.",
    path: ["mimeType"],
  })
  .refine((data) => hasAllowedExtension(data.filename), {
    message: "Nepodržana ekstenzija fajla. Dozvoljeno je samo: .pdf, .docx, .xlsx, .png, .jpg, .jpeg",
    path: ["filename"],
  })
  .refine((data) => data.sizeBytes <= MAX_FILE_SIZE_BYTES, {
    message: "Fajl prelazi maksimalnu dozvoljenu veličinu od 10MB.",
    path: ["sizeBytes"],
  });

export const ApproveDocumentSchema = z.object({
  documentId: z.string().uuid("Neispravan ID dokumenta"),
});

export const RejectDocumentSchema = z.object({
  documentId: z.string().uuid("Neispravan ID dokumenta"),
  reason: z
    .string()
    .min(10, "Razlog odbijanja mora imati najmanje 10 karaktera"),
});

export type RequestUploadUrlInput = z.infer<typeof RequestUploadUrlSchema>;
export type UploadFileMeta = z.infer<typeof UploadFileMetaSchema>;
export type ConfirmUploadInput = z.infer<typeof ConfirmUploadSchema>;
export type ApproveDocumentInput = z.infer<typeof ApproveDocumentSchema>;
export type RejectDocumentInput = z.infer<typeof RejectDocumentSchema>;
