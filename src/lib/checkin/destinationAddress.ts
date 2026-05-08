import type { Appointment, ExtractedDocumentData } from "@/types/checkin";

/**
 * Map / directions target: prefer full consignee address from BOL, then destination,
 * then optional facility address on the appointment record.
 */
export function resolveDestinationQuery(
  bol: Partial<ExtractedDocumentData>,
  appointment?: Appointment | null
): string {
  const street = bol.consigneeAddress?.trim();
  if (street) {
    return street;
  }
  const dest = bol.destinationPoint?.trim() || appointment?.destinationPoint?.trim();
  if (dest) {
    return dest;
  }
  const facility = appointment?.facilityAddress?.trim();
  if (facility) {
    return facility;
  }
  if (appointment) {
    const parts = [appointment.consigneeName, appointment.destinationPoint].filter(Boolean);
    if (parts.length) {
      return parts.join(", ");
    }
  }
  return "United States";
}
