import { NextRequest, NextResponse } from "next/server";
import {
  type CarrierVerification,
  type FmcsaCarrier
} from "@/types/checkin";

export const runtime = "nodejs";

const FMCSA_BASE = "https://mobile.fmcsa.dot.gov/qc/services";

interface FmcsaRawCarrier {
  dotNumber?: string | number;
  legalName?: string;
  dbaName?: string;
  allowedToOperate?: string;
  bipdInsuranceOnFile?: string | number;
  cargoInsuranceOnFile?: string | number;
  operatingStatus?: string;
  safetyRating?: string;
  safetyRatingDate?: string;
  outOfServiceDate?: string;
  telephoneNumber?: string;
  phyCity?: string;
  phyState?: string;
  mailingCity?: string;
  mailingState?: string;
}

// The name-search endpoint wraps each result as { _links, carrier: {...} }
// The single-carrier endpoint returns { carrier: {...} } or { content: { carrier: {...} } }
interface FmcsaContentItem {
  carrier?: FmcsaRawCarrier;
  [key: string]: unknown;
}

interface FmcsaApiResponse {
  content?: FmcsaContentItem | FmcsaContentItem[] | FmcsaRawCarrier | FmcsaRawCarrier[];
  carrier?: FmcsaRawCarrier;
  carrierResponse?: {
    content?: FmcsaContentItem | FmcsaContentItem[] | FmcsaRawCarrier;
    carrier?: FmcsaRawCarrier;
  };
  retrievalDate?: string;
  [key: string]: unknown;
}

/** Unwrap a single carrier record regardless of nesting depth. */
function unwrapCarrier(item: unknown): FmcsaRawCarrier | null {
  if (!item || typeof item !== "object") return null;
  const obj = item as Record<string, unknown>;
  // If the item itself has dotNumber it is the raw carrier
  if (obj.dotNumber !== undefined || obj.legalName !== undefined) {
    return obj as FmcsaRawCarrier;
  }
  // Otherwise look one level deeper for a .carrier property
  if (obj.carrier && typeof obj.carrier === "object") {
    return obj.carrier as FmcsaRawCarrier;
  }
  return null;
}

function extractFirstCarrier(json: FmcsaApiResponse): FmcsaRawCarrier | null {
  // Single-carrier endpoints: top-level .carrier
  if (json.carrier) return unwrapCarrier(json.carrier);
  if (json.carrierResponse?.carrier) return unwrapCarrier(json.carrierResponse.carrier);

  // List endpoints: .content array where each item is { _links, carrier }
  const content = json.content ?? json.carrierResponse?.content;
  if (Array.isArray(content)) {
    for (const item of content) {
      const c = unwrapCarrier(item);
      if (c) return c;
    }
    return null;
  }
  return unwrapCarrier(content ?? null);
}

/** Collect all carrier records from a list response. */
function extractAllCarriers(json: FmcsaApiResponse): FmcsaRawCarrier[] {
  const content = json.content ?? json.carrierResponse?.content;
  if (Array.isArray(content)) {
    return content.map(unwrapCarrier).filter((c): c is FmcsaRawCarrier => c !== null);
  }
  const single = extractFirstCarrier(json);
  return single ? [single] : [];
}

/** Map FMCSA statusCode to a human-readable operating status string. */
function statusCodeLabel(code: string | undefined | null): string {
  switch ((code ?? "").toUpperCase()) {
    case "A": return "Active";
    case "I": return "Inactive";
    case "X": return "Out of Service";
    case "R": return "Revoked";
    default:  return code ? String(code) : "Unknown";
  }
}

function normalizeCarrier(raw: FmcsaRawCarrier): FmcsaCarrier {
  const allowed = (raw.allowedToOperate ?? "N").toString().toUpperCase();
  const statusCode = (raw as Record<string, unknown>).statusCode as string | undefined;
  const statusLabel = statusCodeLabel(statusCode);

  return {
    dotNumber: String(raw.dotNumber ?? ""),
    legalName: raw.legalName ?? "",
    dbaName: raw.dbaName ?? undefined,
    // allowedToOperate from FMCSA is Y/N but inactive carriers still show Y,
    // so also mark as not allowed when statusCode indicates inactive/revoked.
    allowedToOperate:
      (allowed === "Y" || allowed === "YES") &&
      !["Inactive", "Out of Service", "Revoked"].includes(statusLabel),
    operatingStatus: statusLabel,
    bipdInsuranceOnFile: raw.bipdInsuranceOnFile
      ? Number(raw.bipdInsuranceOnFile)
      : undefined,
    cargoInsuranceOnFile: raw.cargoInsuranceOnFile
      ? Number(raw.cargoInsuranceOnFile)
      : undefined,
    safetyRating: raw.safetyRating ?? undefined,
    safetyRatingDate: raw.safetyRatingDate ?? undefined,
    outOfServiceDate: raw.outOfServiceDate ?? undefined,
    phoneNumber: raw.telephoneNumber ?? undefined,
    mailingCity: raw.mailingCity ?? raw.phyCity ?? undefined,
    mailingState: raw.mailingState ?? raw.phyState ?? undefined
  };
}

