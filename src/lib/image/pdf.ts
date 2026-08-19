/**
 * PDF support for the document pipeline.
 *
 * The extraction pipeline is image-only: edge detection, perspective correction
 * and the OpenAI vision call all need pixels. A BOL that arrives as an emailed
 * PDF is common, so we rasterise its first page and feed that in instead.
 *
 * Client-only — pdfjs is imported lazily so it never reaches the server bundle.
 */

export const PDF_MIME = "application/pdf";

export function isPdf(file: { type?: string; name?: string }): boolean {
  return file.type === PDF_MIME || Boolean(file.name?.toLowerCase().endsWith(".pdf"));
}

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  // Bundled alongside the app so the worker version always matches the library.
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();
  return pdfjs;
}

export interface RasterizedPdf {
  blob: Blob;
  pageCount: number;
}

/**
 * Render page 1 to a JPEG. `targetLongEdge` matches the detection ceiling used
 * by preprocessDocumentImage so we do not rasterise more pixels than we read.
 */
export async function rasterizePdfFirstPage(
  file: Blob,
  targetLongEdge = 2000
): Promise<RasterizedPdf> {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  // destroy() lives on the loading task, not the document proxy.
  const loadingTask = pdfjs.getDocument({ data });
  const doc = await loadingTask.promise;

  try {
    const page = await doc.getPage(1);
    const unscaled = page.getViewport({ scale: 1 });
    const scale = targetLongEdge / Math.max(unscaled.width, unscaled.height);
    const viewport = page.getViewport({ scale: Math.min(scale, 4) });

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Could not create canvas context for the PDF page.");
    }
    // PDFs draw transparent where there is no ink; flatten onto white so the
    // JPEG does not come out with black page margins.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvas, canvasContext: context, viewport }).promise;

    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error("Could not encode the PDF page."))),
        "image/jpeg",
        0.95
      )
    );
    return { blob, pageCount: doc.numPages };
  } finally {
    await loadingTask.destroy();
  }
}
