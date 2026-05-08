"use client";

import { type ChangeEvent, useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  detectDocumentQuad,
  type DocumentQuad,
  preprocessDocumentImage,
  type ProcessedImageResult
} from "@/lib/image/preprocess";

interface CameraCaptureProps {
  onDocumentReady: (result: ProcessedImageResult) => void;
  onClose?: () => void;
  title?: string;
  autoOpen?: boolean;
}

export function CameraCapture({ onDocumentReady, onClose, title = "Scan Document", autoOpen = true }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const detectionCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [hasActiveStream, setHasActiveStream] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [detectedQuad, setDetectedQuad] = useState<DocumentQuad | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ProcessedImageResult | null>(null);

  useEffect(() => {
    if (autoOpen) {
      void openCamera();
    }
    return () => {
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setHasActiveStream(false);
    setCameraReady(false);
    setDetectedQuad(null);
  }

  async function requestStream(): Promise<MediaStream> {
    const fallbackConstraints: MediaStreamConstraints[] = [
      // Try 4K first — modern iPhones and Android flagships support it
      {
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 3840 },
          height: { ideal: 2160 }
        },
        audio: false
      },
      // Fall back through descending resolutions
      {
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      },
      { video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
      { video: true, audio: false }
    ];

    let lastError: unknown;
    for (const constraints of fallbackConstraints) {
      try {
        return await navigator.mediaDevices.getUserMedia(constraints);
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError;
  }

  useEffect(() => {
    if (!cameraReady || !hasActiveStream || !videoRef.current) {
      return;
    }

    let cancelled = false;
    const sample = async () => {
      if (cancelled || !videoRef.current) {
        return;
      }

      const video = videoRef.current;
      if (video.videoWidth < 10 || video.videoHeight < 10) {
        return;
      }

      const sampleWidth = 640;
      const sampleHeight = Math.max(360, Math.round((video.videoHeight / video.videoWidth) * sampleWidth));
      if (!detectionCanvasRef.current) {
        detectionCanvasRef.current = document.createElement("canvas");
      }
      const canvas = detectionCanvasRef.current;
      canvas.width = sampleWidth;
      canvas.height = sampleHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return;
      }

      ctx.drawImage(video, 0, 0, sampleWidth, sampleHeight);
      const imageData = ctx.getImageData(0, 0, sampleWidth, sampleHeight);
      const quad = detectDocumentQuad(imageData).map((point) => ({
        x: point.x / sampleWidth,
        y: point.y / sampleHeight
      })) as DocumentQuad;
      setDetectedQuad(quad);
    };

    const interval = window.setInterval(() => {
      void sample();
    }, 250);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [cameraReady, hasActiveStream]);

  async function waitForVideoFrame(video: HTMLVideoElement): Promise<void> {
    if (video.videoWidth > 0 && video.videoHeight > 0) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error("Camera feed did not become ready."));
      }, 5000);

      function onReady() {
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          cleanup();
          resolve();
        }
      }

      function cleanup() {
        window.clearTimeout(timeout);
        video.removeEventListener("loadedmetadata", onReady);
        video.removeEventListener("canplay", onReady);
      }

      video.addEventListener("loadedmetadata", onReady);
      video.addEventListener("canplay", onReady);
    });
  }

  async function waitForVideoElement(): Promise<HTMLVideoElement> {
    const existing = videoRef.current;
    if (existing) {
      return existing;
    }

    return new Promise<HTMLVideoElement>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        reject(new Error("Video element missing."));
      }, 2000);

      function check() {
        if (videoRef.current) {
          window.clearTimeout(timeout);
          resolve(videoRef.current);
          return;
        }
        window.requestAnimationFrame(check);
      }

      check();
    });
  }

  async function openCamera() {
    setError(null);
    setIsOpening(true);
    setCameraReady(false);
    try {
      const stream = await requestStream();
      streamRef.current = stream;
      setHasActiveStream(true);
      const video = await waitForVideoElement();

      video.srcObject = stream;
      video.setAttribute("playsinline", "true");
      video.muted = true;
      video.autoplay = true;
      await video.play();
      await waitForVideoFrame(video);
      setCameraReady(true);
    } catch (error) {
      stopCamera();
      const message =
        error instanceof Error && error.message
          ? `Could not access the camera (${error.message}). You can use the photo upload fallback below.`
          : "Could not access the camera. You can use the photo upload fallback below.";
      setError(message);
    } finally {
      setIsOpening(false);
    }
  }

  async function processBlob(blob: Blob, quadHint?: DocumentQuad | null) {
    setIsProcessing(true);
    setError(null);
    try {
      const processed = await preprocessDocumentImage(blob, {
        quadHintNormalized: quadHint ?? undefined
      });
      setPreview(processed);
      onDocumentReady(processed);
      stopCamera();
      onClose?.();
    } catch {
      setError("Capture failed. Please retake the document photo.");
    } finally {
      setIsProcessing(false);
    }
  }

  async function capture() {
    if (!videoRef.current) {
      return;
    }

    setError(null);
    try {
      const video = videoRef.current;
      if (video.videoWidth === 0 || video.videoHeight === 0) {
        throw new Error("Camera is not ready.");
      }
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("Could not capture frame.");
      }
      context.drawImage(video, 0, 0);

      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((value) => (value ? resolve(value) : reject(new Error("Capture failed."))), "image/jpeg", 0.97)
      );
      await processBlob(blob, detectedQuad);
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? `Capture failed (${error.message}). Please retake the document photo.`
          : "Capture failed. Please retake the document photo.";
      setError(message);
    } finally {
      // processBlob handles processing state.
    }
  }

  async function onFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    await processBlob(file, null);
    event.target.value = "";
  }

  function retake() {
    setPreview(null);
    void openCamera();
  }

  function handleClose() {
    stopCamera();
    onClose?.();
  }

  return (
    <section className="stack">
      {!hasActiveStream && !preview ? (
        <div className="camera-modal" style={{ background: "#000", justifyContent: "center", alignItems: "center", display: "flex", flexDirection: "column", gap: "1rem" }}>
          {isOpening ? (
            <p style={{ color: "#fff", margin: 0 }}>Starting camera…</p>
          ) : (
            <>
              {/* Camera failed — show fallback options */}
              <button className="button button-primary" type="button" onClick={openCamera}>
                Retry Camera
              </button>
              <button
                className="button button-secondary"
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessing}
              >
                Use Photo Upload instead
              </button>
            </>
          )}
          <button className="button button-secondary" type="button" onClick={handleClose}>
            Cancel
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onFileSelected}
            style={{ display: "none" }}
          />
        </div>
      ) : null}

      {hasActiveStream ? (
        <div className="camera-modal">
          <video ref={videoRef} playsInline muted autoPlay className="camera-modal-video" />
          {detectedQuad ? (
            <svg className="camera-modal-overlay" viewBox="0 0 100 100" preserveAspectRatio="none">
              <polygon
                points={detectedQuad.map((point) => `${(point.x * 100).toFixed(2)},${(point.y * 100).toFixed(2)}`).join(" ")}
                fill="rgba(14, 165, 233, 0.15)"
                stroke="rgba(56, 189, 248, 0.95)"
                strokeWidth="0.8"
              />
            </svg>
          ) : null}
          <div className="camera-modal-top">
            <button className="button button-secondary" type="button" onClick={handleClose}>
              Close
            </button>
          </div>
          <div className="camera-modal-bottom">
            <p className="muted" style={{ color: "#f8fafc", margin: 0 }}>
              {cameraReady
                ? `Align the ${title.toLowerCase()} in the frame, then capture.`
                : "Starting camera feed..."}
            </p>
            <button
              className="camera-shutter"
              type="button"
              onClick={capture}
              disabled={isProcessing || !cameraReady}
              aria-label="Capture document"
            />
          </div>
        </div>
      ) : null}

      {preview ? (
        <div className="stack">
          <span className="pill">Enhanced Preview</span>
          <p className="muted">Original image (left) vs processed image (right).</p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "0.5rem"
            }}
          >
            <div className="camera-frame">
              <Image
                alt="Original captured document"
                src={preview.rawDataUrl}
                width={1200}
                height={1600}
                unoptimized
                style={{ width: "100%", height: "auto" }}
              />
            </div>
            <div className="camera-frame">
              <Image
                alt="Enhanced document preview"
                src={preview.processedDataUrl}
                width={1200}
                height={1600}
                unoptimized
                style={{ width: "100%", height: "auto" }}
              />
            </div>
          </div>
          <div className="camera-frame">
            <Image alt="Processed document large preview" src={preview.processedDataUrl} width={1200} height={1600} unoptimized style={{ width: "100%", height: "auto" }} />
          </div>
          <button className="button button-secondary" type="button" onClick={retake}>
            Retake Photo
          </button>
        </div>
      ) : null}

      {error ? <p className="alert alert-error">{error}</p> : null}
    </section>
  );
}
