import {
  type CheckinPayload,
  type RequiredFieldKey,
  type RequiredFieldPrompt
} from "@/types/checkin";

const FIELD_CONFIG: Record<RequiredFieldKey, Omit<RequiredFieldPrompt, "reason">> =
  {
    referenceLast5: {
      key: "referenceLast5",
      label: "Last 5 of PO/Reference",
      placeholder: "12345"
    },
    driverName: {
      key: "driverName",
      label: "Driver Name",
      placeholder: "First Last"
    },
    carrierName: {
      key: "carrierName",
      label: "Carrier Name",
      placeholder: "Carrier Inc."
    },
    trailerNumber: {
      key: "trailerNumber",
      label: "Trailer Number",
      placeholder: "TRL-####"
    }
  };

const REQUIRED_FIELDS: RequiredFieldKey[] = [
  "referenceLast5",
  "driverName",
  "carrierName",
  "trailerNumber"
];

export function getMissingRequiredPrompts(
  payload: Partial<CheckinPayload>
): RequiredFieldPrompt[] {
  return REQUIRED_FIELDS.filter((key) => !payload[key]?.toString().trim()).map(
    (key) => ({
      ...FIELD_CONFIG[key],
      reason: "This field is required to verify your appointment."
    })
  );
}

export function isPayloadComplete(payload: Partial<CheckinPayload>): boolean {
  return getMissingRequiredPrompts(payload).length === 0;
}
