"use client";

import { ImageFileIcon, PdfFileIcon, TrashIcon } from "@/components/checkin/icons";
import { documentTypeLabel, type UploadedDocument } from "@/types/documents";

interface DocumentListProps {
  documents: readonly UploadedDocument[];
  onRemove: (id: string) => void;
  onOpen?: (id: string) => void;
  disabled?: boolean;
}

export function DocumentList({ documents, onRemove, onOpen, disabled = false }: DocumentListProps) {
  if (documents.length === 0) {
    return null;
  }

  return (
    <ul className="dp-doc-list" aria-label="Uploaded documents">
      {documents.map((doc) => (
        <li key={doc.id} className="dp-doc-row">
          <span className="dp-doc-row-icon">{doc.fromPdf ? <PdfFileIcon /> : <ImageFileIcon />}</span>
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
