export interface Point {
  x: number;
  y: number;
}

export type DocumentQuad = [Point, Point, Point, Point];

export interface ProcessedImageResult {
  processedDataUrl: string;
  rawDataUrl: string;
  /** Normalized corners (TL, TR, BR, BL) used for perspective correction — for UI overlay. */
  quadNormalized: DocumentQuad;
}

export interface PreprocessOptions {
  quadHintNormalized?: DocumentQuad;
  /**
   * Skip detection and perspective correction entirely, keeping the source
   * pixels as they are. Used for rasterised PDF pages: they are already flat and
   * axis-aligned, so warping them only resamples (and slightly distorts) a clean
   * image. Contrast stretch and sharpening still run.
   */
  skipPerspective?: boolean;
}

function toGrayscaleArray(
  data: Uint8ClampedArray,
  width: number,
  height: number
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 1) {
    out[j] = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;
  }
  return out;
}

function boxBlur(src: Uint8ClampedArray, width: number, height: number, radius: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  const r = Math.max(1, radius);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      let count = 0;
      const xStart = Math.max(0, x - r);
      const xEnd = Math.min(width - 1, x + r);
      const yStart = Math.max(0, y - r);
      const yEnd = Math.min(height - 1, y + r);
      for (let yy = yStart; yy <= yEnd; yy += 1) {
        for (let xx = xStart; xx <= xEnd; xx += 1) {
          sum += src[yy * width + xx];
          count += 1;
        }
      }
      out[y * width + x] = (sum / count) | 0;
    }
  }
  return out;
}

function fallbackInsetQuad(width: number, height: number): DocumentQuad {
  const marginX = Math.round(width * 0.06);
  const marginY = Math.round(height * 0.06);
  return [
    { x: marginX, y: marginY },
    { x: width - marginX, y: marginY },
    { x: width - marginX, y: height - marginY },
    { x: marginX, y: height - marginY }
  ];
}

function normalizeQuad(quad: DocumentQuad, width: number, height: number): DocumentQuad {
  return quad.map((point) => ({
    x: Math.max(0, Math.min(1, point.x / Math.max(1, width))),
    y: Math.max(0, Math.min(1, point.y / Math.max(1, height)))
  })) as DocumentQuad;
}

/**
 * Otsu's method: choose the grayscale threshold that maximizes inter-class
 * variance between "dark" and "bright" pixels. Works well when there is a
 * bimodal histogram (paper vs. background).
 */
function otsuThreshold(gray: Uint8ClampedArray): number {
  const histogram = new Array<number>(256).fill(0);
  for (let i = 0; i < gray.length; i += 1) {
    histogram[gray[i]] += 1;
  }
  const total = gray.length;

  let sumAll = 0;
  for (let i = 0; i < 256; i += 1) {
    sumAll += i * histogram[i];
  }

  let weightBackground = 0;
  let sumBackground = 0;
  let bestThreshold = 127;
  let bestVariance = 0;

  for (let t = 0; t < 256; t += 1) {
    weightBackground += histogram[t];
    if (weightBackground === 0) {
      continue;
    }
    const weightForeground = total - weightBackground;
    if (weightForeground === 0) {
      break;
    }
    sumBackground += t * histogram[t];
    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sumAll - sumBackground) / weightForeground;
    const variance =
      weightBackground *
      weightForeground *
      (meanBackground - meanForeground) *
      (meanBackground - meanForeground);
    if (variance > bestVariance) {
      bestVariance = variance;
      bestThreshold = t;
    }
  }
  return bestThreshold;
}

/**
 * 4-connected component labeling using union-find. Returns the labels array
 * (resolved to root labels) and per-root sizes.
 */
function labelComponents(
  mask: Uint8Array,
  width: number,
  height: number
): { labels: Int32Array; sizes: Map<number, number> } {
  const labels = new Int32Array(width * height);
  const parent: number[] = [0];

  function findRoot(label: number): number {
    let current = label;
    while (parent[current] !== current) {
      parent[current] = parent[parent[current]];
      current = parent[current];
    }
    return current;
  }

  function unionLabels(a: number, b: number): void {
    const rootA = findRoot(a);
    const rootB = findRoot(b);
    if (rootA === rootB) {
      return;
    }
    if (rootA < rootB) {
      parent[rootB] = rootA;
    } else {
      parent[rootA] = rootB;
    }
  }

  let nextLabel = 1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      if (!mask[idx]) {
        continue;
      }
      const left = x > 0 ? labels[idx - 1] : 0;
      const top = y > 0 ? labels[idx - width] : 0;
      if (left === 0 && top === 0) {
        labels[idx] = nextLabel;
        parent.push(nextLabel);
        nextLabel += 1;
      } else if (left !== 0 && top === 0) {
        labels[idx] = left;
      } else if (left === 0 && top !== 0) {
        labels[idx] = top;
      } else {
        labels[idx] = Math.min(left, top);
        if (left !== top) {
          unionLabels(left, top);
        }
      }
    }
  }

  const sizes = new Map<number, number>();
  for (let i = 0; i < labels.length; i += 1) {
    if (labels[i] === 0) {
      continue;
    }
    const root = findRoot(labels[i]);
    labels[i] = root;
    sizes.set(root, (sizes.get(root) ?? 0) + 1);
  }

  return { labels, sizes };
}

