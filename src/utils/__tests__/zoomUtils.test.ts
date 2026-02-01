import { describe, expect, it } from "vitest";
import { getNextScaleFromWheel } from "../zoomUtils";

describe("getNextScaleFromWheel", () => {
  it("aumenta la scala quando deltaY è negativo", () => {
    const next = getNextScaleFromWheel(1, { deltaY: -10, deltaMode: 0 }, { min: 0.3, max: 5, intensity: 0.002, precision: 3, maxDelta: 50 });
    expect(next).toBeGreaterThan(1);
  });

  it("diminuisce la scala quando deltaY è positivo", () => {
    const next = getNextScaleFromWheel(1, { deltaY: 10, deltaMode: 0 }, { min: 0.3, max: 5, intensity: 0.002, precision: 3, maxDelta: 50 });
    expect(next).toBeLessThan(1);
  });

  it("clampa al massimo", () => {
    const next = getNextScaleFromWheel(7.9, { deltaY: -1000, deltaMode: 0 }, { min: 0.5, max: 8, intensity: 0.002, precision: 3, maxDelta: 50 });
    expect(next).toBe(8);
  });

  it("clampa al minimo", () => {
    const next = getNextScaleFromWheel(0.51, { deltaY: 1000, deltaMode: 0 }, { min: 0.5, max: 8, intensity: 0.002, precision: 3, maxDelta: 50 });
    expect(next).toBe(0.5);
  });

  it("considera deltaMode per la magnitudine", () => {
    const nextPixel = getNextScaleFromWheel(1, { deltaY: -1, deltaMode: 0 }, { min: 0.3, max: 5, intensity: 0.002, precision: 3, maxDelta: 50 });
    const nextLine = getNextScaleFromWheel(1, { deltaY: -1, deltaMode: 1 }, { min: 0.3, max: 5, intensity: 0.002, precision: 3, maxDelta: 50 });
    expect(nextLine).toBeGreaterThan(nextPixel);
  });
});
