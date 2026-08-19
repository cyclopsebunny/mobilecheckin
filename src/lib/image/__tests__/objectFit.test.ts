import { describe, expect, it } from "vitest";
import { containContentRect, contentRectsEqual } from "../objectFit";

describe("containContentRect", () => {
  it("fills the box when the aspect ratios match", () => {
    expect(containContentRect(400, 300, 1600, 1200)).toEqual({
      left: 0,
      top: 0,
      width: 400,
      height: 300
    });
  });

  it("letterboxes a landscape frame on a portrait screen", () => {
    // 16:9 camera stream on a 390x844 phone held upright.
    const rect = containContentRect(390, 844, 1920, 1080);
    expect(rect.width).toBeCloseTo(390);
    expect(rect.height).toBeCloseTo(219.375);
    expect(rect.left).toBeCloseTo(0);
    expect(rect.top).toBeCloseTo(312.3125);
  });

  it("pillarboxes a portrait frame on a landscape screen", () => {
    // Same phone rotated: the letterbox flips axis, which is what made the
    // overlay look rotated 90 degrees when it was drawn over the full box.
    const rect = containContentRect(844, 390, 1080, 1920);
    expect(rect.width).toBeCloseTo(219.375);
    expect(rect.height).toBeCloseTo(390);
    expect(rect.left).toBeCloseTo(312.3125);
    expect(rect.top).toBeCloseTo(0);
  });

  it("preserves a quad's aspect ratio when mapped through the rect", () => {
    // A landscape document filling the middle of a 16:9 frame, shown on a
    // portrait screen. Normalized quad: x 0.15..0.85, y 0.30..0.70.
    const rect = containContentRect(390, 844, 1920, 1080);
    const trueAspect = (0.7 * 1920) / (0.4 * 1080); // 1344px / 432px = 3.11 — wide
    expect(trueAspect).toBeCloseTo(3.1111, 3);

    const mappedAspect = (0.7 * rect.width) / (0.4 * rect.height);
    expect(mappedAspect).toBeCloseTo(trueAspect, 3);

    // The old code stretched the same quad over the full element box. That
    // turns a 3.11 wide shape into a 0.81 tall one — the shape reads as if it
    // were rotated 90 degrees, which is the reported symptom.
    const brokenAspect = (0.7 * 390) / (0.4 * 844);
    expect(brokenAspect).toBeLessThan(1);
    expect(brokenAspect).toBeCloseTo(0.8086, 3);
  });

  it("degrades to the box when media dimensions are unknown", () => {
    expect(containContentRect(300, 200, 0, 0)).toEqual({
      left: 0,
      top: 0,
      width: 300,
      height: 200
    });
  });

  it("never returns negative dimensions for a collapsed box", () => {
    const rect = containContentRect(0, 0, 1920, 1080);
    expect(rect.width).toBe(0);
    expect(rect.height).toBe(0);
  });
});

describe("contentRectsEqual", () => {
  it("treats sub-pixel jitter as equal so the overlay does not re-render each tick", () => {
    const a = { left: 10, top: 20, width: 300, height: 200 };
    expect(contentRectsEqual(a, { left: 10.2, top: 20.1, width: 300.3, height: 199.8 })).toBe(true);
  });

  it("detects a real orientation change", () => {
    const portrait = { left: 0, top: 312, width: 390, height: 219 };
    const landscape = { left: 312, top: 0, width: 219, height: 390 };
    expect(contentRectsEqual(portrait, landscape)).toBe(false);
  });

  it("handles null", () => {
    expect(contentRectsEqual(null, null)).toBe(true);
    expect(contentRectsEqual(null, { left: 0, top: 0, width: 1, height: 1 })).toBe(false);
  });
});