/**
 * Detect the document by:
 *   1. Grayscale + blur
 *   2. Otsu threshold to separate paper (bright) from background
 *   3. Find the largest bright connected component near the image center
 *   4. Take the four extreme corners of that component along the TL/TR/BR/BL
 *      diagonal directions (this works because we are restricted to one blob,
 *      so noise outside the blob cannot dominate)
 */
export function detectDocumentQuad(imageData: ImageData): DocumentQuad {
  const { width, height, data } = imageData;
  if (width < 16 || height < 16) {
    return fallbackInsetQuad(width, height);
  }

  const gray = toGrayscaleArray(data, width, height);
  const blurred = boxBlur(gray, width, height, 2);

  const otsu = otsuThreshold(blurred);

  let mean = 0;
  for (let i = 0; i < blurred.length; i += 1) {
    mean += blurred[i];
  }
  mean /= blurred.length;

  // Force the threshold above the mean so we are clearly selecting the
  // brighter half (paper) even when Otsu finds a lower split.
  const threshold = Math.max(otsu, Math.min(240, Math.round(mean + 25)));

  const mask = new Uint8Array(width * height);
  const borderX = Math.max(2, Math.round(width * 0.02));
  const borderY = Math.max(2, Math.round(height * 0.02));
  for (let y = borderY; y < height - borderY; y += 1) {
    for (let x = borderX; x < width - borderX; x += 1) {
      const idx = y * width + x;
      mask[idx] = blurred[idx] >= threshold ? 1 : 0;
    }
  }

  const { labels, sizes } = labelComponents(mask, width, height);
  if (sizes.size === 0) {
    return fallbackInsetQuad(width, height);
  }

  const totalArea = width * height;
  const minComponentArea = totalArea * 0.05;

  // Score components: larger, more centered, and more solid (filled) wins.
  // Touching the image edge is penalized so we don't pick wall/floor.
  // Solidity (filled pixels / bounding-box area) distinguishes paper (~0.9)
  // from keyboards, textured tables, etc. (~0.3–0.5).
  const cx = width / 2;
  const cy = height / 2;
  const halfDiag = Math.hypot(cx, cy);

  interface Bounds {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    sumX: number;
    sumY: number;
    count: number;
  }
  const bounds = new Map<number, Bounds>();
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const lab = labels[y * width + x];
      if (lab === 0) {
        continue;
      }
      let bound = bounds.get(lab);
      if (!bound) {
        bound = {
          minX: x,
          minY: y,
          maxX: x,
          maxY: y,
          sumX: x,
          sumY: y,
          count: 1
        };
        bounds.set(lab, bound);
        continue;
      }
      if (x < bound.minX) bound.minX = x;
      if (y < bound.minY) bound.minY = y;
      if (x > bound.maxX) bound.maxX = x;
      if (y > bound.maxY) bound.maxY = y;
      bound.sumX += x;
      bound.sumY += y;
      bound.count += 1;
    }
  }

  let bestLabel = -1;
  let bestScore = -Infinity;
  for (const [label, size] of sizes) {
    if (size < minComponentArea) {
      continue;
    }
    const bound = bounds.get(label);
    if (!bound) {
      continue;
    }

    const meanX = bound.sumX / bound.count;
    const meanY = bound.sumY / bound.count;
    const distFromCenter = Math.hypot(meanX - cx, meanY - cy);
    const centerScore = 1 - distFromCenter / halfDiag;
    const sizeScore = size / totalArea;

    // Solidity: how completely the component fills its own bounding box.
    // Paper ≈ 0.85–0.95; keyboard/floor/wall ≈ 0.2–0.55.
    const bboxW = bound.maxX - bound.minX + 1;
    const bboxH = bound.maxY - bound.minY + 1;
    const bboxArea = bboxW * bboxH;
    const solidity = bboxArea > 0 ? size / bboxArea : 0;

    // Aspect ratio: documents are roughly between 0.5:1 and 2:1.
    // Penalize very narrow strips or extreme panoramas.
    const aspectRatio = bboxW / Math.max(1, bboxH);
    const aspectPenalty = (aspectRatio > 3 || aspectRatio < 0.33) ? 0.3 : 0;

    const touchesEdge =
      bound.minX <= borderX + 1 ||
      bound.minY <= borderY + 1 ||
      bound.maxX >= width - borderX - 2 ||
      bound.maxY >= height - borderY - 2;
    const edgePenalty = touchesEdge ? 0.3 : 0;

    const score =
      sizeScore * 0.35 +
      centerScore * 0.25 +
      solidity * 0.4 -
      edgePenalty -
      aspectPenalty;

    if (score > bestScore) {
      bestScore = score;
      bestLabel = label;
    }
  }

  if (bestLabel === -1) {
    return fallbackInsetQuad(width, height);
  }

  // Find the 4 extreme corners of the chosen component using diagonal
  // scoring. Restricted to the component, this reliably finds the
  // corners of the document rather than image-corner noise.
  let tl: Point | null = null;
  let tr: Point | null = null;
  let br: Point | null = null;
  let bl: Point | null = null;
  let bestTL = -Infinity;
  let bestTR = -Infinity;
  let bestBR = -Infinity;
  let bestBL = -Infinity;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (labels[y * width + x] !== bestLabel) {
        continue;
      }
      const dx = x - cx;
      const dy = y - cy;
      const tlScore = -dx - dy;
      const trScore = dx - dy;
      const brScore = dx + dy;
      const blScore = -dx + dy;
      if (tlScore > bestTL) {
        bestTL = tlScore;
        tl = { x, y };
      }
      if (trScore > bestTR) {
        bestTR = trScore;
        tr = { x, y };
      }
      if (brScore > bestBR) {
        bestBR = brScore;
        br = { x, y };
      }
      if (blScore > bestBL) {
        bestBL = blScore;
        bl = { x, y };
      }
    }
  }

  if (!tl || !tr || !br || !bl) {
    return fallbackInsetQuad(width, height);
  }

  const minSide = Math.min(width, height);
  const sides = [
    Math.hypot(tr.x - tl.x, tr.y - tl.y),
    Math.hypot(br.x - tr.x, br.y - tr.y),
    Math.hypot(bl.x - br.x, bl.y - br.y),
    Math.hypot(tl.x - bl.x, tl.y - bl.y)
  ];
  if (sides.some((s) => s < minSide * 0.15)) {
    return fallbackInsetQuad(width, height);
  }

  return [tl, tr, br, bl];
}

