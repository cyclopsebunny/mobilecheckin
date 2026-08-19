export interface ContentRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Where an `object-fit: contain` child actually renders inside its element box.
 *
 * Detected quads are normalized against the *media* frame (video frame or image
 * natural size), but `<video>` / `<img>` letterbox that frame when the element
 * aspect ratio differs. Overlays must be positioned against this content rect,
 * not the element box, or the quad ends up stretched and offset along one axis
 * — which looks like a 90° rotation when the two aspect ratios are transposed
 * (e.g. a 16:9 stream on a 9:19.5 phone screen).
 *
 * Returned coordinates are relative to the element box's top-left corner.
 */
export function containContentRect(
  boxWidth: number,
  boxHeight: number,
  mediaWidth: number,
  mediaHeight: number
): ContentRect {
  if (boxWidth <= 0 || boxHeight <= 0 || mediaWidth <= 0 || mediaHeight <= 0) {
    return {
      left: 0,
      top: 0,
      width: Math.max(0, boxWidth),
      height: Math.max(0, boxHeight)
    };
  }

  const scale = Math.min(boxWidth / mediaWidth, boxHeight / mediaHeight);
  const width = mediaWidth * scale;
  const height = mediaHeight * scale;
  return {
    left: (boxWidth - width) / 2,
    top: (boxHeight - height) / 2,
    width,
    height
  };
}

export function contentRectsEqual(a: ContentRect | null, b: ContentRect | null): boolean {
  if (a === b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  const epsilon = 0.5;
  return (
    Math.abs(a.left - b.left) < epsilon &&
    Math.abs(a.top - b.top) < epsilon &&
    Math.abs(a.width - b.width) < epsilon &&
    Math.abs(a.height - b.height) < epsilon
  );
}
