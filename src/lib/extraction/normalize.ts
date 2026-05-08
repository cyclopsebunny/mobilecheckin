import { type ExtractedDocumentData } from "@/types/checkin";

function clean(input?: string): string | undefined {
  if (!input) {
    return undefined;
  }
  const value = input.trim();
  return value.length > 0 ? value : undefined;
}

function normalizeDate(value?: string): string | undefined {
  const text = clean(value);
  if (!text) {
    return undefined;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  const match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!match) {
    return text;
  }

  const month = match[1].padStart(2, "0");
  const day = match[2].padStart(2, "0");
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${month}-${day}`;
}

function normalizeTime(value?: string): string | undefined {
  const text = clean(value);
  if (!text) {
    return undefined;
  }

  const ampm = text.toUpperCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/);
  if (ampm) {
    let hour = Number.parseInt(ampm[1], 10);
    const minute = ampm[2] ?? "00";
    if (ampm[3] === "PM" && hour < 12) {
      hour += 12;
    }
    if (ampm[3] === "AM" && hour === 12) {
      hour = 0;
    }
    return `${hour.toString().padStart(2, "0")}:${minute}`;
  }

  const twentyFour = text.match(/^(\d{1,2}):(\d{2})$/);
  if (twentyFour) {
    return `${twentyFour[1].padStart(2, "0")}:${twentyFour[2]}`;
  }

  return text;
}

function lastFive(value?: string): string | undefined {
  const text = clean(value);
  if (!text) {
    return undefined;
  }
  const alnum = text.replace(/[^a-zA-Z0-9]/g, "");
  return alnum.length >= 5 ? alnum.slice(-5).toUpperCase() : undefined;
}

function cleanUpper(input?: string): string | undefined {
  return clean(input)?.toUpperCase();
}

function parseBool(val: unknown): boolean | undefined {
  if (val === true) return true;
  if (val === false) return false;
  const s = String(val ?? "").toUpperCase().trim();
  if (s === "YES" || s === "TRUE" || s === "Y" || s === "1") return true;
  if (s === "NO"  || s === "FALSE"|| s === "N" || s === "0") return false;
  return undefined;
}

export function normalizeExtractedData(raw: Record<string, unknown>): ExtractedDocumentData {
  const referenceNumber = clean(
    (raw.referenceNumber as string) ??
    (raw.shipperReference as string) ??
    (raw.poNumber as string)
  );

  const result: ExtractedDocumentData = {
    // Reference numbers
    referenceNumber,
    referenceLast5: lastFive((raw.referenceLast5 as string) ?? referenceNumber),
    bolNumber:        clean(raw.bolNumber as string),
    proNumber:        clean(raw.proNumber as string),
    poNumber:         clean(raw.poNumber as string),
    shipperReference: clean(raw.shipperReference as string),
    agentNumber:      clean(raw.agentNumber as string),

    // Parties
    driverName:      clean(raw.driverName as string),
    carrierName:     clean(raw.carrierName as string),
    shipperName:     clean(raw.shipperName as string),
    shipperAddress:  clean(raw.shipperAddress as string),
    consigneeName:   clean(raw.consigneeName as string),
    consigneeAddress:clean(raw.consigneeAddress as string),
    notifyParty:     clean(raw.notifyParty as string),
    thirdPartyBilling: clean(raw.thirdPartyBilling as string),

    // Routing
    originPoint:      clean(raw.originPoint as string),
    destinationPoint: clean(raw.destinationPoint as string),

    // Equipment
    trailerNumber: cleanUpper(raw.trailerNumber as string),
    sealNumber:    cleanUpper(raw.sealNumber as string),

    // Dates & times
    appointmentDate: normalizeDate(raw.appointmentDate as string),
    appointmentTime: normalizeTime(raw.appointmentTime as string),
    shipmentDate:    normalizeDate((raw.shipmentDate as string) ?? (raw.dateOfShipment as string)),
    pickupDate:      normalizeDate(raw.pickupDate as string),
    pickupTime:      normalizeTime(raw.pickupTime as string),
    deliveryDate:    normalizeDate(raw.deliveryDate as string),
    deliveryTime:    normalizeTime(raw.deliveryTime as string),

    // Freight details
    commodity:         clean(raw.commodity as string),
    commodityNotation: clean(raw.commodityNotation as string),
    totalWeight:       clean(raw.totalWeight as string) ?? clean(raw.weight as string),
    pieces:            clean(raw.pieces as string),
    pallets:           clean(raw.pallets as string) ?? clean(raw.handlingUnits as string),
    dimensions:        clean(raw.dimensions as string) ?? clean(raw.volume as string),
    freightClass:      clean(raw.freightClass as string),
    nmfc:              clean(raw.nmfc as string) ?? clean(raw.nmfcItemNumber as string),

    // Financial
    freightTerms:  clean(raw.freightTerms as string),
    codAmount:     clean(raw.codAmount as string),
    declaredValue: clean(raw.declaredValue as string) ?? clean(raw.releasedValue as string),

    // Special handling
    specialInstructions:  clean(raw.specialInstructions as string),
    deliveryInstructions: clean(raw.deliveryInstructions as string),
    deliveryExceptions:   clean(raw.deliveryExceptions as string) ?? clean(raw.osdNotation as string),

    // Hazmat
    hazmat:                    parseBool(raw.hazmat) === true ? true : undefined,
    hazmatProperShippingName:  clean(raw.hazmatProperShippingName as string),
    hazmatUnNumber:            clean(raw.hazmatUnNumber as string) ?? clean(raw.unNumber as string),
    hazmatHazardClass:         clean(raw.hazmatHazardClass as string),
    hazmatPackingGroup:        clean(raw.hazmatPackingGroup as string),
    hazmatQuantity:            clean(raw.hazmatQuantity as string),
    hazmatEmergencyContact:    clean(raw.hazmatEmergencyContact as string),

    // Signatures
    shipperSignature:   clean(raw.shipperSignature as string),
    carrierSignature:   clean(raw.carrierSignature as string) ?? clean(raw.driverReceipt as string),
    consigneeSignature: clean(raw.consigneeSignature as string),

    // Meta
    confidence: typeof raw.confidence === "number" ? raw.confidence : undefined,
    notes:      clean(raw.notes as string),
    fieldConfidence: raw.fieldConfidence && typeof raw.fieldConfidence === "object"
      ? (raw.fieldConfidence as Record<string, number>)
      : undefined
  };

  // Gate low-confidence fields: blank out anything the model is less than 35% sure about
  const LOW_CONF = 0.35;
  if (result.fieldConfidence) {
    const fc = result.fieldConfidence;
    for (const field of Object.keys(fc)) {
      const conf = fc[field];
      if (conf < LOW_CONF && field in result) {
        (result as Record<string, unknown>)[field] = undefined;
        delete fc[field];
      }
    }
  }

  return result;
}
