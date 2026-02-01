import { describe, expect, it } from "vitest";
import { safeParseJsonObject } from "../json";

describe("safeParseJsonObject", () => {
  it("parsa JSON valido", () => {
    expect(safeParseJsonObject("{\"a\":1}")).toEqual({ a: 1 });
  });

  it("estrae JSON da testo misto", () => {
    expect(safeParseJsonObject(`foo
{
  "a": 1
}
bar`)).toEqual({ a: 1 });
  });

  it("fallisce su risposta vuota", () => {
    expect(() => safeParseJsonObject("")).toThrow();
  });
});