function denormalizeQuad(quad: DocumentQuad, width: number, height: number): DocumentQuad {
  return quad.map((point) => ({
    x: Math.max(0, Math.min(width, point.x * width)),
    y: Math.max(0, Math.min(height, point.y * height))
  })) as DocumentQuad;
}

function detectQuadNormalizedFromCanvas(inputCanvas: HTMLCanvasElement): DocumentQuad {
  const maxDetectionEdge = 2000;
  const srcW = inputCanvas.width;
  const srcH = inputCanvas.height;
  const scale = Math.min(1, maxDetectionEdge / Math.max(srcW, srcH));
  const detectW = Math.max(64, Math.round(srcW * scale));
  const detectH = Math.max(64, Math.round(srcH * scale));

  const detectionCanvas = document.createElement("canvas");
  detectionCanvas.width = detectW;
  detectionCanvas.height = detectH;
  const detectionCtx = detectionCanvas.getContext("2d");
  if (!detectionCtx) {
    return normalizeQuad(fallbackInsetQuad(detectW, detectH), detectW, detectH);
  }

  detectionCtx.imageSmoothingEnabled = true;
  detectionCtx.imageSmoothingQuality = "high";
  detectionCtx.drawImage(inputCanvas, 0, 0, detectW, detectH);
  const sampled = detectionCtx.getImageData(0, 0, detectW, detectH);
  const quad = detectDocumentQuad(sampled);
  return normalizeQuad(quad, detectW, detectH);
}

