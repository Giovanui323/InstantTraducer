import { describe, expect, it } from "vitest";
import { ensureBase64, detectImageMime } from "../imageUtils";

describe("imageUtils", () => {
  it("ensureBase64 rimuove il prefisso data:", () => {
    const dataUrl = "data:image/jpeg;base64,/9j/AAAB";
    const base64 = "/9j/AAAB";
    expect(ensureBase64(dataUrl)).toBe(base64);
  });

  it("detectImageMime legge mime da dataUrl o usa fallback", () => {
    const dataUrl = "data:image/jpeg;base64,/9j/AAAB";
    const base64 = "/9j/AAAB";
    expect(detectImageMime(dataUrl)).toBe("image/jpeg");
    expect(detectImageMime(base64)).toBe("image/jpeg");
  });
});
