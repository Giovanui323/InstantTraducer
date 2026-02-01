import { describe, expect, it } from "vitest";
import path from "path";
import { isPathInside, safeJoinAssets } from "../../../electron/pathSecurity.js";

describe("pathSecurity", () => {
  it("riconosce percorsi interni alla base", () => {
    const base = path.resolve("/tmp/assets");
    expect(isPathInside(base, path.join(base, "a", "b.png"))).toBe(true);
    expect(isPathInside(base, base)).toBe(true);
  });

  it("rifiuta percorsi fuori dalla base", () => {
    const base = path.resolve("/tmp/assets");
    expect(isPathInside(base, "/tmp/elsewhere/x.pdf")).toBe(false);
  });

  it("safeJoinAssets compone path sicuro e blocca traversal", () => {
    const base = path.resolve("/tmp/assets");
    expect(safeJoinAssets(base, "img/p1.jpg")).toBe(path.resolve(base, "img/p1.jpg"));
    expect(() => safeJoinAssets(base, "../secret.txt")).toThrow();
    expect(() => safeJoinAssets(base, "img/../../secret.txt")).toThrow();
  });
});

