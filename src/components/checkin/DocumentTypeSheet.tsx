"use client";

import { useEffect, useState } from "react";
import { DOCUMENT_TYPES, type DocumentType } from "@/types/documents";

/** Keep in step with the transition duration in globals.css. */
const EXIT_MS = 240;

interface DocumentTypeSheetProps {
  /**
   * Fired synchronously on tap, before the exit animation, so the caller can
   * open a file picker while still inside the user gesture — Safari discards
   * the gesture if the click is opened from a timeout.
   */
  onSelect: (type: DocumentType) => void;
  /** Fired once the sheet has finished animating out; unmount here. */
  onDismiss: () => void;
}

/**
 * Bottom sheet asking what kind of document is about to be added. It is shown
 * before the camera or picker opens, so the type is always known up front.
 */
export function DocumentTypeSheet({ onSelect, onDismiss }: DocumentTypeSheetProps) {
  const [open, setOpen] = useState(false);

  // Mount off-screen, then transition in on the next frame.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  function closeThen(after: () => void) {
    setOpen(false);
    window.setTimeout(after, EXIT_MS);
  }

  function handleSelect(type: DocumentType) {
    onSelect(type);
    closeThen(onDismiss);
  }

  return (
    <div
      className={`dp-sheet-scrim${open ? " is-open" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="Select document type"
    >
      <button
        className="dp-sheet-dismiss"
        type="button"
        onClick={() => closeThen(onDismiss)}
        aria-label="Cancel"
      />
      <div className="dp-sheet">
        <span className="dp-sheet-grabber" aria-hidden="true" />
        <h2 className="dp-sheet-title">Select Document Type</h2>
        <p className="dp-sheet-subtitle">What kind of document are you uploading?</p>
        <ul className="dp-sheet-list">
          {DOCUMENT_TYPES.map((type) => (
            <li key={type.value}>
              <button
                className="dp-sheet-option"
                type="button"
                onClick={() => handleSelect(type.value)}
              >
                {type.label}
              </button>
            </li>
          ))}
        </ul>
        <button className="dp-sheet-cancel" type="button" onClick={() => closeThen(onDismiss)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
