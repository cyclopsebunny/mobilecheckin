import { NextRequest, NextResponse } from "next/server";
import { normalizeExtractedData } from "@/lib/extraction/normalize";
import { getMissingRequiredPrompts } from "@/lib/validation/requiredFields";

export const runtime = "nodejs";

interface OpenAiMessage {
  role: "system" | "user";
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string; detail?: "auto" | "high" | "low" } }
      >;
}

async function callCloudExtractor(imageDataUrl: string): Promise<Record<string, unknown>> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      referenceLast5: "",
      confidence: 0.5,
      notes: "OPENAI_API_KEY missing, using fallback extraction."
    };
  }

  const messages: OpenAiMessage[] = [
    {
      role: "system",
      content: [
        "You are a Bill of Lading (BOL) document parser trained on 49 CFR § 373.101 and NMFC Uniform Straight BOL standards.",
        "Extract EVERY field you can VISUALLY READ from the document image. Return a single strict JSON object.",
        "CRITICAL RULES — follow them exactly:",
        "1. Use null for ANY field whose text is not clearly visible in this image. Do NOT guess, infer, or invent values.",
        "2. If you are not certain you can read a value directly from the image, return null — not a guess.",
        "3. Names especially: if you cannot read an exact name printed or handwritten in the image, return null. Do NOT generate plausible names.",
        "4. Only include fieldConfidence entries for values you DID return (non-null) but are less than 85% certain about.",
        "",
        "Required keys:",
        "referenceNumber (primary shipment reference), referenceLast5 (last 5 alphanumeric chars of referenceNumber),",
        "bolNumber (BOL/shipper reference number), proNumber (carrier PRO/tracking number),",
        "poNumber (buyer PO number), shipperReference (shipper internal order/job number), agentNumber (broker/agent ref),",
        "",
        "driverName (driver name from carrier signature or driver line),",
        "carrierName (FMCSA-registered motor carrier name),",
        "shipperName, shipperAddress (full street/city/state/zip),",
        "consigneeName, consigneeAddress (full street/city/state/zip),",
        "notifyParty (party to notify on arrival), thirdPartyBilling (name+address if freight billed to third party),",
        "",
        "originPoint (city/state where shipment originates — may differ from shipper address),",
        "destinationPoint (city/state of final delivery — may differ from consignee address),",
        "",
        "trailerNumber (trailer or container ID), sealNumber (security seal number),",
        "",
        "appointmentDate (YYYY-MM-DD), appointmentTime (HH:MM 24h),",
        "shipmentDate (YYYY-MM-DD — date freight tendered/picked up),",
        "pickupDate (YYYY-MM-DD), pickupTime (HH:MM 24h),",
        "deliveryDate (YYYY-MM-DD), deliveryTime (HH:MM 24h),",
        "",
        "commodity (plain-language description of goods),",
        "commodityNotation (SL&C / FAK / SWA / other notation),",
        "totalWeight (numeric value + unit, e.g. '4250 lbs'),",
        "pieces (total piece/package count), pallets (handling unit/pallet count),",
        "dimensions (L×W×H per handling unit or cubic feet),",
        "freightClass (NMFC class: 50/55/60/65/70/77.5/85/92.5/100/110/125/150/175/200/250/300/400/500),",
        "nmfc (NMFC item number, e.g. 116030-5),",
        "",
        "freightTerms (Prepaid / Collect / Third Party / COD),",
        "codAmount (COD dollar amount if applicable),",
        "declaredValue (declared or released value, e.g. '$5.00 per lb'),",
        "",
        "specialInstructions (accessorials: liftgate, inside delivery, residential, etc.),",
        "deliveryInstructions (appointment requirements, dock hours, gate codes, etc.),",
        "deliveryExceptions (OS&D notations: Over/Short/Damaged/Refused/Seal Broken),",
        "",
        "hazmat (true if any hazardous material present, false otherwise),",
        "hazmatProperShippingName (DOT proper shipping name per 49 CFR § 172.101),",
        "hazmatUnNumber (UN#### or NA#### format),",
        "hazmatHazardClass (DOT hazard class/division, e.g. '3' or '1.4'),",
        "hazmatPackingGroup (I / II / III),",
        "hazmatQuantity (total quantity + unit of measure),",
        "hazmatEmergencyContact (24-hour emergency phone number),",
        "",
        "shipperSignature (shipper/agent name if signed), carrierSignature (driver name if receipt signed),",
        "consigneeSignature (receiver name if delivery acknowledged),",
        "",
        "confidence (0.0–1.0 float — your certainty across all extracted fields),",
        "notes (legibility issues, ambiguous fields, or anything unusual about the document),",
        "fieldConfidence: object mapping field names to 0.0–1.0 confidence scores — include ONLY fields where you are less than 0.85 confident (i.e. the text was hard to read, smudged, ambiguous, inferred rather than clearly visible, or partially occluded). Omit fields that are clearly legible."
      ].join(" ")
    },
    {
      role: "user",
      content: [
        { type: "text", text: "Extract every visible field from this Bill of Lading. Be thorough — capture all reference numbers, addresses, freight details, hazmat information, and signatures present." },
        { type: "image_url", image_url: { url: imageDataUrl, detail: "high" } }
      ]
    }
  ];

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-4o",
      response_format: { type: "json_object" },
      messages,
      temperature: 0
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Cloud extraction failed: ${body}`);
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Cloud extraction returned empty response.");
  }
  return JSON.parse(content) as Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { imageDataUrl?: string };
    if (!body.imageDataUrl) {
      return NextResponse.json({ error: "imageDataUrl is required." }, { status: 400 });
    }

    const rawExtracted = await callCloudExtractor(body.imageDataUrl);
    const extracted = normalizeExtractedData(rawExtracted);
    const missingPrompts = getMissingRequiredPrompts({ ...extracted, method: "scan" });
    return NextResponse.json({
      extracted,
      missingPrompts
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Extraction failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