function solveLinearSystem(matrix: number[][], rhs: number[]): number[] | null {
  const n = rhs.length;
  const augmented = matrix.map((row, i) => [...row, rhs[i]]);

  for (let k = 0; k < n; k += 1) {
    let pivot = k;
    for (let i = k + 1; i < n; i += 1) {
      if (Math.abs(augmented[i][k]) > Math.abs(augmented[pivot][k])) {
        pivot = i;
      }
    }
    if (Math.abs(augmented[pivot][k]) < 1e-10) {
      return null;
    }
    if (pivot !== k) {
      const tmp = augmented[k];
      augmented[k] = augmented[pivot];
      augmented[pivot] = tmp;
    }
    for (let i = k + 1; i < n; i += 1) {
      const factor = augmented[i][k] / augmented[k][k];
      for (let j = k; j <= n; j += 1) {
        augmented[i][j] -= factor * augmented[k][j];
      }
    }
  }

  const result = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i -= 1) {
    let sum = augmented[i][n];
    for (let j = i + 1; j < n; j += 1) {
      sum -= augmented[i][j] * result[j];
    }
    result[i] = sum / augmented[i][i];
  }
  return result;
}

/**
 * Solve the 8-DOF homography mapping each destination corner (rectified) back to
 * the matching source corner in the original image. Returns coefficients
 * [h0..h7] such that for any destination (x, y):
 *   sx = (h0*x + h1*y + h2) / (h6*x + h7*y + 1)
 *   sy = (h3*x + h4*y + h5) / (h6*x + h7*y + 1)
 */
function solveHomographyDstToSrc(
  srcQuad: DocumentQuad,
  dstQuad: DocumentQuad
): number[] | null {
  const matrix: number[][] = [];
  const rhs: number[] = [];
  for (let i = 0; i < 4; i += 1) {
    const { x: sx, y: sy } = srcQuad[i];
    const { x: dx, y: dy } = dstQuad[i];
    matrix.push([dx, dy, 1, 0, 0, 0, -sx * dx, -sx * dy]);
    rhs.push(sx);
    matrix.push([0, 0, 0, dx, dy, 1, -sy * dx, -sy * dy]);
    rhs.push(sy);
  }
  return solveLinearSystem(matrix, rhs);
}

/**
 * Estimate the correct output rectangle dimensions for a perspective-projected
 * rectangle using the Zhang (2004) cross-product formula.
 *
 * The naive approach — taking max(left_edge, right_edge) for height — always
 * underestimates when the document is tilted because BOTH vertical edges are
 * foreshortened simultaneously.  This formula recovers the true width/height
 * aspect ratio by treating each detected corner as a 3-D ray from the camera
 * and computing the relevant dot-product ratios.
 *
 * Assuming principal point at image centre and focal length ≈ max image
 * dimension (standard smartphone heuristic).  Falls back to the max-edge
 * method when the formula yields an invalid or extreme value.
 */
function perspectiveOutputSize(
  srcQuad: DocumentQuad,
  srcWidth: number,
  srcHeight: number
): { width: number; height: number } {
  const [tl, tr, br, bl] = srcQuad;

  // ── 1. Classic max-edge lengths (used as the width reference and fallback) ──
  const topW   = Math.hypot(tr.x - tl.x, tr.y - tl.y);
  const botW   = Math.hypot(br.x - bl.x, br.y - bl.y);
  const leftH  = Math.hypot(bl.x - tl.x, bl.y - tl.y);
  const rightH = Math.hypot(br.x - tr.x, br.y - tr.y);
  const maxW = Math.max(topW, botW);
  const maxH = Math.max(leftH, rightH);

  // ── 2. Zhang aspect-ratio formula ────────────────────────────────────────
  // Shift corners to be relative to the principal point (image centre).
  const cx = srcWidth  / 2;
  const cy = srcHeight / 2;
  // Focal length heuristic: smartphones are roughly equivalent to f ≈ max dim.
  const f = Math.max(srcWidth, srcHeight);

  // 3-D ray vectors from camera centre to each image corner.
  //   m[0]=TL  m[1]=TR  m[2]=BR  m[3]=BL
  const m: [number, number, number][] = [
    [tl.x - cx, tl.y - cy, f],
    [tr.x - cx, tr.y - cy, f],
    [br.x - cx, br.y - cy, f],
    [bl.x - cx, bl.y - cy, f],
  ];
  const dot = (a: [number, number, number], b: [number, number, number]) =>
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

  // r² = (m₀·m₂ · m₁·m₃ − m₀·m₃ · m₁·m₂) /
  //      (m₀·m₂ · m₁·m₃ − m₀·m₁ · m₂·m₃)
  // where r = w_physical / h_physical
  //   numerator  uses the lateral (left/right) side dot products  → ∝ W²
  //   denominator uses the horizontal (top/bottom) dot products   → ∝ H²
  const d02 = dot(m[0], m[2]); // TL·BR  diagonals
  const d13 = dot(m[1], m[3]); // TR·BL
  const d03 = dot(m[0], m[3]); // TL·BL  left side
  const d12 = dot(m[1], m[2]); // TR·BR  right side
  const d01 = dot(m[0], m[1]); // TL·TR  top
  const d23 = dot(m[2], m[3]); // BR·BL  bottom

  const num = d02 * d13 - d03 * d12; // ∝ W²  (both negative → positive ratio)
  const den = d02 * d13 - d01 * d23; // ∝ H²

  if (den !== 0 && num / den > 0) {
    const r = Math.sqrt(num / den);   // r = w/h
    const correctedH = maxW / r;

    // Sanity guard: reject if correction is more than 4× in either direction.
    if (correctedH > maxH * 0.25 && correctedH < maxH * 4) {
      return {
        width:  Math.max(64, Math.round(maxW)),
        height: Math.max(64, Math.round(correctedH)),
      };
    }
  }

  // Fallback: classic max-edge method
  return {
    width:  Math.max(64, Math.round(maxW)),
    height: Math.max(64, Math.round(maxH)),
  };
}

