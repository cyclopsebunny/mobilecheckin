"use client";

import { DOCUMENT_TYPES, type DocumentType } from "@/types/documents";

interface DocumentTypeSheetProps {
  fileName?: string;
  onSelect: (type: DocumentType) => void;
  onCancel: () => void;
}

/**
 * Bottom sheet shown after a file is chosen. The type drives whether the
 * document is analyzed at all, so it is asked before any processing happens.
 */
export function DocumentTypeSheet({ fileName, onSelect, onCancel }: DocumentTypeSheetProps) {
  return (
    <div className="dp-sheet-scrim" role="dialog" aria-modal="true" aria-label="Select document type">
      <button className="dp-sheet-dismiss" type="button" onClick={onCancel} aria-label="Cancel" />
      <div className="dp-sheet">
        <span className="dp-sheet-grabber" aria-hidden="true" />
        <h2 className="dp-sheet-title">Select Document Type</h2>
        <p className="dp-sheet-subtitle">
          {fileName ? `What kind of document is ${fileName}?` : "What kind of document are you uploading?"}
        </p>
        <ul className="dp-sheet-list">
          {DOCUMENT_TYPES.map((type) => (
            <li key={type.value}>
              <button className="dp-sheet-option" type="button" onClick={() => onSelect(type.value)}>
                {type.label}
              </button>
            </li>
          ))}
        </ul>
        <button className="dp-sheet-cancel" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
