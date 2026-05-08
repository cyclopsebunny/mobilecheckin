export type RequiredFieldKey =
  | "referenceLast5"
  | "driverName"
  | "carrierName"
  | "trailerNumber";

export interface ExtractedDocumentData {
  // ── Reference numbers ─────────────────────────────────────────
  referenceNumber?: string;
  referenceLast5?: string;
  bolNumber?: string;
  proNumber?: string;
  poNumber?: string;
  shipperReference?: string;
  agentNumber?: string;

  // ── Parties ───────────────────────────────────────────────────
  driverName?: string;
  carrierName?: string;
  shipperName?: string;
  shipperAddress?: string;
  consigneeName?: string;
  consigneeAddress?: string;
  notifyParty?: string;
  thirdPartyBilling?: string;

  // ── Routing ───────────────────────────────────────────────────
  originPoint?: string;
  destinationPoint?: string;

  // ── Equipment ─────────────────────────────────────────────────
  trailerNumber?: string;
  sealNumber?: string;

  // ── Dates & times ─────────────────────────────────────────────
  appointmentDate?: string;
  appointmentTime?: string;
  shipmentDate?: string;
  pickupDate?: string;
  pickupTime?: string;
  deliveryDate?: string;
  deliveryTime?: string;

  // ── Freight details ───────────────────────────────────────────
  commodity?: string;
  commodityNotation?: string;
  totalWeight?: string;
  pieces?: string;
  pallets?: string;
  dimensions?: string;
  freightClass?: string;
  nmfc?: string;

  // ── Financial ─────────────────────────────────────────────────
  freightTerms?: string;
  codAmount?: string;
  declaredValue?: string;

  // ── Special handling ──────────────────────────────────────────
  specialInstructions?: string;
  deliveryInstructions?: string;
  deliveryExceptions?: string;

  // ── Hazmat (49 CFR § 172.202–203) ────────────────────────────
  hazmat?: boolean;
  hazmatProperShippingName?: string;
  hazmatUnNumber?: string;
  hazmatHazardClass?: string;
  hazmatPackingGroup?: string;
  hazmatQuantity?: string;
  hazmatEmergencyContact?: string;

  // ── Signatures & acknowledgments ─────────────────────────────
  shipperSignature?: string;
  carrierSignature?: string;
  consigneeSignature?: string;

  // ── Meta ──────────────────────────────────────────────────────
  confidence?: number;
  notes?: string;
  /** Per-field confidence scores (0–1) for any field the model is unsure about */
  fieldConfidence?: Record<string, number>;
}

export interface RequiredFieldPrompt {
  key: RequiredFieldKey;
  label: string;
  placeholder: string;
  reason: string;
}

export interface Appointment {
  id: string;
  referenceLast5: string;
  customerName: string;
  carrierName: string;
  appointmentDate: string;
  appointmentTime: string;
  trailerNumber: string;
  dockNumber: string;
  // Optional enrichment fields (populated from BOL data)
  bolNumber?: string;
  proNumber?: string;
  shipperName?: string;
  consigneeName?: string;
  originPoint?: string;
  destinationPoint?: string;
  /** Facility street address for maps / directions when BOL has no full address */
  facilityAddress?: string;
  commodity?: string;
  totalWeight?: string;
  pieces?: string;
  freightClass?: string;
  nmfc?: string;
  freightTerms?: string;
  sealNumber?: string;
  notes?: string;
}

// ── CDL ──────────────────────────────────────────────────────────
export type CdlClass = "A" | "B" | "C" | "Unknown";
export type CdlEndorsement = "H" | "N" | "T" | "X" | "P" | "S";

export interface ExtractedCdlData {
  fullName?: string;
  licenseNumber?: string;
  issuingState?: string;
  cdlClass?: CdlClass;
  endorsements?: CdlEndorsement[];
  restrictions?: string;
  expirationDate?: string;
  dateOfBirth?: string;
  confidence?: number;
  notes?: string;
}

export interface CdlValidation {
  valid: boolean;
  alertLevel: "clear" | "warn" | "block";
  reason: string;
  details: {
    expired?: boolean;
    daysUntilExpiry?: number;
    cdlClass?: CdlClass;
    endorsements?: CdlEndorsement[];
    nameMatch?: boolean | null;
  };
}

// ── FMCSA ─────────────────────────────────────────────────────────
export interface FmcsaCarrier {
  dotNumber: string;
  legalName: string;
  dbaName?: string;
  allowedToOperate: boolean;
  operatingStatus: string;
  bipdInsuranceOnFile?: number;
  cargoInsuranceOnFile?: number;
  safetyRating?: string;
  safetyRatingDate?: string;
  outOfServiceDate?: string;
  phoneNumber?: string;
  mailingCity?: string;
  mailingState?: string;
}

export interface CarrierVerification {
  verified: boolean;
  authorized: boolean;
  carrier?: FmcsaCarrier;
  matchedName?: string;
  searchedName?: string;
  alertLevel: "clear" | "warn" | "block";
  reason: string;
}

export interface MatchResult {
  matched: boolean;
  appointment?: Appointment;
  score: number;
  reason: string;
}

export interface CheckinPayload extends ExtractedDocumentData {
  method: "manual" | "scan";
}
