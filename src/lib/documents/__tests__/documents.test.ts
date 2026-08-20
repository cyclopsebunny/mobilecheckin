import { describe, expect, it } from "vitest";
import {
  ANALYZED_DOCUMENT_TYPE,
  DOCUMENT_TYPES,
  documentTypeLabel,
  findAnalyzableDocument,
  formatFileSize,
  MAX_UPLOAD_BYTES,
  type UploadedDocument
} from "@/types/documents";

const doc = (id: string, docType: UploadedDocument["docType"]): UploadedDocument => ({
  id,
  fileName: `${id}.png`,
  docType,
  sizeBytes: 1024,
  fromPdf: false,
  image: {
    rawDataUrl: "",
    processedDataUrl: "",
    quadNormalized: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 }
    ]
  }
});

describe("findAnalyzableDocument", () => {
  it("picks the Bill of Lading, not whichever was uploaded first", () => {
    const docs = [doc("a", "invoice"), doc("b", "bol"), doc("c", "packing-list")];
    expect(findAnalyzableDocument(docs)?.id).toBe("b");
  });

  it("picks the first BOL when several are attached", () => {
    expect(findAnalyzableDocument([doc("a", "bol"), doc("b", "bol")])?.id).toBe("a");
  });

  it("returns undefined when no BOL is attached — Shipment ID alone must still work", () => {
    expect(findAnalyzableDocument([doc("a", "invoice"), doc("b", "packing-list")])).toBeUndefined();
  });

  it("returns undefined for an empty list", () => {
    expect(findAnalyzableDocument([])).toBeUndefined();
  });
});

describe("document type metadata", () => {
  it("only treats the BOL as analyzable", () => {
    expect(ANALYZED_DOCUMENT_TYPE).toBe("bol");
    expect(DOCUMENT_TYPES.filter((t) => t.value === ANALYZED_DOCUMENT_TYPE)).toHaveLength(1);
  });

  it("labels every type for the picker and list", () => {
    expect(DOCUMENT_TYPES.map((t) => t.label)).toEqual([
      "Bill of Lading",
      "Invoice",
      "Packing List"
    ]);
    expect(documentTypeLabel("packing-list")).toBe("Packing List");
  });

  it("caps uploads at the advertised 10 MB", () => {
    expect(MAX_UPLOAD_BYTES).toBe(10 * 1024 * 1024);
  });
});

describe("formatFileSize", () => {
  it("scales units", () => {
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(2048)).toBe("2 KB");
    expect(formatFileSize(3 * 1024 * 1024)).toBe("3.0 MB");
  });
});
