export function formatAppointmentWindow(
  appointmentDate?: string,
  appointmentTime?: string
): { startsLine: string; endsLine: string } {
  if (!appointmentDate || !appointmentTime) {
    return { startsLine: "Starts: —", endsLine: "Ends: —" };
  }
  const start = new Date(`${appointmentDate}T${appointmentTime}:00`);
  if (Number.isNaN(start.getTime())) {
    return { startsLine: "Starts: —", endsLine: "Ends: —" };
  }
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const opts: Intl.DateTimeFormatOptions = {
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  };
  return {
    startsLine: `Starts: ${start.toLocaleString("en-US", opts)}`,
    endsLine: `Ends: ${end.toLocaleString("en-US", opts)}`
  };
}
