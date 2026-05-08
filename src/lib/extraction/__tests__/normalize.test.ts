import { describe, expect, it } from "vitest";
import { normalizeExtractedData } from "@/lib/extraction/normalize";

describe("normalizeExtractedData", () => {
  it("normalizes date, time, trailer, and reference", () => {
    const normalized = normalizeExtractedData({
      poNumber: "PO-99884721",
      appointmentDate: "5/7/2026",
      appointmentTime: "9:30 AM",
      trailerNumber: "trl-5521"
    });

    expect(normalized.referenceLast5).toBe("84721");
    expect(normalized.appointmentDate).toBe("2026-05-07");
    expect(normalized.appointmentTime).toBe("09:30");
    expect(normalized.trailerNumber).toBe("TRL-5521");
  });
});
