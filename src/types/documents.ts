import type { ProcessedImageResult } from "@/lib/image/preprocess";

/**
 * Document types a driver can attach at check-in.
 *
 * Only the Bill of Lading is sent for AI extraction — the others are attached
 * to the check-in for the dock team but their pixels are never read. Keep that
 * asymmetry in mind before adding a type here.
 */
export type DocumentType = "bol" | "invoice" | "packing-list";

export const DOCUMENT_TYPES: ReadonlyArray<{ value: DocumentType; label: string }> = [
  { value: "bol", label: "Bill of Lading" },
  { value: "invoice", label: "Invoice" },
  { value: "packing-list", label: "Packing List" }
];

/** The only type whose contents we extract. */
export const ANALYZED_DOCUMENT_TYPE: DocumentType = "bol";

/** Matches the "Max file size is 10 MB" promise on the upload screen. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export interface UploadedDocument {
  id: string;
  fileName: string;
  docType: DocumentType;
  sizeBytes: number;
  /** True when the source was a PDF and page 1 was rasterised into `image`. */
  fromPdf: boolean;
  /** Total pages in the source PDF, so we can warn that only page 1 is read. */
  pageCount?: number;
  image: ProcessedImageResult;
}

export function documentTypeLabel(type: DocumentType): string {
  return DOCUMENT_TYPES.find((t) => t.value === type)?.label ?? type;
}

/** The document we extract from — the first Bill of Lading in upload order. */
export function findAnalyzableDocument(
  documents: readonly UploadedDocument[]
): UploadedDocument | undefined {
  return documents.find((d) => d.docType === ANALYZED_DOCUMENT_TYPE);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
