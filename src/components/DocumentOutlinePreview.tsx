"use client";

import { useEffect, useRef, useState } from "react";
import type { DocumentQuad, Point } from "@/lib/image/preprocess";

interface DocumentOutlinePreviewProps {
  rawDataUrl: string;
  quad: DocumentQuad;
  /** Accessible label; keep short — this is decorative context for the scan preview. */
  label?: string;
  /** Show draggable handles on each corner and call `onQuadCommit` after a drag ends. */
  editable?: boolean;
  /** Fires after pointer release when corners were moved (async OK). */
  onQuadCommit?: (quad: DocumentQuad) => void | Promise<void>;
  /** Disable handles while re-processing (e.g. parent spinner). */
  adjustDisabled?: boolean;
}

const CORNER_LABELS = ["Top-left corner", "Top-right corner", "Bottom-right corner", "Bottom-left corner"] as const;

function clamp01(n: number): number {
  const e = 1e-4;
  return Math.min(1 - e, Math.max(e, n));
}

function clientToNormalized(clientX: number, clientY: number, img: HTMLImageElement): Point {
  const rect = img.getBoundingClientRect();
  const nx = (clientX - rect.left) / rect.width;
  const ny = (clientY - rect.top) / rect.height;
  return { x: clamp01(nx), y: clamp01(ny) };
}

/** Use as React `key` on the parent so local corner state resets when the server-side quad changes. */
export function documentQuadKey(q: DocumentQuad): string {
  return q.map((p) => `${p.x},${p.y}`).join("|");
}

function safeNormalized(clientX: number, clientY: number, img: HTMLImageElement): Point {
  const rect = img.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) {
    return { x: 0.5, y: 0.5 };
  }
  return clientToNormalized(clientX, clientY, img);
}

/**
 * Original photo with normalized quad overlay (same space as perspective correction).
 * When `editable`, drag corners to fix detection errors; parent should re-run preprocessing on commit.
 */
export function DocumentOutlinePreview({
  rawDataUrl,
  quad,
  label = "Detected document outline on original photo",
  editable = false,
  onQuadCommit,
  adjustDisabled = false
}: DocumentOutlinePreviewProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const localQuadRef = useRef<DocumentQuad>(quad);
  const dragMovedRef = useRef(false);
  const [localQuad, setLocalQuad] = useState<DocumentQuad>(() => quad);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  useEffect(() => {
    localQuadRef.current = localQuad;
  }, [localQuad]);

  const points = localQuad.map((p) => `${(p.x * 100).toFixed(3)},${(p.y * 100).toFixed(3)}`).join(" ");

  function handlePointerDownCorner(index: number, e: React.PointerEvent<HTMLDivElement>) {
    if (!editable || adjustDisabled) return;
    e.preventDefault();
    e.stopPropagation();
    dragMovedRef.current = false;
    setDragIndex(index);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (dragIndex === null || !imgRef.current) return;
    dragMovedRef.current = true;
    const p = safeNormalized(e.clientX, e.clientY, imgRef.current);
    setLocalQuad((prev) => {
      const next = [...prev] as DocumentQuad;
      next[dragIndex] = p;
      localQuadRef.current = next;
      return next;
    });
  }

  async function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (dragIndex === null) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const shouldCommit = dragMovedRef.current && editable && onQuadCommit && !adjustDisabled;
    const nextQuad = localQuadRef.current;
    dragMovedRef.current = false;
    setDragIndex(null);
    if (shouldCommit) {
      await onQuadCommit(nextQuad);
    }
  }

  const handlesDisabled = !editable || adjustDisabled;

  return (
    <figure
      className={`dp-doc-outline${editable ? " dp-doc-outline--editable" : ""}`}
      aria-label={label}
    >
      <div className={`dp-doc-outline-frame${editable ? " dp-doc-outline-frame--editable" : ""}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={imgRef} className="dp-doc-outline-img" src={rawDataUrl} alt="" draggable={false} />
        <svg
          className="dp-doc-outline-svg"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden={true}
        >
          <polygon
            points={points}
            fill="rgba(14, 165, 233, 0.14)"
            stroke="rgba(56, 189, 248, 0.95)"
            strokeWidth={editable ? "1.1" : "0.75"}
            pointerEvents="none"
          />
        </svg>
        {editable
          ? localQuad.map((p, i) => (
              <div
                key={i}
                aria-label={CORNER_LABELS[i]}
                style={{
                  position: "absolute",
                  left: `${p.x * 100}%`,
                  top: `${p.y * 100}%`,
                  width: 32,
                  height: 32,
                  transform: "translate(-50%, -50%)",
                  borderRadius: "50%",
                  background: "#0ea5e9",
                  border: "2.5px solid #fff",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.35)",
                  touchAction: "none",
                  cursor: handlesDisabled ? "default" : "grab",
                  zIndex: 10,
                  pointerEvents: handlesDisabled ? "none" : "auto",
                }}
                onPointerDown={(e) => handlePointerDownCorner(i, e)}
                onPointerMove={handlePointerMove}
                onPointerUp={(e) => void handlePointerUp(e)}
                onPointerCancel={(e) => void handlePointerUp(e)}
              />
            ))
          : null}
      </div>
      <figcaption className="dp-doc-outline-caption">
        {editable
          ? "Drag the corner dots to adjust the outline."
          : label}
      </figcaption>
    </figure>
  );
}
