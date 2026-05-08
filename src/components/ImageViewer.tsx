"use client";

import { useEffect, useRef, useState, type TouchEvent } from "react";

interface ImageViewerProps {
  src: string;
  alt?: string;
  onClose: () => void;
}

function getPinchDist(touches: React.TouchList): number {
  return Math.hypot(
    touches[1].clientX - touches[0].clientX,
    touches[1].clientY - touches[0].clientY
  );
}

export function ImageViewer({ src, alt = "Document preview", onClose }: ImageViewerProps) {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  // Only animate transforms for programmatic changes (double-tap); never during
  // live touch gestures — even 50 ms of lag makes pinch-to-zoom feel wrong.
  const [animate, setAnimate] = useState(false);

  const lastPinchDist = useRef<number | null>(null);
  const lastPanPos = useRef<{ x: number; y: number } | null>(null);
  // Tracks whether a touch sequence started as a pinch so single-finger
  // moves that come from a lifted second finger don't snap the image.
  const isPinching = useRef(false);
  const animateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close on Escape key
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Prevent body scroll while viewer is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  function clampPos(nextPos: { x: number; y: number }, nextScale: number) {
    // Allow panning only as far as the image extends beyond the viewport
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const maxX = Math.max(0, (vw * nextScale - vw) / 2);
    const maxY = Math.max(0, (vh * nextScale - vh) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, nextPos.x)),
      y: Math.max(-maxY, Math.min(maxY, nextPos.y))
    };
  }

  function handleTouchStart(e: TouchEvent) {
    e.preventDefault();
    // Kill any pending animate-off timer and disable transitions immediately
    if (animateTimerRef.current) clearTimeout(animateTimerRef.current);
    setAnimate(false);
    if (e.touches.length === 2) {
      isPinching.current = true;
      lastPinchDist.current = getPinchDist(e.touches);
      lastPanPos.current = null;
    } else if (e.touches.length === 1 && !isPinching.current) {
      lastPanPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  }

  function handleTouchMove(e: TouchEvent) {
    e.preventDefault();
    if (e.touches.length === 2 && lastPinchDist.current !== null) {
      const dist = getPinchDist(e.touches);
      const delta = dist / lastPinchDist.current;
      setScale((s) => {
        const next = Math.min(6, Math.max(1, s * delta));
        setPos((p) => clampPos(p, next));
        return next;
      });
      lastPinchDist.current = dist;
    } else if (e.touches.length === 1 && lastPanPos.current && !isPinching.current) {
      const dx = e.touches[0].clientX - lastPanPos.current.x;
      const dy = e.touches[0].clientY - lastPanPos.current.y;
      setPos((p) => clampPos({ x: p.x + dx, y: p.y + dy }, scale));
      lastPanPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  }

  function handleTouchEnd(e: TouchEvent) {
    if (e.touches.length < 2) {
      lastPinchDist.current = null;
      if (e.touches.length === 0) {
        isPinching.current = false;
        lastPanPos.current = null;
      }
    }
    // Snap back to center if zoomed all the way out
    setScale((s) => {
      if (s <= 1.01) {
        setPos({ x: 0, y: 0 });
        return 1;
      }
      return s;
    });
  }

  function handleDoubleTap() {
    // Animate only for this intentional programmatic jump, then disable again
    setAnimate(true);
    animateTimerRef.current = setTimeout(() => setAnimate(false), 350);
    setScale((s) => {
      const next = s > 1.2 ? 1 : 2.5;
      if (next === 1) setPos({ x: 0, y: 0 });
      return next;
    });
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 999,
        background: "#000",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        touchAction: "none"
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Close button */}
      <button
        type="button"
        className="dp-preview-close-btn"
        onClick={onClose}
        aria-label="Close preview"
      >
        ✕
      </button>

      {/* Zoom hint */}
      <p
        style={{
          position: "absolute",
          bottom: 20,
          left: 0,
          right: 0,
          textAlign: "center",
          color: "rgba(255,255,255,0.45)",
          fontSize: "0.75rem",
          margin: 0,
          pointerEvents: "none",
          userSelect: "none"
        }}
      >
        Pinch to zoom · Double-tap to toggle zoom
      </p>

      {/* Image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        onDoubleClick={handleDoubleTap}
        draggable={false}
        style={{
          maxWidth: "100vw",
          maxHeight: "100vh",
          objectFit: "contain",
          transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
          transformOrigin: "center center",
          transition: animate ? "transform 0.3s ease-out" : "none",
          userSelect: "none",
          WebkitUserSelect: "none"
        }}
      />
    </div>
  );
}
