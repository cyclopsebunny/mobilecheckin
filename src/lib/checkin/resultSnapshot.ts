import type { ExtractedDocumentData } from "@/types/checkin";

export const GRANTED_RESULT_STORAGE_KEY = "dockpass:granted:v1";

export interface GrantedResultSnapshot {
  appointmentId: string;
  bol: Partial<ExtractedDocumentData>;
  savedAt: number;
}

export function parseGrantedSnapshot(raw: string | null): GrantedResultSnapshot | null {
  if (!raw) {
    return null;
  }
  try {
    const v = JSON.parse(raw) as GrantedResultSnapshot;
    if (typeof v.appointmentId !== "string" || typeof v.bol !== "object" || v.bol === null) {
      return null;
    }
    return v;
  } catch {
    return null;
  }
}

export function saveGrantedSnapshot(
  data: Pick<GrantedResultSnapshot, "appointmentId" | "bol">
): void {
  if (typeof sessionStorage === "undefined") {
    return;
  }
  const snapshot: GrantedResultSnapshot = {
    ...data,
    savedAt: Date.now()
  };
  sessionStorage.setItem(GRANTED_RESULT_STORAGE_KEY, JSON.stringify(snapshot));
}
