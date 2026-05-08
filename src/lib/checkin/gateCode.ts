/**
 * Stable 5-digit gate code derived from the appointment id (same visit = same code after refresh).
 */
export function gateCodeFromAppointmentId(appointmentId: string): string {
  let h = 2166136261;
  for (let i = 0; i < appointmentId.length; i += 1) {
    h ^= appointmentId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const n = Math.abs(h) % 100_000;
  return n.toString().padStart(5, "0");
}
