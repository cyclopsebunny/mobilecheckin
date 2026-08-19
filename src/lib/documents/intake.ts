import { isPdf, rasterizePdfFirstPage } from "@/lib/image/pdf";
import { preprocessDocumentImage, type DocumentQuad } from "@/lib/image/preprocess";
import {
  formatFileSize,
  MAX_UPLOAD_BYTES,
  type DocumentType,
  type UploadedDocument
} from "@/types/documents";

/** Thrown for problems worth showing the driver verbatim (too large, unreadable PDF). */
export class UploadRejected extends Error {}

export async function buildUploadedDocument(
  file: File,
  docType: DocumentType,
  quadHint?: DocumentQuad
): Promise<UploadedDocument> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new UploadRejected(
      `${file.name} is ${formatFileSize(file.size)}. The limit is ${formatFileSize(MAX_UPLOAD_BYTES)}.`
    );
  }

  const pdf = isPdf(file);
  let source: Blob = file;
  let pageCount: number | undefined;

  if (pdf) {
    try {
      const rasterized = await rasterizePdfFirstPage(file);
      source = rasterized.blob;
      pageCount = rasterized.pageCount;
    } catch {
      throw new UploadRejected(
        `Could not read ${file.name}. If it is a scanned or protected PDF, photograph the document instead.`
      );
    }
  }

  // Edge detection exists to find a document within a photo. A PDF page has no
  // surrounding scene and is already flat, so skip detection and warping — that
  // would only resample a clean image — and let contrast/sharpening do the rest.
  const image = await preprocessDocumentImage(
    source,
    pdf ? { skipPerspective: true } : { quadHintNormalized: quadHint }
  );

  return {
    id: crypto.randomUUID(),
    fileName: file.name,
    docType,
    sizeBytes: file.size,
    fromPdf: pdf,
    pageCount,
    image
  };
}
