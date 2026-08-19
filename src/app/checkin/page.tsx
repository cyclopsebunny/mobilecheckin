"use client";

import {
  type ChangeEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { CameraCapture } from "@/components/camera/CameraCapture";
import { DocumentOutlinePreview, documentQuadKey } from "@/components/DocumentOutlinePreview";
import { ImageViewer } from "@/components/ImageViewer";
import { DocumentList } from "@/components/checkin/DocumentList";
import { DocumentTypeSheet } from "@/components/checkin/DocumentTypeSheet";
import { LicenseIcon, TrashIcon } from "@/components/checkin/icons";
import { dataUrlToBlob } from "@/lib/image/dataUrl";
import { buildUploadedDocument, UploadRejected } from "@/lib/documents/intake";
import { preprocessDocumentImage, type DocumentQuad, type ProcessedImageResult } from "@/lib/image/preprocess";
import { clearCaptures, readCaptures, stashCaptures } from "@/lib/checkin/captureStash";
import { saveGrantedSnapshot } from "@/lib/checkin/resultSnapshot";
import { matchAppointment } from "@/lib/matching/matchAppointment";
import { getMissingRequiredPrompts } from "@/lib/validation/requiredFields";
import {
  type CarrierVerification,
  type CdlValidation,
  type CheckinPayload,
  type ExtractedCdlData,
  type RequiredFieldPrompt
} from "@/types/checkin";
import {
  documentTypeLabel,
  findAnalyzableDocument,
  type DocumentType,
  type UploadedDocument
} from "@/types/documents";

type FlowStep =
  | "shipment-id"
  | "documents"
  | "edit-doc"
  | "cdl-scan"
  | "edit-cdl"
  | "analyzing"
  | "review";

/** Where an about-to-be-added document will come from. */
type UploadSource = "camera" | "gallery" | "file";

interface FieldDef {
  key: keyof CheckinPayload;
  label: string;
  required?: boolean;
  group: string;
}

const FIELD_DISPLAY: FieldDef[] = [
  // ── Reference Numbers ──────────────────────────────────────────
  { key: "referenceLast5",       label: "Reference Last 5",       required: true,  group: "Reference Numbers" },
  { key: "referenceNumber",      label: "Full Reference #",                         group: "Reference Numbers" },
  { key: "bolNumber",            label: "BOL #",                                    group: "Reference Numbers" },
  { key: "proNumber",            label: "PRO # (Carrier Tracking)",                 group: "Reference Numbers" },
  { key: "poNumber",             label: "PO #",                                     group: "Reference Numbers" },
  { key: "shipperReference",     label: "Shipper Reference #",                      group: "Reference Numbers" },
  { key: "agentNumber",          label: "Agent / Broker #",                         group: "Reference Numbers" },

  // ── Parties ────────────────────────────────────────────────────
  { key: "driverName",           label: "Driver Name",             required: true,  group: "Parties" },
  { key: "carrierName",          label: "Carrier",                 required: true,  group: "Parties" },
  { key: "shipperName",          label: "Shipper (Consignor)",                      group: "Parties" },
  { key: "shipperAddress",       label: "Shipper Address",                          group: "Parties" },
  { key: "consigneeName",        label: "Consignee",                                group: "Parties" },
  { key: "consigneeAddress",     label: "Consignee Address",                        group: "Parties" },
  { key: "notifyParty",          label: "Notify Party",                             group: "Parties" },
  { key: "thirdPartyBilling",    label: "Third-Party Billing",                      group: "Parties" },

  // ── Routing ────────────────────────────────────────────────────
  { key: "originPoint",          label: "Origin",                                   group: "Routing" },
  { key: "destinationPoint",     label: "Destination",                              group: "Routing" },

  // ── Equipment ──────────────────────────────────────────────────
  { key: "trailerNumber",        label: "Trailer / Container #",   required: true,  group: "Equipment" },
  { key: "sealNumber",           label: "Seal #",                                   group: "Equipment" },

  // ── Dates & Times ──────────────────────────────────────────────
  { key: "appointmentDate",      label: "Appointment Date",                         group: "Dates & Times" },
  { key: "appointmentTime",      label: "Appointment Time",                         group: "Dates & Times" },
  { key: "shipmentDate",         label: "Date of Shipment",                         group: "Dates & Times" },
  { key: "pickupDate",           label: "Pickup Date",                              group: "Dates & Times" },
  { key: "pickupTime",           label: "Pickup Time",                              group: "Dates & Times" },
  { key: "deliveryDate",         label: "Delivery Date",                            group: "Dates & Times" },
  { key: "deliveryTime",         label: "Delivery Time",                            group: "Dates & Times" },

  // ── Freight Details ────────────────────────────────────────────
  { key: "commodity",            label: "Commodity / Description",                  group: "Freight Details" },
  { key: "commodityNotation",    label: "Commodity Notation (SL&C, FAK…)",          group: "Freight Details" },
  { key: "totalWeight",          label: "Total Weight",                             group: "Freight Details" },
  { key: "pieces",               label: "Pieces / Packages",                        group: "Freight Details" },
  { key: "pallets",              label: "Pallets / Handling Units",                 group: "Freight Details" },
  { key: "dimensions",           label: "Dimensions / Volume",                      group: "Freight Details" },
  { key: "freightClass",         label: "NMFC Freight Class",                       group: "Freight Details" },
  { key: "nmfc",                 label: "NMFC Item #",                              group: "Freight Details" },

  // ── Financial ──────────────────────────────────────────────────
  { key: "freightTerms",         label: "Freight Terms",                            group: "Financial" },
  { key: "codAmount",            label: "COD Amount",                               group: "Financial" },
  { key: "declaredValue",        label: "Declared / Released Value",                group: "Financial" },

  // ── Instructions ───────────────────────────────────────────────
  { key: "specialInstructions",  label: "Special Instructions / Accessorials",      group: "Instructions" },
  { key: "deliveryInstructions", label: "Delivery Instructions",                    group: "Instructions" },
  { key: "deliveryExceptions",   label: "Delivery Exceptions (OS&D)",               group: "Instructions" },

  // ── Hazmat ─────────────────────────────────────────────────────
  { key: "hazmat",               label: "Hazardous Material",                       group: "Hazmat" },
  { key: "hazmatProperShippingName", label: "Proper Shipping Name",                 group: "Hazmat" },
  { key: "hazmatUnNumber",       label: "UN / NA Number",                           group: "Hazmat" },
  { key: "hazmatHazardClass",    label: "Hazard Class / Division",                  group: "Hazmat" },
  { key: "hazmatPackingGroup",   label: "Packing Group",                            group: "Hazmat" },
  { key: "hazmatQuantity",       label: "HazMat Quantity",                          group: "Hazmat" },
  { key: "hazmatEmergencyContact", label: "Emergency Contact (24h)",                group: "Hazmat" },

  // ── Signatures ─────────────────────────────────────────────────
  { key: "shipperSignature",     label: "Shipper Signature",                        group: "Signatures" },
  { key: "carrierSignature",     label: "Carrier / Driver Receipt",                 group: "Signatures" },
  { key: "consigneeSignature",   label: "Consignee / Delivery Acknowledgment",      group: "Signatures" },
];

function CameraIcon() {
  return (
    <svg
      width="54"
      height="54"
      viewBox="0 0 54 54"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M20.5 9L17.41 12H12C9.79 12 8 13.79 8 16V38C8 40.21 9.79 42 12 42H42C44.21 42 46 40.21 46 38V16C46 13.79 44.21 12 42 12H36.59L33.5 9H20.5ZM27 37C22.03 37 18 32.97 18 28C18 23.03 22.03 19 27 19C31.97 19 36 23.03 36 28C36 32.97 31.97 37 27 37Z"
        fill="#009CDE"
      />
      <circle cx="27" cy="28" r="6" fill="#009CDE" />
    </svg>
  );
}

function NavHeader({ onBack }: { onBack?: () => void }) {
  return (
    <header className="dp-nav">
      <button
        className="dp-nav-side dp-nav-back"
        type="button"
        onClick={onBack}
        aria-label="Back"
      >
        <svg width="10" height="18" viewBox="0 0 10 18" fill="none" aria-hidden="true">
          <path d="M9 1L1 9L9 17" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div className="dp-nav-logo">
        <Image src="/myQLogo.svg" alt="myQ" width={51.65} height={56} />
      </div>
      <button className="dp-nav-side dp-nav-menu" type="button" aria-label="Menu">
        <svg width="22" height="16" viewBox="0 0 22 16" fill="none" aria-hidden="true">
          <path d="M1 1H21M1 8H21M1 15H21" stroke="white" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
    </header>
  );
}

export default function CheckinPage() {
  const router = useRouter();

  const galleryInputRef = useRef<HTMLInputElement>(null);
  const d0 = useRef<HTMLInputElement>(null);
  const d1 = useRef<HTMLInputElement>(null);
  const d2 = useRef<HTMLInputElement>(null);
  const d3 = useRef<HTMLInputElement>(null);
  const d4 = useRef<HTMLInputElement>(null);
  const digitRefs = [d0, d1, d2, d3, d4];

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cdlGalleryRef = useRef<HTMLInputElement>(null);

  const [digits, setDigits] = useState(["", "", "", "", ""]);
  const [step, setStep] = useState<FlowStep>("shipment-id");
  const [showBolCamera, setShowBolCamera] = useState(false);
  const [showCdlCamera, setShowCdlCamera] = useState(false);
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  /** Add-button that was tapped; non-null while the type sheet is on screen. */
  const [pendingSource, setPendingSource] = useState<UploadSource | null>(null);
  /**
   * Type chosen for the upload now in flight. Mirrored in a ref because the
   * file-input change event can arrive before React re-renders.
   */
  const pendingTypeRef = useRef<DocumentType | null>(null);
  /** Which document the outline editor is currently adjusting. */
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [cdlCapture, setCdlCapture] = useState<ProcessedImageResult | null>(null);
  const [cdlExtracted, setCdlExtracted] = useState<ExtractedCdlData | null>(null);
  const [cdlValidation, setCdlValidation] = useState<CdlValidation | null>(null);
  /**
   * The CDL check needs a real state machine, not "validation is still null".
   * Any failure — non-OK response, missing validation, network error, timeout —
   * must land on "failed" so the badge stops spinning and offers a retry.
   */
  const [cdlCheck, setCdlCheck] = useState<"idle" | "checking" | "done" | "failed">("idle");
  const [cdlCheckError, setCdlCheckError] = useState<string | null>(null);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [isProcessingCdl, setIsProcessingCdl] = useState(false);
  const [payload, setPayload] = useState<Partial<CheckinPayload>>({});
  const [, setMissingPrompts] = useState<RequiredFieldPrompt[]>([]);
  const [carrierVerification, setCarrierVerification] = useState<CarrierVerification | null>(null);
  const [isVerifyingCarrier, setIsVerifyingCarrier] = useState(false);
  const carrierDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [fieldConfidence, setFieldConfidence] = useState<Record<string, number>>({});
  const [confirmedFields, setConfirmedFields] = useState<Set<string>>(new Set());
  const [viewerSrc, setViewerSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const documentsRef = useRef<UploadedDocument[]>([]);
  const cdlCaptureRef = useRef<ProcessedImageResult | null>(null);
  useEffect(() => {
    documentsRef.current = documents;
  }, [documents]);
  useEffect(() => {
    cdlCaptureRef.current = cdlCapture;
  }, [cdlCapture]);

  // Restore review state after returning from the no-match result page
  useEffect(() => {
    const raw = sessionStorage.getItem("checkin_review_resume");
    if (!raw) return;
    sessionStorage.removeItem("checkin_review_resume");
    try {
      const saved = JSON.parse(raw) as {
        payload: Partial<CheckinPayload>;
        fieldConfidence: Record<string, number>;
      };
      setPayload(saved.payload);
      setFieldConfidence(saved.fieldConfidence ?? {});
      // The images are too large for sessionStorage, so they ride along in a
      // module-level stash that survives the client-side navigation.
      const captures = readCaptures();
      if (captures) {
        setDocuments(captures.documents);
        setCdlCapture(captures.cdlCapture);
        setCdlExtracted(captures.cdlExtracted);
        setCdlValidation(captures.cdlValidation);
        // Only claim "done" if a result actually came back before we left.
        setCdlCheck(captures.cdlValidation ? "done" : "idle");
      }
      setStep("review");
    } catch {
      // ignore corrupt data
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Confidence thresholds
  const CONF_BLANK = 0.35;  // below this: already blanked by normalize
  const CONF_WARN  = 0.70;  // below this (≥ CONF_BLANK): flag for confirmation

  const reference = digits.join("").replace(/\s/g, "");
  const hasReference = reference.length === 5;
  // Shipment ID is required to leave the first screen. Documents are optional —
  // an uploaded BOL enriches the match but never gates it.
  const canContinueShipment = hasReference && !isProcessingImage;
  /** The one document we extract from: the first Bill of Lading, if any. */
  const analyzedDoc = findAnalyzableDocument(documents);

  function handleDigitChange(index: number, event: ChangeEvent<HTMLInputElement>) {
    const val = event.target.value.replace(/[^a-zA-Z0-9]/g, "").slice(-1).toUpperCase();
    const next = [...digits];
    next[index] = val;
    setDigits(next);
    setError(null);
    if (val && index < 4) {
      digitRefs[index + 1].current?.focus();
    }
  }

  function handleDigitKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      const prev = [...digits];
      prev[index - 1] = "";
      setDigits(prev);
      digitRefs[index - 1].current?.focus();
    }
  }

  /**
   * Intake step 1: the driver picked a type, so remember it and open the source
   * they tapped. Called synchronously from the sheet so the click still counts
   * as a user gesture — Safari refuses to open a file picker otherwise.
   */
  function startUpload(source: UploadSource, docType: DocumentType) {
    setError(null);
    pendingTypeRef.current = docType;
    if (source === "camera") {
      setShowBolCamera(true);
    } else if (source === "gallery") {
      galleryInputRef.current?.click();
    } else {
      fileInputRef.current?.click();
    }
  }

  /** Intake step 2a: a file came back from one of the pickers. */
  async function onDocumentFileChosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    const docType = pendingTypeRef.current;
    if (!file || !docType) {
      return;
    }
    pendingTypeRef.current = null;
    await addDocument(docType, { kind: "file", file });
  }

  /** Intake step 2b: a photo came back from the camera. */
  async function onDocumentCaptured(image: ProcessedImageResult) {
    const docType = pendingTypeRef.current;
    if (!docType) {
      return;
    }
    pendingTypeRef.current = null;
    await addDocument(docType, { kind: "capture", image });
  }

  async function addDocument(
    docType: DocumentType,
    intake: { kind: "file"; file: File } | { kind: "capture"; image: ProcessedImageResult }
  ) {
    setIsProcessingImage(true);
    setError(null);
    try {
      let doc: UploadedDocument;
      if (intake.kind === "file") {
        doc = await buildUploadedDocument(intake.file, docType);
      } else {
        // Already processed by CameraCapture with a live detection hint.
        doc = {
          id: crypto.randomUUID(),
          fileName: `capture-${documents.length + 1}.jpg`,
          docType,
          sizeBytes: intake.image.processedDataUrl.length,
          fromPdf: false,
          image: intake.image
        };
      }
      setDocuments((prev) => [...prev, doc]);

      // Confirm the crop for anything with a real scene in it. A rasterised PDF
      // page is already flat and deskewed, so there is nothing to adjust.
      if (!doc.fromPdf) {
        setEditingDocId(doc.id);
        setStep("edit-doc");
      }
    } catch (ex) {
      setError(
        ex instanceof UploadRejected
          ? ex.message
          : "Could not process that file. Please try again."
      );
    } finally {
      setIsProcessingImage(false);
    }
  }

  function removeDocument(id: string) {
    setDocuments((prev) => prev.filter((doc) => doc.id !== id));
    if (editingDocId === id) {
      setEditingDocId(null);
    }
  }

  function handleShipmentIdContinue() {
    setError(null);
    setStep("documents");
  }

  function handleDocumentsContinue() {
    setError(null);
    setStep("cdl-scan");
  }

  async function handleCdlContinue() {
    setError(null);

    if (!analyzedDoc) {
      // No Bill of Lading attached — match on the Shipment ID alone. Invoices and
      // packing lists are deliberately never read, so they cannot fill this in.
      const result = matchAppointment({
        method: "manual",
        referenceLast5: reference.toUpperCase()
      });
      if (result.matched && result.appointment) {
        persistGrantedBol(result.appointment.id, {
          method: "manual",
          referenceLast5: reference.toUpperCase()
        } as CheckinPayload);
        const dock = encodeURIComponent(result.appointment.dockNumber);
        const aptId = encodeURIComponent(result.appointment.id);
        router.push(`/checkin/result?status=granted&dock=${dock}&appointmentId=${aptId}`);
      } else {
        router.push("/checkin/result?status=contact");
      }
      return;
    }

    if (analyzedDoc) {
      setStep("analyzing");
      try {
        const response = await fetch("/api/extract-document", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageDataUrl: analyzedDoc.image.processedDataUrl })
        });
        const json = (await response.json()) as {
          extracted?: Partial<CheckinPayload>;
          missingPrompts?: RequiredFieldPrompt[];
          error?: string;
        };
        if (!response.ok) {
          throw new Error(json.error ?? "Extraction failed.");
        }
        const nextPayload = { ...json.extracted, method: "scan" as const };
        setPayload(nextPayload);
        setMissingPrompts(json.missingPrompts ?? getMissingRequiredPrompts(nextPayload));
        setFieldConfidence((json.extracted?.fieldConfidence as Record<string, number>) ?? {});
        setConfirmedFields(new Set());

        // Fire CDL verification if we captured one
        if (cdlCapture) {
          verifyCdl(cdlCapture.processedDataUrl, nextPayload.driverName);
        }

        // Fire carrier verification in the background if we have a carrier name
        if (nextPayload.carrierName) {
          verifyCarrier(nextPayload.carrierName);
        }

        setStep("review");
      } catch (ex) {
        setError(ex instanceof Error ? ex.message : "Extraction failed.");
        setStep("documents");
      }
    }
  }

  async function handleCdlFileSelected(file: File) {
    setIsProcessingCdl(true);
    setError(null);
    try {
      const processed = await preprocessDocumentImage(file);
      setCdlCapture(processed);
      // Detection on a licence is often wrong, so show the outline for
      // confirmation before returning to the CDL screen.
      setStep("edit-cdl");
    } catch {
      setError("Could not process the CDL image. Please try again.");
    } finally {
      setIsProcessingCdl(false);
    }
  }

  async function onCdlInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    await handleCdlFileSelected(file);
    event.target.value = "";
  }

  const verifyCdl = useCallback((imageDataUrl: string, driverName?: string) => {
    setCdlCheck("checking");
    setCdlCheckError(null);
    setCdlValidation(null);

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 45_000);

    fetch("/api/extract-cdl", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageDataUrl, driverName }),
      signal: controller.signal
    })
      .then(async (response) => {
        // Read as text first so a response without a verdict can be reported
        // verbatim — "no verdict" alone gives nothing to debug with.
        const bodyText = await response.text();
        let data: {
          extracted?: ExtractedCdlData;
          validation?: CdlValidation;
          error?: string;
        } = {};
        let readable = true;
        try {
          data = JSON.parse(bodyText);
        } catch {
          readable = false;
        }
        if (!response.ok) {
          throw new Error(data.error ?? `The CDL check failed (HTTP ${response.status}).`);
        }
        if (!data.validation) {
          const excerpt = bodyText.trim().slice(0, 140) || "(empty body)";
          throw new Error(
            `${readable ? "No verdict" : "Unreadable response"} from the CDL check ` +
              `(HTTP ${response.status}). Server said: ${excerpt}`
          );
        }
        if (data.extracted) {
          setCdlExtracted(data.extracted);
          // Merge CDL fields into the payload where the BOL left gaps
          setPayload((prev) => {
            const merged = { ...prev };
            if (!merged.driverName && data.extracted?.fullName) {
              merged.driverName = data.extracted.fullName;
            }
            setMissingPrompts(getMissingRequiredPrompts(merged as CheckinPayload));
            return merged;
          });
        }
        setCdlValidation(data.validation);
        setCdlCheck("done");
      })
      .catch((ex: unknown) => {
        const aborted = ex instanceof DOMException && ex.name === "AbortError";
        setCdlCheckError(
          aborted
            ? "The CDL check timed out."
            : ex instanceof Error
              ? ex.message
              : "The CDL check could not be completed."
        );
        setCdlCheck("failed");
      })
      .finally(() => window.clearTimeout(timeout));
  }, []);

  const verifyCarrier = useCallback((name: string) => {
    if (!name.trim()) return;
    setIsVerifyingCarrier(true);
    setCarrierVerification(null);
    fetch("/api/verify-carrier", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ carrierName: name.trim() })
    })
      .then((r) => r.json() as Promise<{ verification?: CarrierVerification }>)
      .then((data) => { if (data.verification) setCarrierVerification(data.verification); })
      .catch(() => {/* non-fatal */})
      .finally(() => setIsVerifyingCarrier(false));
  }, []);

  function updateField(key: keyof CheckinPayload, value: string | boolean | undefined) {
    setPayload((prev) => {
      const updated = { ...prev, [key]: value === "" ? undefined : value };
      setMissingPrompts(getMissingRequiredPrompts(updated as CheckinPayload));
      return updated;
    });
    // Editing a field counts as manual confirmation
    const k = key as string;
    if (fieldConfidence[k] !== undefined && fieldConfidence[k] < CONF_WARN) {
      setConfirmedFields((prev) => new Set(prev).add(k));
    }
    // Re-run carrier check when the carrier name is edited (debounced 1.2 s)
    if (key === "carrierName" && typeof value === "string") {
      if (carrierDebounceRef.current) clearTimeout(carrierDebounceRef.current);
      if (value.trim().length >= 3) {
        carrierDebounceRef.current = setTimeout(() => verifyCarrier(value), 1200);
      } else {
        setCarrierVerification(null);
        setIsVerifyingCarrier(false);
      }
    }
  }

  function toggleConfirmed(key: string, confirmed: boolean) {
    setConfirmedFields((prev) => {
      const next = new Set(prev);
      if (confirmed) next.add(key); else next.delete(key);
      return next;
    });
  }

  async function reprocessDocumentWithQuad(nextQuad: DocumentQuad) {
    const target = documentsRef.current.find((doc) => doc.id === editingDocId);
    if (!target) {
      return;
    }
    setIsProcessingImage(true);
    setError(null);
    try {
      const blob = await dataUrlToBlob(target.image.rawDataUrl);
      const processed = await preprocessDocumentImage(blob, {
        quadHintNormalized: nextQuad
      });
      const savedScroll = window.scrollY;
      setDocuments((prev) =>
        prev.map((doc) => (doc.id === target.id ? { ...doc, image: processed } : doc))
      );
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.scrollTo({ top: savedScroll, behavior: "instant" });
        });
      });
    } catch {
      setError("Could not update crop. Please try again.");
    } finally {
      setIsProcessingImage(false);
    }
  }

  async function reprocessCdlWithQuad(nextQuad: DocumentQuad) {
    const prev = cdlCaptureRef.current;
    if (!prev) {
      return;
    }
    setIsProcessingCdl(true);
    setError(null);
    try {
      const blob = await dataUrlToBlob(prev.rawDataUrl);
      const processed = await preprocessDocumentImage(blob, {
        quadHintNormalized: nextQuad
      });
      const savedScroll = window.scrollY;
      setCdlCapture(processed);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.scrollTo({ top: savedScroll, behavior: "instant" });
        });
      });
    } catch {
      setError("Could not update CDL crop. Please try again.");
    } finally {
      setIsProcessingCdl(false);
    }
  }

  function persistGrantedBol(appointmentId: string, bolPayload: Partial<CheckinPayload>) {
    const { method: _method, fieldConfidence: _fieldConfidence, ...bol } = bolPayload as CheckinPayload;
    void _method;
    void _fieldConfidence;
    saveGrantedSnapshot({
      appointmentId,
      bol
    });
  }

  function runMatch() {
    const result = matchAppointment(payload);
    if (result.matched && result.appointment) {
      persistGrantedBol(result.appointment.id, payload as CheckinPayload);
      const dock = encodeURIComponent(result.appointment.dockNumber);
      const aptId = encodeURIComponent(result.appointment.id);
      router.push(`/checkin/result?status=granted&dock=${dock}&appointmentId=${aptId}`);
    } else {
      sessionStorage.setItem(
        "checkin_review_resume",
        JSON.stringify({ payload, fieldConfidence })
      );
      stashCaptures({ documents, cdlCapture, cdlExtracted, cdlValidation });
      router.push("/checkin/result?status=contact");
    }
  }

  function resetFlow() {
    setStep("shipment-id");
    setDigits(["", "", "", "", ""]);
    setShowBolCamera(false);
    setShowCdlCamera(false);
    setDocuments([]);
    clearCaptures();
    setPendingSource(null);
    pendingTypeRef.current = null;
    setEditingDocId(null);
    setCdlCapture(null);
    setCdlExtracted(null);
    setCdlValidation(null);
    setCdlCheck("idle");
    setCdlCheckError(null);
    setPayload({});
    setMissingPrompts([]);
    setCarrierVerification(null);
    setIsVerifyingCarrier(false);
    setFieldConfidence({});
    setConfirmedFields(new Set());
    setViewerSrc(null);
    setError(null);
  }

  if (step === "edit-doc") {
    const editing = documents.find((doc) => doc.id === editingDocId);
    const backToList = () => {
      setEditingDocId(null);
      setStep("documents");
    };
    return (
      <div className="dp-shell">
        <NavHeader onBack={backToList} />
        <div className="dp-layout">
          <div className="dp-card">
            <h2 className="dp-section-title">Adjust Document Outline</h2>
            <p className="dp-hint">
              {editing
                ? `Drag the corners to fit ${documentTypeLabel(editing.docType)}.`
                : "Drag the corners to fit your document."}
            </p>
            {editing ? (
              <DocumentOutlinePreview
                key={documentQuadKey(editing.image.quadNormalized)}
                rawDataUrl={editing.image.rawDataUrl}
                quad={editing.image.quadNormalized}
                editable
                adjustDisabled={isProcessingImage}
                onQuadCommit={reprocessDocumentWithQuad}
              />
            ) : null}
            {error ? <p className="dp-error">{error}</p> : null}
            <div className="dp-button-group">
              <button
                className="dp-frameless-btn"
                type="button"
                disabled={isProcessingImage}
                onClick={() => {
                  if (editing) {
                    removeDocument(editing.id);
                  }
                  backToList();
                }}
              >
                Cancel
              </button>
              <button
                className="dp-continue-btn"
                type="button"
                disabled={isProcessingImage}
                onClick={backToList}
              >
                {isProcessingImage ? "Processing…" : "Save Document"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (step === "edit-cdl") {
    return (
      <div className="dp-shell">
        <NavHeader onBack={() => setStep("cdl-scan")} />
        <div className="dp-layout">
          <div className="dp-card">
            <h2 className="dp-section-title">Adjust License Outline</h2>
            <p className="dp-hint">Drag the corners to fit your license.</p>
            {cdlCapture ? (
              <DocumentOutlinePreview
                key={documentQuadKey(cdlCapture.quadNormalized)}
                rawDataUrl={cdlCapture.rawDataUrl}
                quad={cdlCapture.quadNormalized}
                editable
                adjustDisabled={isProcessingCdl}
                onQuadCommit={reprocessCdlWithQuad}
              />
            ) : null}
            {error ? <p className="dp-error">{error}</p> : null}
            <div className="dp-button-group">
              <button
                className="dp-frameless-btn"
                type="button"
                disabled={isProcessingCdl}
                onClick={() => {
                  setCdlCapture(null);
                  setStep("cdl-scan");
                }}
              >
                Cancel
              </button>
              <button
                className="dp-continue-btn"
                type="button"
                disabled={isProcessingCdl}
                onClick={() => setStep("cdl-scan")}
              >
                {isProcessingCdl ? "Processing…" : "Save License"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (step === "cdl-scan") {
    return (
      <div className="dp-shell">
        <NavHeader onBack={() => setStep("documents")} />
        <div className="dp-layout">
          <div className="dp-card">
            <div className="dp-dockpass-logo">
              <Image src="/DockpassLogo.svg" alt="DockPass" width={334} height={59} style={{ width: "100%", height: 59 }} />
            </div>

            <h2 className="dp-section-title">Scan Driver&apos;s CDL</h2>
            <p className="dp-hint">
              Take a photo of your Commercial Driver&apos;s License. We&apos;ll
              verify your class, endorsements, and expiration date.
            </p>

            <div className="dp-camera-area">
              <button
                className="dp-camera-box"
                type="button"
                onClick={() => (cdlCapture ? setStep("edit-cdl") : setShowCdlCamera(true))}
                disabled={isProcessingCdl}
                aria-label={cdlCapture ? "Adjust the licence outline" : "Open camera to scan CDL"}
              >
                {isProcessingCdl ? (
                  <div className="dp-spinner" />
                ) : cdlCapture ? (
                  <Image
                    src={cdlCapture.processedDataUrl}
                    alt="Captured CDL thumbnail"
                    width={300}
                    height={200}
                    unoptimized
                    style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 4 }}
                  />
                ) : (
                  <div className="dp-cdl-icon">
                    <svg width="54" height="38" viewBox="0 0 54 38" fill="none" aria-hidden="true">
                      <rect x="2" y="2" width="50" height="34" rx="4" stroke="#009CDE" strokeWidth="2.5" fill="none" />
                      <circle cx="14" cy="16" r="6" fill="#009CDE" opacity="0.3" />
                      <circle cx="14" cy="16" r="4" fill="#009CDE" />
                      <rect x="24" y="11" width="20" height="3" rx="1.5" fill="#009CDE" />
                      <rect x="24" y="17" width="14" height="3" rx="1.5" fill="#009CDE" opacity="0.6" />
                      <rect x="6" y="27" width="42" height="3" rx="1.5" fill="#009CDE" opacity="0.3" />
                    </svg>
                  </div>
                )}
              </button>
            </div>

            <button
              className="dp-frameless-btn"
              type="button"
              onClick={() => cdlGalleryRef.current?.click()}
              disabled={isProcessingCdl}
            >
              Select from camera roll
            </button>

            <input
              ref={cdlGalleryRef}
              type="file"
              accept="image/*"
              onChange={onCdlInputChange}
              style={{ display: "none" }}
            />

            {cdlCapture ? (
              <ul className="dp-doc-list" aria-label="Captured driver's license">
                <li className="dp-doc-row">
                  <span className="dp-doc-row-icon">
                    <LicenseIcon />
                  </span>
                  <button
                    className="dp-doc-row-main"
                    type="button"
                    onClick={() => setStep("edit-cdl")}
                    disabled={isProcessingCdl}
                  >
                    <span className="dp-doc-row-name">Driver&apos;s License</span>
                  </button>
                  <span className="dp-doc-row-type">Adjust</span>
                  <button
                    className="dp-doc-row-remove"
                    type="button"
                    onClick={() => setCdlCapture(null)}
                    disabled={isProcessingCdl}
                    aria-label="Remove driver's license"
                  >
                    <TrashIcon />
                  </button>
                </li>
              </ul>
            ) : null}

            {showCdlCamera ? (
              <CameraCapture
                title="driver's license"
                onDocumentReady={(result) => {
                  setCdlCapture(result);
                  setShowCdlCamera(false);
                  setStep("edit-cdl");
                }}
                onClose={() => setShowCdlCamera(false)}
              />
            ) : null}

            {error ? <p className="dp-error">{error}</p> : null}

            <div className="dp-continue-area">
              <button
                className="dp-continue-btn"
                type="button"
                onClick={handleCdlContinue}
                disabled={isProcessingCdl}
              >
                {cdlCapture ? "Continue" : "Skip"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (step === "analyzing") {
    return (
      <div className="dp-shell">
        <NavHeader onBack={resetFlow} />
        <div className="dp-layout">
          <div className="dp-card dp-card-center">
            <div className="dp-spinner" />
            <p className="dp-analyzing-text">Analyzing document…</p>
          </div>
        </div>
      </div>
    );
  }

  if (step === "review") {
    const missing = getMissingRequiredPrompts(payload as CheckinPayload);

    // Any uncertain required field that hasn't been confirmed yet blocks matching
    const unconfirmedRequired = FIELD_DISPLAY
      .filter((f) => f.required)
      .filter((f) => {
        const conf = fieldConfidence[f.key as string];
        return conf !== undefined && conf >= CONF_BLANK && conf < CONF_WARN && !confirmedFields.has(f.key as string);
      });
    const complete = missing.length === 0 && unconfirmedRequired.length === 0;

    // Build grouped field structure
    const groups: string[] = [];
    const byGroup: Record<string, FieldDef[]> = {};
    for (const f of FIELD_DISPLAY) {
      if (!byGroup[f.group]) {
        byGroup[f.group] = [];
        groups.push(f.group);
      }
      byGroup[f.group].push(f);
    }

    return (
      <>
        {viewerSrc ? (
          <ImageViewer
            src={viewerSrc}
            alt="Scanned document"
            onClose={() => setViewerSrc(null)}
          />
        ) : null}

        <div className="dp-shell">
          <NavHeader onBack={() => setStep("cdl-scan")} />
          <div className="dp-layout">
            <div className="dp-card">
              <div className="dp-dockpass-logo">
                <Image src="/DockpassLogo.svg" alt="DockPass" width={334} height={59} style={{ width: "100%", height: 59 }} />
              </div>

              <h2 className="dp-section-title">Extracted Information</h2>
              <p className="dp-hint" style={{ marginTop: 0 }}>
                All fields are editable. Tap any value to correct it.
              </p>

              {/* Clickable thumbnail */}
              {analyzedDoc ? (
                <button
                  className="dp-doc-preview dp-doc-preview-btn"
                  type="button"
                  onClick={() => setViewerSrc(analyzedDoc.image.processedDataUrl)}
                  aria-label="Open full-screen document preview"
                >
                  <Image
                    src={analyzedDoc.image.processedDataUrl}
                    alt="Processed document — tap to enlarge"
                    width={500}
                    height={700}
                    unoptimized
                    style={{ width: "100%", height: "auto", display: "block" }}
                  />
                  <span className="dp-preview-hint">Tap to enlarge</span>
                </button>
              ) : null}

              {/* Grouped editable fields */}
              {groups.map((group) => {
                const fields = byGroup[group];
                const hasAny = fields.some((f) => {
                  const v = payload[f.key];
                  return v !== undefined && v !== null && v !== "";
                });
                const hasRequired = fields.some((f) => f.required);
                if (!hasAny && !hasRequired) return null;
                return (
                  <div key={group} className="dp-field-group">
                    <h3 className="dp-field-group-title">{group}</h3>
                    <div className="dp-field-list">
                      {fields.map(({ key, label, required }) => {
                        const val = payload[key];
                        const hasValue = val !== undefined && val !== null && val !== "";
                        if (!hasValue && !required) return null;

                        const keyStr = key as string;
                        const conf = fieldConfidence[keyStr] ?? 1;
                        const isUncertain = conf >= CONF_BLANK && conf < CONF_WARN;
                        const isConfirmed = confirmedFields.has(keyStr);

                        // Boolean field (hazmat)
                        if (key === "hazmat") {
                          return (
                            <div key={key} className="dp-field-row dp-field-row-edit">
                              <span className="dp-field-label">
                                {required ? <span className="dp-required-star">*</span> : null}
                                {label}
                              </span>
                              <select
                                className="dp-field-select"
                                value={val === true ? "yes" : val === false ? "no" : ""}
                                onChange={(e) =>
                                  updateField(key, e.target.value === "yes" ? true : e.target.value === "no" ? false : undefined)
                                }
                              >
                                <option value="">Unknown</option>
                                <option value="yes">Yes</option>
                                <option value="no">No</option>
                              </select>
                            </div>
                          );
                        }

                        // String field
                        const strVal = typeof val === "number"
                          ? `${Math.round(val * 100)}%`
                          : (val as string | undefined) ?? "";

                        const rowClass = [
                          "dp-field-row dp-field-row-edit",
                          required && !strVal ? " dp-field-row-missing" : "",
                          isUncertain && !isConfirmed ? " dp-field-row-uncertain" : ""
                        ].join("");

                        return (
                          <div key={key} className={rowClass}>
                            <span className="dp-field-label">
                              {required ? <span className="dp-required-star">*</span> : null}
                              {label}
                            </span>
                            <input
                              className={`dp-field-input${isUncertain && !isConfirmed ? " dp-field-input-uncertain" : ""}`}
                              type="text"
                              value={strVal}
                              placeholder={required ? "Required" : "—"}
                              onChange={(e) => updateField(key, e.target.value)}
                            />
                            {isUncertain && !isConfirmed ? (
                              <div className="dp-conf-row">
                                <label className="dp-conf-label">
                                  <input
                                    type="checkbox"
                                    className="dp-conf-checkbox"
                                    checked={false}
                                    onChange={(e) => toggleConfirmed(keyStr, e.target.checked)}
                                  />
                                  Confirm this value is correct
                                </label>
                                <p className="dp-conf-hint">
                                  AI confidence is low — please verify or correct before continuing.
                                </p>
                              </div>
                            ) : isUncertain && isConfirmed ? (
                              <div className="dp-conf-row">
                                <label className="dp-conf-label dp-conf-label-confirmed">
                                  <input
                                    type="checkbox"
                                    className="dp-conf-checkbox"
                                    checked={true}
                                    onChange={(e) => toggleConfirmed(keyStr, e.target.checked)}
                                  />
                                  Confirmed
                                </label>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Verification badges */}
              {isVerifyingCarrier ? (
                <div className="dp-carrier-badge dp-carrier-checking">
                  <div className="dp-carrier-spinner" />
                  <span>
                    Verifying &ldquo;{(payload.carrierName ?? "carrier")}&rdquo; with FMCSA…
                  </span>
                </div>
              ) : carrierVerification ? (
                <div className={`dp-carrier-badge dp-carrier-${carrierVerification.alertLevel}`} role="status">
                  <span className="dp-carrier-icon">
                    {carrierVerification.alertLevel === "clear" ? "✓" : carrierVerification.alertLevel === "warn" ? "⚠" : "✕"}
                  </span>
                  <div className="dp-carrier-text">
                    <strong>FMCSA Check</strong>
                    {/* Always show what name was searched */}
                    {carrierVerification.searchedName ? (
                      <span className="dp-carrier-detail">
                        Searched: &ldquo;{carrierVerification.searchedName}&rdquo;
                      </span>
                    ) : null}
                    {/* Show matched name when it differs from searched */}
                    {carrierVerification.matchedName &&
                     carrierVerification.matchedName !== carrierVerification.searchedName ? (
                      <span className="dp-carrier-detail" style={{ fontStyle: "italic" }}>
                        Matched: &ldquo;{carrierVerification.matchedName}&rdquo;
                      </span>
                    ) : null}
                    <span>{carrierVerification.reason}</span>
                    {carrierVerification.carrier ? (
                      <span className="dp-carrier-detail">
                        {carrierVerification.carrier.dotNumber ? `DOT #${carrierVerification.carrier.dotNumber}` : "DOT # not on file"}
                        {carrierVerification.carrier.operatingStatus ? ` · ${carrierVerification.carrier.operatingStatus}` : ""}
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {cdlCapture && cdlCheck === "done" && cdlValidation ? (
                <div className={`dp-carrier-badge dp-carrier-${cdlValidation.alertLevel}`} role="status">
                  <span className="dp-carrier-icon">
                    {cdlValidation.alertLevel === "clear" ? "✓" : cdlValidation.alertLevel === "warn" ? "⚠" : "✕"}
                  </span>
                  <div className="dp-carrier-text">
                    <strong>CDL Check</strong>
                    <span>{cdlValidation.reason}</span>
                    {cdlExtracted?.licenseNumber ? (
                      <span className="dp-carrier-detail">
                        {cdlExtracted.issuingState ?? ""} #{cdlExtracted.licenseNumber}
                        {cdlExtracted.expirationDate ? ` · Exp ${cdlExtracted.expirationDate}` : ""}
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {cdlCapture && cdlCheck === "checking" ? (
                <div className="dp-carrier-badge dp-carrier-checking" role="status">
                  <div className="dp-carrier-spinner" />
                  <span>Verifying CDL…</span>
                </div>
              ) : null}

              {cdlCapture && (cdlCheck === "failed" || cdlCheck === "idle") ? (
                <div className="dp-carrier-badge dp-carrier-block" role="status">
                  <span className="dp-carrier-icon">✕</span>
                  <div className="dp-carrier-text">
                    <strong>CDL not verified</strong>
                    <span>{cdlCheckError ?? "The licence has not been checked yet."}</span>
                    <button
                      className="dp-carrier-retry"
                      type="button"
                      onClick={() => verifyCdl(cdlCapture.processedDataUrl, payload.driverName)}
                    >
                      Retry CDL check
                    </button>
                  </div>
                </div>
              ) : null}

              {missing.length > 0 ? (
                <p className="dp-missing-banner" style={{ marginTop: "0.75rem" }}>
                  {missing.map((p) => p.label).join(", ")} {missing.length === 1 ? "is" : "are"} required — fill{missing.length === 1 ? "" : " them"} in above before continuing.
                </p>
              ) : null}
              {unconfirmedRequired.length > 0 && missing.length === 0 ? (
                <p className="dp-missing-banner dp-missing-banner-warn" style={{ marginTop: "0.75rem" }}>
                  Please confirm the highlighted required field{unconfirmedRequired.length > 1 ? "s" : ""} above before continuing.
                </p>
              ) : null}

              {error ? <p className="dp-error">{error}</p> : null}

              <div className="dp-button-group">
                <button
                  className="dp-continue-btn"
                  type="button"
                  onClick={runMatch}
                  disabled={!complete}
                >
                  Match Appointment
                </button>
                <button className="dp-frameless-btn" type="button" onClick={resetFlow}>
                  Start Over
                </button>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (step === "documents") {
    return (
      <div className="dp-shell">
        <NavHeader onBack={() => setStep("shipment-id")} />
        <div className="dp-layout">
          <div className="dp-card">
            <div className="dp-dockpass-logo">
              <Image src="/DockpassLogo.svg" alt="DockPass" width={334} height={59} style={{ width: "100%", height: 59 }} />
            </div>

            <h2 className="dp-section-title">Upload Documents</h2>
            <p className="dp-hint">
              Add the BOL or other shipment documents. Supported formats:{" "}
              <strong>PNG, JPG</strong>, and <strong>PDF</strong> — max file size is{" "}
              <strong>10 MB</strong>.
            </p>

            <div className="dp-camera-area">
              <button
                className="dp-camera-box"
                type="button"
                onClick={() => setPendingSource("camera")}
                disabled={isProcessingImage}
                aria-label="Add a document with the camera"
              >
                {isProcessingImage ? <div className="dp-spinner" /> : <CameraIcon />}
              </button>
            </div>

            <button
              className="dp-frameless-btn"
              type="button"
              onClick={() => setPendingSource("gallery")}
              disabled={isProcessingImage}
            >
              Select a photo from camera roll
            </button>

            <button
              className="dp-frameless-btn"
              type="button"
              onClick={() => setPendingSource("file")}
              disabled={isProcessingImage}
            >
              Select a file from the Phone
            </button>

            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              onChange={onDocumentFileChosen}
              style={{ display: "none" }}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,application/pdf"
              onChange={onDocumentFileChosen}
              style={{ display: "none" }}
            />

            <DocumentList
              documents={documents}
              onRemove={removeDocument}
              onOpen={(id) => {
                const target = documents.find((doc) => doc.id === id);
                // PDFs have no outline to adjust.
                if (target && !target.fromPdf) {
                  setEditingDocId(id);
                  setStep("edit-doc");
                }
              }}
              disabled={isProcessingImage}
            />

            {documents.some((doc) => doc.fromPdf && (doc.pageCount ?? 1) > 1) ? (
              <p className="dp-doc-pdf-note">
                Only the first page of a multi-page PDF is read.
              </p>
            ) : null}

            {showBolCamera ? (
              <CameraCapture
                title="document"
                onDocumentReady={(result) => {
                  setShowBolCamera(false);
                  void onDocumentCaptured(result);
                }}
                onClose={() => {
                  setShowBolCamera(false);
                  pendingTypeRef.current = null;
                }}
              />
            ) : null}

            {pendingSource ? (
              <DocumentTypeSheet
                onSelect={(docType) => startUpload(pendingSource, docType)}
                onDismiss={() => setPendingSource(null)}
              />
            ) : null}

            {error ? <p className="dp-error">{error}</p> : null}

            <div className="dp-continue-area">
              <button
                className="dp-continue-btn"
                type="button"
                onClick={handleDocumentsContinue}
                disabled={isProcessingImage}
              >
                {documents.length === 0 ? "Skip" : "Continue"}
              </button>
            </div>
          </div>
        </div>
        <div className="dp-home-indicator" />
      </div>
    );
  }

  // ── Step 1: Shipment ID on its own screen. Required before continuing.
  return (
    <div className="dp-shell">
      <NavHeader onBack={() => router.push("/")} />
      <div className="dp-layout">
        <div className="dp-card">
          <div className="dp-dockpass-logo">
            <Image src="/DockpassLogo.svg" alt="DockPass" width={334} height={59} style={{ width: "100%", height: 59 }} />
          </div>

          <h2 className="dp-section-title">Last 5 characters of the Shipment ID</h2>

          <div className="dp-otp-row">
            {digits.map((digit, i) => (
              <input
                key={i}
                ref={digitRefs[i]}
                className="dp-otp-box"
                type="text"
                inputMode="text"
                maxLength={1}
                value={digit}
                onChange={(e) => handleDigitChange(i, e)}
                onKeyDown={(e) => handleDigitKeyDown(i, e)}
                aria-label={`Character ${i + 1} of 5`}
              />
            ))}
          </div>

          <p className="dp-hint">
            Enter the last 5 characters of the Shipment ID, PO Number, BOL, or
            any other reference number you have available.
          </p>

          {error ? <p className="dp-error">{error}</p> : null}

          <div className="dp-continue-area">
            <button
              className="dp-continue-btn"
              type="button"
              onClick={handleShipmentIdContinue}
              disabled={!canContinueShipment}
            >
              Continue
            </button>
          </div>
        </div>
      </div>
      <div className="dp-home-indicator" />
    </div>
  );
}
