"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { containContentRect } from "@/lib/image/objectFit";
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

/** Use as React `key` on the parent so local corner state resets when the server-side quad changes. */
export function documentQuadKey(q: DocumentQuad): string {
  return q.map((p) => `${p.x},${p.y}`).join("|");
}

interface Size {
  width: number;
  height: number;
}

const EMPTY_SIZE: Size = { width: 0, height: 0 };

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
  const [elementSize, setElementSize] = useState<Size>(EMPTY_SIZE);
  const [naturalSize, setNaturalSize] = useState<Size>(EMPTY_SIZE);

  useEffect(() => {
    localQuadRef.current = localQuad;
  }, [localQuad]);

  // Track the <img> element box. In editable mode the image is stretched to fill
  // the flex frame with `object-fit: contain`, so the element box is larger than
  // the painted photo and cannot be used as the overlay's coordinate space.
  useEffect(() => {
    const element = imgRef.current;
    if (!element) {
      return;
    }
    // Fractional sizes, not clientWidth/clientHeight — those round to whole
    // pixels, which would offset the overlay from the photo by up to a pixel.
    const apply = (width: number, height: number) => {
      setElementSize((prev) =>
        Math.abs(prev.width - width) < 0.01 && Math.abs(prev.height - height) < 0.01
          ? prev
          : { width, height }
      );
    };
    const initial = element.getBoundingClientRect();
    apply(initial.width, initial.height);
    const observer = new ResizeObserver((entries) => {
      const box = entries[entries.length - 1]?.contentRect;
      if (box) {
        apply(box.width, box.height);
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Natural size drives the letterbox math. Read it eagerly too, since a cached
  // or already-decoded image never fires `load`.
  useEffect(() => {
    const element = imgRef.current;
    if (!element) {
      return;
    }
    if (element.complete && element.naturalWidth > 0) {
      setNaturalSize({ width: element.naturalWidth, height: element.naturalHeight });
      return;
    }
    setNaturalSize(EMPTY_SIZE);
  }, [rawDataUrl]);

  const contentRect = useMemo(
    () =>
      containContentRect(
        elementSize.width,
        elementSize.height,
        naturalSize.width,
        naturalSize.height
      ),
    [elementSize.width, elementSize.height, naturalSize.width, naturalSize.height]
  );

  const points = localQuad.map((p) => `${(p.x * 100).toFixed(3)},${(p.y * 100).toFixed(3)}`).join(" ");
  const overlayReady = contentRect.width >= 2 && contentRect.height >= 2;

  /** Pointer position → coordinates normalized against the painted photo. */
  function toNormalized(clientX: number, clientY: number): Point | null {
    const element = imgRef.current;
    if (!element || !overlayReady) {
      return null;
    }
    const rect = element.getBoundingClientRect();
    return {
      x: clamp01((clientX - rect.left - contentRect.left) / contentRect.width),
      y: clamp01((clientY - rect.top - contentRect.top) / contentRect.height)
    };
  }

  function handlePointerDownCorner(index: number, e: React.PointerEvent<HTMLDivElement>) {
    if (!editable || adjustDisabled) return;
    e.preventDefault();
    e.stopPropagation();
    dragMovedRef.current = false;
    setDragIndex(index);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (dragIndex === null) return;
    const p = toNormalized(e.clientX, e.clientY);
    if (!p) return;
    dragMovedRef.current = true;
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
        <img
          ref={imgRef}
          className="dp-doc-outline-img"
          src={rawDataUrl}
          alt=""
          draggable={false}
          onLoad={(e) =>
            setNaturalSize({
              width: e.currentTarget.naturalWidth,
              height: e.currentTarget.naturalHeight
            })
          }
        />
        {overlayReady ? (
          <svg
            className="dp-doc-outline-svg"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden={true}
            style={{
              left: contentRect.left,
              top: contentRect.top,
              width: contentRect.width,
              height: contentRect.height
            }}
          >
            <polygon
              points={points}
              fill="rgba(14, 165, 233, 0.14)"
              stroke="rgba(56, 189, 248, 0.95)"
              strokeWidth={editable ? 3 : 2}
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
          </svg>
        ) : null}
        {editable && overlayReady
          ? localQuad.map((p, i) => (
              <div
                key={i}
                aria-label={CORNER_LABELS[i]}
                style={{
                  position: "absolute",
                  left: contentRect.left + p.x * contentRect.width,
                  top: contentRect.top + p.y * contentRect.height,
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
