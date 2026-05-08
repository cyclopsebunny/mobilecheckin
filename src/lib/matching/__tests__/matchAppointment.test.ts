import { describe, expect, it } from "vitest";
import { matchAppointment } from "@/lib/matching/matchAppointment";

describe("matchAppointment", () => {
  it("matches when reference last5 is exact", () => {
    const result = matchAppointment({
      method: "manual",
      referenceLast5: "84721",
      carrierName: "NorthLine Logistics",
      appointmentDate: "2026-05-07",
      appointmentTime: "09:30",
      trailerNumber: "TRL-5521"
    });

    expect(result.matched).toBe(true);
    expect(result.appointment?.dockNumber).toBe("D12");
  });

  it("returns unmatched when reference is absent", () => {
    const result = matchAppointment({
      method: "scan",
      carrierName: "NorthLine Logistics"
    });

    expect(result.matched).toBe(false);
  });
});
