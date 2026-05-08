import appointmentsData from "@/data/appointments.json";
import { type Appointment, type CheckinPayload, type MatchResult } from "@/types/checkin";

const appointments: Appointment[] = appointmentsData as Appointment[];

function normalize(value?: string): string {
  return (value ?? "").trim().toUpperCase();
}

function scoreAppointment(payload: Partial<CheckinPayload>, appointment: Appointment): number {
  let score = 0;
  if (normalize(payload.referenceLast5) === normalize(appointment.referenceLast5)) {
    score += 60;
  }
  if (normalize(payload.carrierName) === normalize(appointment.carrierName)) {
    score += 15;
  }
  if (normalize(payload.appointmentDate) === normalize(appointment.appointmentDate)) {
    score += 10;
  }
  if (normalize(payload.appointmentTime) === normalize(appointment.appointmentTime)) {
    score += 10;
  }
  if (normalize(payload.trailerNumber) === normalize(appointment.trailerNumber)) {
    score += 5;
  }
  return score;
}

export function matchAppointment(payload: Partial<CheckinPayload>): MatchResult {
  if (!payload.referenceLast5) {
    return {
      matched: false,
      score: 0,
      reason: "Reference last 5 is required for matching."
    };
  }

  let best: { appointment: Appointment; score: number } | undefined;
  for (const appointment of appointments) {
    const score = scoreAppointment(payload, appointment);
    if (!best || score > best.score) {
      best = { appointment, score };
    }
  }

  if (!best || best.score < 60) {
    return {
      matched: false,
      score: best?.score ?? 0,
      reason: "No appointment match found. Please contact the facility."
    };
  }

  return {
    matched: true,
    appointment: best.appointment,
    score: best.score,
    reason: "Appointment found."
  };
}