function perspectiveCorrect(
  inputCanvas: HTMLCanvasElement,
  quadHintNormalized?: DocumentQuad
): { canvas: HTMLCanvasElement; normalizedQuad: DocumentQuad } {
  const fallbackQuad = () =>
    normalizeQuad(
      fallbackInsetQuad(inputCanvas.width, inputCanvas.height),
      inputCanvas.width,
      inputCanvas.height
    );

  const srcCtx = inputCanvas.getContext("2d");
  if (!srcCtx) {
    return { canvas: inputCanvas, normalizedQuad: fallbackQuad() };
  }
  const srcWidth = inputCanvas.width;
  const srcHeight = inputCanvas.height;
  const srcImageData = srcCtx.getImageData(0, 0, srcWidth, srcHeight);
  const normalizedQuad = quadHintNormalized ?? detectQuadNormalizedFromCanvas(inputCanvas);
  const srcQuad = denormalizeQuad(normalizedQuad, srcWidth, srcHeight);

  const { width: targetW, height: targetH } =
    perspectiveOutputSize(srcQuad, srcWidth, srcHeight);

  const dstQuad: DocumentQuad = [
    { x: 0, y: 0 },
    { x: targetW - 1, y: 0 },
    { x: targetW - 1, y: targetH - 1 },
    { x: 0, y: targetH - 1 }
  ];

  const h = solveHomographyDstToSrc(srcQuad, dstQuad);
  if (!h) {
    return { canvas: inputCanvas, normalizedQuad };
  }

  const out = document.createElement("canvas");
  out.width = targetW;
  out.height = targetH;
  const outCtx = out.getContext("2d");
  if (!outCtx) {
    return { canvas: inputCanvas, normalizedQuad };
  }
  outCtx.imageSmoothingEnabled = true;
  outCtx.imageSmoothingQuality = "high";
  const outImage = outCtx.createImageData(targetW, targetH);
  const srcData = srcImageData.data;
  const outData = outImage.data;

  const [h0, h1, h2, h3, h4, h5, h6, h7] = h;

  for (let y = 0; y < targetH; y += 1) {
    for (let x = 0; x < targetW; x += 1) {
      const denom = h6 * x + h7 * y + 1;
      const sx = (h0 * x + h1 * y + h2) / denom;
      const sy = (h3 * x + h4 * y + h5) / denom;
      const idx = (y * targetW + x) * 4;
      if (sx < 0 || sy < 0 || sx >= srcWidth - 1 || sy >= srcHeight - 1) {
        outData[idx] = 0;
        outData[idx + 1] = 0;
        outData[idx + 2] = 0;
        outData[idx + 3] = 255;
        continue;
      }

      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const fx = sx - x0;
      const fy = sy - y0;
      const i00 = (y0 * srcWidth + x0) * 4;
      const i10 = (y0 * srcWidth + (x0 + 1)) * 4;
      const i01 = ((y0 + 1) * srcWidth + x0) * 4;
      const i11 = ((y0 + 1) * srcWidth + (x0 + 1)) * 4;

      for (let c = 0; c < 3; c += 1) {
        const top = srcData[i00 + c] * (1 - fx) + srcData[i10 + c] * fx;
        const bot = srcData[i01 + c] * (1 - fx) + srcData[i11 + c] * fx;
        outData[idx + c] = top * (1 - fy) + bot * fy;
      }
      outData[idx + 3] = 255;
    }
  }

  outCtx.putImageData(outImage, 0, 0);
  return { canvas: out, normalizedQuad };
}

