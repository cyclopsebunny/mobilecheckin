"use client";

import { documentTypeLabel, type UploadedDocument } from "@/types/documents";

interface DocumentListProps {
  documents: readonly UploadedDocument[];
  onRemove: (id: string) => void;
  onOpen?: (id: string) => void;
  disabled?: boolean;
}

function ImageIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <rect x="1.5" y="3.5" width="19" height="15" rx="2.5" stroke="#003b5c" strokeWidth="1.6" />
      <circle cx="7.5" cy="9" r="1.8" fill="#003b5c" />
      <path d="M3 16.5l4.8-4.3 3.4 3 3-2.4 4.4 3.7" stroke="#003b5c" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PdfIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <path d="M4.5 2.5h8l5 5v12a1 1 0 01-1 1h-12a1 1 0 01-1-1v-16a1 1 0 011-1z" stroke="#003b5c" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M12.5 2.5v5h5" stroke="#003b5c" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M3.5 5.5h13M8 3h4a1 1 0 011 1v1.5H7V4a1 1 0 011-1z" stroke="#e53e3e" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.5 5.5l.8 11a1 1 0 001 .9h5.4a1 1 0 001-.9l.8-11" stroke="#e53e3e" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.5 8.5v6M11.5 8.5v6" stroke="#e53e3e" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function DocumentList({ documents, onRemove, onOpen, disabled = false }: DocumentListProps) {
  if (documents.length === 0) {
    return null;
  }

  return (
    <ul className="dp-doc-list" aria-label="Uploaded documents">
      {documents.map((doc) => (
        <li key={doc.id} className="dp-doc-row">
          <span className="dp-doc-row-icon">{doc.fromPdf ? <PdfIcon /> : <ImageIcon />}</span>
          <button
            className="dp-doc-row-main"
            type="button"
            onClick={() => onOpen?.(doc.id)}
            disabled={disabled || !onOpen}
            title={doc.fileName}
          >
            <span className="dp-doc-row-name">{doc.fileName}</span>
          </button>
          <span className="dp-doc-row-type">{documentTypeLabel(doc.docType)}</span>
          <button
            className="dp-doc-row-remove"
            type="button"
            onClick={() => onRemove(doc.id)}
            disabled={disabled}
            aria-label={`Remove ${doc.fileName}`}
          >
            <TrashIcon />
          </button>
        </li>
      ))}
    </ul>
  );
}
