import { NextRequest, NextResponse } from "next/server";
import { type CdlClass, type CdlEndorsement, type ExtractedCdlData } from "@/types/checkin";
import { validateCdl } from "@/lib/validation/validateCdl";

export const runtime = "nodejs";

const VALID_CDL_CLASSES: CdlClass[] = ["A", "B", "C"];
const VALID_ENDORSEMENTS: CdlEndorsement[] = ["H", "N", "T", "X", "P", "S"];

interface OpenAiMessage {
  role: "system" | "user";
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string; detail?: "auto" | "high" | "low" } }
      >;
}

function parseEndorsements(raw: unknown): CdlEndorsement[] {
  if (!raw) return [];
  const str =
    typeof raw === "string"
      ? raw
      : Array.isArray(raw)
      ? raw.join("")
      : String(raw);
  return str
    .toUpperCase()
    .split("")
    .filter((c): c is CdlEndorsement =>
      VALID_ENDORSEMENTS.includes(c as CdlEndorsement)
    );
}

function parseCdlClass(raw: unknown): CdlClass {
  if (!raw) return "Unknown";
  const str = String(raw).trim().toUpperCase();
  // Handle "CLASS A", "CLASS-A", "A", etc.
  const match = str.match(/\b([ABC])\b/);
  const letter = match?.[1] as CdlClass | undefined;
  return letter && VALID_CDL_CLASSES.includes(letter) ? letter : "Unknown";
}

/** Thrown when the server cannot extract at all, as opposed to reading nothing. */
class CdlExtractionUnavailable extends Error {}

async function extractCdlData(imageDataUrl: string): Promise<ExtractedCdlData> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // Same reasoning as the document route: a misconfigured server must not
    // masquerade as an unreadable licence.
    throw new CdlExtractionUnavailable(
      "CDL extraction is not configured on this server (OPENAI_API_KEY is missing)."
    );
  }

  const messages: OpenAiMessage[] = [
    {
      role: "system",
      content: [
        "You are a CDL (Commercial Driver's License) document parser.",
        "Extract the following fields from the license image and return strict JSON.",
        "CRITICAL: Only return values you can VISUALLY READ in the image. Use null for ANY field not clearly visible. Do NOT invent or guess names, numbers, or dates.",
        "Fields: fullName (string), licenseNumber (string), issuingState (2-letter abbreviation),",
        "cdlClass (single letter: A, B, or C), endorsements (string of endorsement letters, e.g. 'HN'),",
        "restrictions (string), expirationDate (MM/DD/YYYY), dateOfBirth (MM/DD/YYYY),",
        "confidence (0-1 float for overall image quality), notes (legibility issues or anything unusual).",
        "Return only the JSON object. Use null for any field you cannot clearly read from the image."
      ].join(" ")
    },
    {
      role: "user",
      content: [
        { type: "text", text: "Extract all CDL fields from this driver's license." },
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
    throw new Error(`CDL extraction failed: ${body}`);
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("CDL extraction returned empty response.");
  }

  const raw = JSON.parse(content) as Record<string, unknown>;

  const extracted: ExtractedCdlData = {
    fullName: raw.fullName ? String(raw.fullName) : undefined,
    licenseNumber: raw.licenseNumber ? String(raw.licenseNumber) : undefined,
    issuingState: raw.issuingState ? String(raw.issuingState).toUpperCase().slice(0, 2) : undefined,
    cdlClass: parseCdlClass(raw.cdlClass),
    endorsements: parseEndorsements(raw.endorsements),
    restrictions: raw.restrictions ? String(raw.restrictions) : undefined,
    expirationDate: raw.expirationDate ? String(raw.expirationDate) : undefined,
    dateOfBirth: raw.dateOfBirth ? String(raw.dateOfBirth) : undefined,
    confidence: raw.confidence ? Number(raw.confidence) : undefined,
    notes: raw.notes ? String(raw.notes) : undefined
  };

  return extracted;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      imageDataUrl?: string;
      driverName?: string;
    };

    if (!body.imageDataUrl) {
      return NextResponse.json({ error: "imageDataUrl is required." }, { status: 400 });
    }

    const extracted = await extractCdlData(body.imageDataUrl);
    const validation = validateCdl(extracted, body.driverName);

    return NextResponse.json({ extracted, validation });
  } catch (error) {
    const message = error instanceof Error ? error.message : "CDL extraction failed.";
    const status = error instanceof CdlExtractionUnavailable ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