function enhanceContrastBrightness(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return canvas;
  }

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;
  let min = 255;
  let max = 0;
  for (let i = 0; i < data.length; i += 4) {
    const lum = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;
    if (lum < min) min = lum;
    if (lum > max) max = lum;
  }

  // A near-uniform image (blank page, badly overexposed photo) has nothing to
  // stretch. Pushing on regardless divides by a range clamped to 1, which
  // amplifies trivial per-channel differences into a violent colour cast —
  // an off-white (246, 245, 240) comes out as pure yellow (255, 255, 0).
  const MIN_USEFUL_RANGE = 8;
  if (max - min < MIN_USEFUL_RANGE) {
    return canvas;
  }

  // Leave a small headroom (2%) on each end to avoid blown highlights / crushed
  // blacks while still stretching most of the dynamic range.
  const headroom = Math.round((max - min) * 0.02);
  const lo = Math.max(0, min + headroom);
  const hi = Math.min(255, max - headroom);
  const range = Math.max(1, hi - lo);

  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c += 1) {
      data[i + c] = Math.max(0, Math.min(255, ((data[i + c] - lo) / range) * 255)) | 0;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/**
 * Unsharp mask: recovers the softness introduced by bilinear interpolation in
 * perspective correction.  Radius 1 (3×3 approximation), amount 0.65.
 * Formula: sharpened = original + amount × (original − blurred)
 */
function unsharpMask(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const src = imageData.data;

  // Compute a 1-pixel box blur (≈ Gaussian σ ≈ 0.85) in-place on a copy
  const blurred = new Uint8ClampedArray(src);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const idx = (y * width + x) * 4;
      for (let c = 0; c < 3; c += 1) {
        blurred[idx + c] = (
          src[idx - width * 4 - 4 + c] + src[idx - width * 4 + c] + src[idx - width * 4 + 4 + c] +
          src[idx - 4 + c]             + src[idx + c]              + src[idx + 4 + c] +
          src[idx + width * 4 - 4 + c] + src[idx + width * 4 + c] + src[idx + width * 4 + 4 + c]
        ) / 9;
      }
    }
  }

  const amount = 0.65;
  for (let i = 0; i < src.length; i += 4) {
    for (let c = 0; c < 3; c += 1) {
      src[i + c] = Math.max(0, Math.min(255, src[i + c] + amount * (src[i + c] - blurred[i + c]))) | 0;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

async function drawBlobToCanvas(blob: Blob): Promise<HTMLCanvasElement> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
      try {
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          throw new Error("Could not create canvas context.");
        }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(bitmap, 0, 0);
        return canvas;
      } finally {
        bitmap.close();
      }
    } catch {
      // Fall through to Image() path (older browsers / some HEIC cases).
    }
  }

  return new Promise((resolve, reject) => {
    const imageURL = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(imageURL);
        reject(new Error("Could not create canvas context."));
        return;
      }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(image, 0, 0);
      URL.revokeObjectURL(imageURL);
      resolve(canvas);
    };
    image.onerror = () => {
      URL.revokeObjectURL(imageURL);
      reject(new Error("Failed to load captured image."));
    };
    image.src = imageURL;
  });
}

export async function preprocessDocumentImage(
  capturedBlob: Blob,
  options?: PreprocessOptions
): Promise<ProcessedImageResult> {
  const sourceCanvas = await drawBlobToCanvas(capturedBlob);
  const rawDataUrl = sourceCanvas.toDataURL("image/jpeg", 0.95);
  const { canvas: corrected, normalizedQuad: quadNormalized } = options?.skipPerspective
    ? {
        canvas: sourceCanvas,
        normalizedQuad: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: 1 },
          { x: 0, y: 1 }
        ] as DocumentQuad
      }
    : perspectiveCorrect(sourceCanvas, options?.quadHintNormalized);
  const enhanced = enhanceContrastBrightness(corrected);
  const sharpened = unsharpMask(enhanced);
  const processedDataUrl = sharpened.toDataURL("image/jpeg", 0.97);
  return {
    rawDataUrl,
    processedDataUrl,
    quadNormalized
  };
}
