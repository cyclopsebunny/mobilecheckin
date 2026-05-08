import { describe, expect, it } from "vitest";
import { getMissingRequiredPrompts, isPayloadComplete } from "@/lib/validation/requiredFields";

describe("required field validation", () => {
  it("reports missing prompts", () => {
    const missing = getMissingRequiredPrompts({
      method: "manual",
      referenceLast5: "84721"
    });
    expect(missing.length).toBeGreaterThan(0);
    expect(missing.some((item) => item.key === "driverName")).toBe(true);
  });

  it("returns complete when all required values exist", () => {
    const complete = isPayloadComplete({
      method: "scan",
      referenceLast5: "84721",
      driverName: "Ada Driver",
      carrierName: "NorthLine Logistics",
      appointmentDate: "2026-05-07",
      appointmentTime: "09:30",
      trailerNumber: "TRL-5521"
    });
    expect(complete).toBe(true);
  });
});