/**
 * Legal entity type suffixes that should be ignored when comparing carrier names.
 * A carrier called "ALFRI EXPRESS LLC" and "ALFRI EXPRESS" are the same company.
 */
const ENTITY_SUFFIX_RE =
  /\b(LLC|L\.L\.C|INC|INCORPORATED|CORP|CORPORATION|LTD|LIMITED|LP|LLP|PLC|CO|COMPANY|ASSOCIATES?|ENTERPRISES?|GROUP|HOLDINGS?)\b\.?\s*$/i;

/**
 * Clean a carrier name for use as an FMCSA API search query:
 *   – strip all punctuation (periods, commas, etc.)
 *   – collapse whitespace
 * This prevents "LLC." from breaking the API path lookup.
 */
function cleanForSearch(name: string): string {
  return name
    .replace(/[.,;:!?'"()\[\]{}&]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalize a carrier name for similarity comparison:
 *   – clean punctuation
 *   – strip trailing entity type suffixes (LLC, Inc, Corp, …)
 *   – upper-case and split into tokens
 */
function normalizeForCompare(name: string): Set<string> {
  const cleaned = cleanForSearch(name)
    .replace(ENTITY_SUFFIX_RE, "")
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, "")
    .trim();
  return new Set(cleaned.split(/\s+/).filter(Boolean));
}

/** Jaccard similarity on normalized word tokens — 0..1 */
function nameSimilarity(a: string, b: string): number {
  const setA = normalizeForCompare(a);
  const setB = normalizeForCompare(b);
  const intersection = [...setA].filter((t) => setB.has(t)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

function scoreCarrier(
  carrier: FmcsaCarrier,
  searchedName?: string
): CarrierVerification {
  const base: Pick<CarrierVerification, "matchedName" | "searchedName"> = {
    matchedName: carrier.legalName || carrier.dbaName,
    searchedName
  };

  if (!carrier.allowedToOperate) {
    return {
      verified: true,
      authorized: false,
      carrier,
      ...base,
      alertLevel: "block",
      reason: "Carrier is NOT authorized to operate per FMCSA records."
    };
  }

  const status = carrier.operatingStatus.toUpperCase();
  if (status.includes("OUT-OF-SERVICE") || status.includes("REVOKED") || status.includes("INACTIVE")) {
    return {
      verified: true,
      authorized: false,
      carrier,
      ...base,
      alertLevel: "block",
      reason: `Carrier operating status: ${carrier.operatingStatus}.`
    };
  }

  const rating = (carrier.safetyRating ?? "").toUpperCase();
  if (rating === "UNSATISFACTORY") {
    return {
      verified: true,
      authorized: true,
      carrier,
      ...base,
      alertLevel: "warn",
      reason: "Carrier has an Unsatisfactory FMCSA safety rating."
    };
  }

  const hasInsurance =
    (carrier.bipdInsuranceOnFile ?? 0) > 0 ||
    (carrier.cargoInsuranceOnFile ?? 0) > 0;
  if (!hasInsurance) {
    return {
      verified: true,
      authorized: true,
      carrier,
      ...base,
      alertLevel: "warn",
      reason: "No insurance on file with FMCSA. Verify coverage before accepting."
    };
  }

  return {
    verified: true,
    authorized: true,
    carrier,
    ...base,
    alertLevel: "clear",
    reason: "Carrier is authorized and active per FMCSA records."
  };
}

async function lookupByDot(
  dotNumber: string,
  webKey: string
): Promise<FmcsaRawCarrier | null> {
  const url = `${FMCSA_BASE}/carriers/${encodeURIComponent(dotNumber)}?webKey=${webKey}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return null;
  const json = (await res.json()) as FmcsaApiResponse;
  return extractFirstCarrier(json);
}

async function fetchByName(
  query: string,
  webKey: string
): Promise<FmcsaRawCarrier[]> {
  const url = `${FMCSA_BASE}/carriers/name/${encodeURIComponent(query)}?webKey=${webKey}&size=10`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return [];
  const json = (await res.json()) as FmcsaApiResponse;
  return extractAllCarriers(json);
}

async function lookupByName(
  name: string,
  webKey: string
): Promise<{ raw: FmcsaRawCarrier; similarity: number } | null> {
  // Build a set of progressively-simplified queries to try in order:
  //   1. Punctuation-cleaned original  ("ALFRI EXPRESS LLC")
  //   2. Entity-suffix stripped         ("ALFRI EXPRESS")
  const cleaned    = cleanForSearch(name);
  const noSuffix   = cleaned.replace(ENTITY_SUFFIX_RE, "").trim();
  const queries    = [cleaned];
  if (noSuffix && noSuffix !== cleaned) queries.push(noSuffix);

  let candidates: FmcsaRawCarrier[] = [];
  for (const q of queries) {
    candidates = await fetchByName(q, webKey);
    if (candidates.length > 0) break;          // stop as soon as we get hits
  }
  if (candidates.length === 0) return null;

  // Score each candidate against both legalName and dbaName.
  // Similarity is computed on normalized names so entity suffixes are ignored.
  const scored = candidates
    .map((c) => {
      const simLegal = nameSimilarity(name, String(c.legalName ?? ""));
      const simDba   = nameSimilarity(name, String(c.dbaName   ?? ""));
      const statusCode = String((c as Record<string, unknown>).statusCode ?? "").toUpperCase();
      const isActive = statusCode === "A";
      return { raw: c, similarity: Math.max(simLegal, simDba), isActive };
    })
    .filter((s) => s.similarity >= 0.35);   // slightly lower floor now that we normalize

  if (scored.length === 0) return null;

  // Sort: highest similarity first, then prefer active carriers on ties
  scored.sort((a, b) => {
    if (b.similarity !== a.similarity) return b.similarity - a.similarity;
    return (b.isActive ? 1 : 0) - (a.isActive ? 1 : 0);
  });

  return { raw: scored[0].raw, similarity: scored[0].similarity };
}

async function lookupByMc(
  mcNumber: string,
  webKey: string
): Promise<FmcsaRawCarrier | null> {
  const url = `${FMCSA_BASE}/carriers/docket-number/${encodeURIComponent(mcNumber)}?webKey=${webKey}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    return null;
  }
  const json = (await res.json()) as FmcsaApiResponse;
  return extractFirstCarrier(json);
}

export async function POST(request: NextRequest) {
  const webKey = process.env.FMCSA_WEBKEY;
  if (!webKey) {
    return NextResponse.json(
      { error: "FMCSA_WEBKEY not configured." },
      { status: 500 }
    );
  }

  const body = (await request.json()) as {
    dotNumber?: string;
    mcNumber?: string;
    carrierName?: string;
  };

  const { dotNumber, mcNumber, carrierName } = body;

  if (!dotNumber && !mcNumber && !carrierName) {
    return NextResponse.json(
      { error: "Provide dotNumber, mcNumber, or carrierName." },
      { status: 400 }
    );
  }

  try {
    let raw: FmcsaRawCarrier | null = null;
    let matchSimilarity = 1; // exact for DOT/MC lookups

    if (dotNumber) {
      raw = await lookupByDot(dotNumber, webKey);
    }
    if (!raw && mcNumber) {
      raw = await lookupByMc(mcNumber, webKey);
    }
    if (!raw && carrierName) {
      const nameResult = await lookupByName(carrierName, webKey);
      if (nameResult) {
        raw = nameResult.raw;
        matchSimilarity = nameResult.similarity;
      }
    }

    if (!raw) {
      const verification: CarrierVerification = {
        verified: false,
        authorized: false,
        searchedName: carrierName,
        alertLevel: "warn",
        reason: `"${carrierName ?? dotNumber ?? mcNumber}" was not found in the FMCSA database. Verify carrier manually.`
      };
      return NextResponse.json({ verification });
    }

    const carrier = normalizeCarrier(raw);
    const verification = scoreCarrier(carrier, carrierName);

    // If the name match was weak, add a caveat to the reason
    if (matchSimilarity < 0.7 && carrierName) {
      verification.reason = `[Partial name match — ${Math.round(matchSimilarity * 100)}% similarity] ${verification.reason}`;
      if (verification.alertLevel === "clear") {
        verification.alertLevel = "warn";
      }
    }

    return NextResponse.json({ verification });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "FMCSA lookup failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
