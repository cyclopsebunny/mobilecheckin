import { type CdlClass, type CdlEndorsement, type CdlValidation, type ExtractedCdlData } from "@/types/checkin";

const REQUIRED_CDL_CLASSES: CdlClass[] = ["A", "B"];
const WARNING_DAYS = 30;

function parseExpiry(raw: string): Date | null {
  if (!raw) return null;
  // Handle MM/DD/YYYY, YYYY-MM-DD, MM-DD-YYYY
  const cleaned = raw.trim();
  const slashParts = cleaned.split("/");
  const dashParts = cleaned.split("-");

  if (slashParts.length === 3) {
    const [m, d, y] = slashParts;
    const date = new Date(`${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`);
    return isNaN(date.getTime()) ? null : date;
  }
  if (dashParts.length === 3) {
    // Could be YYYY-MM-DD or MM-DD-YYYY
    if (dashParts[0].length === 4) {
      const date = new Date(cleaned);
      return isNaN(date.getTime()) ? null : date;
    }
    const [m, d, y] = dashParts;
    const date = new Date(`${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`);
    return isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function validateCdl(
  cdl: ExtractedCdlData,
  driverNameFromCheckin?: string
): CdlValidation {
  const issues: string[] = [];
  const details: CdlValidation["details"] = {};

  // ── 1. Expiry check ──────────────────────────────────────────────
  let expired = false;
  if (cdl.expirationDate) {
    const expiry = parseExpiry(cdl.expirationDate);
    if (expiry) {
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const daysUntilExpiry = Math.floor(
        (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
      details.daysUntilExpiry = daysUntilExpiry;
      expired = daysUntilExpiry < 0;
      details.expired = expired;

      if (expired) {
        issues.push(`CDL expired ${Math.abs(daysUntilExpiry)} day(s) ago.`);
      } else if (daysUntilExpiry <= WARNING_DAYS) {
        issues.push(`CDL expires in ${daysUntilExpiry} day(s).`);
      }
    }
  }

  // ── 2. CDL class check ───────────────────────────────────────────
  const cdlClass = cdl.cdlClass ?? "Unknown";
  details.cdlClass = cdlClass;
  if (cdlClass === "Unknown") {
    issues.push("Could not determine CDL class from license.");
  } else if (!REQUIRED_CDL_CLASSES.includes(cdlClass)) {
    issues.push(`CDL Class ${cdlClass} is not valid for commercial trucking (requires Class A or B).`);
  }

  // ── 3. Endorsements (informational) ─────────────────────────────
  details.endorsements = cdl.endorsements ?? [];

  // ── 4. Name match ────────────────────────────────────────────────
  if (driverNameFromCheckin && cdl.fullName) {
    const extracted = normalizeName(cdl.fullName);
    const entered = normalizeName(driverNameFromCheckin);
    // Either the full name matches, or last name appears in extracted name
    const enteredParts = entered.split(" ");
    const lastName = enteredParts[enteredParts.length - 1];
    const nameMatch = extracted.includes(lastName) || extracted === entered;
    details.nameMatch = nameMatch;
    if (!nameMatch) {
      issues.push(`CDL name "${cdl.fullName}" does not match entered driver name "${driverNameFromCheckin}".`);
    }
  } else {
    details.nameMatch = null;
  }

  // ── Determine alert level ────────────────────────────────────────
  if (expired) {
    return {
      valid: false,
      alertLevel: "block",
      reason: issues.join(" "),
      details
    };
  }

  if (issues.length > 0) {
    return {
      valid: false,
      alertLevel: "warn",
      reason: issues.join(" "),
      details
    };
  }

  return {
    valid: true,
    alertLevel: "clear",
    reason:
      `CDL Class ${cdlClass} — valid` +
      (details.endorsements.length > 0
        ? `. Endorsements: ${details.endorsements.join(", ")}`
        : "."),
    details
  };
}
