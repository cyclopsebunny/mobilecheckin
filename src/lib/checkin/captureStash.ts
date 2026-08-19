import type { ProcessedImageResult } from "@/lib/image/preprocess";
import type { UploadedDocument } from "@/types/documents";

/**
 * Holds the captured images across the round trip to /checkin/result.
 *
 * Pushing to the result page unmounts the check-in page, so component state is
 * lost. The extracted payload is small enough for sessionStorage, but the
 * images are not — a processed BOL plus a licence runs to several megabytes of
 * base64 and blows the storage quota.
 *
 * Both navigations are client-side, so the module registry survives and this
 * plain module variable is enough. A hard refresh clears it: the payload still
 * restores, the images do not.
 */
interface StashedCaptures {
  documents: UploadedDocument[];
  cdlCapture: ProcessedImageResult | null;
}

let stashed: StashedCaptures | null = null;

export function stashCaptures(value: StashedCaptures): void {
  stashed = { documents: [...value.documents], cdlCapture: value.cdlCapture };
}

/** Non-destructive so a double-invoked effect restores the same thing twice. */
export function readCaptures(): StashedCaptures | null {
  return stashed;
}

export function clearCaptures(): void {
  stashed = null;
}
