import appointmentsData from "@/data/appointments.json";
import type { Appointment } from "@/types/checkin";

const appointments = appointmentsData as Appointment[];

export function getAppointmentById(id: string): Appointment | undefined {
  return appointments.find((a) => a.id === id);
}
