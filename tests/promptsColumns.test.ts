import { describe, expect, it } from "vitest";
import { getGeminiTranslateSystemPrompt as getTranslateSystemPrompt, getGeminiTranslateUserInstruction as getTranslateUserInstruction } from "../src/services/prompts/gemini";
import { getVerifyQualitySystemPrompt } from "../src/services/verifierPrompts";

describe("prompts (colonne)", () => {
  it("include regola [[PAGE_SPLIT]] nel prompt di traduzione", () => {
    const p = getTranslateSystemPrompt("Inglese", "", true);
    expect(p).toContain("[[PAGE_SPLIT]]");
    expect(p.toLowerCase()).toContain("due colonne");
  });

  it("include vincolo [[PAGE_SPLIT]] nelle istruzioni utente di traduzione", () => {
    const p = getTranslateUserInstruction(23, "English");
    expect(p).toContain("[[PAGE_SPLIT]]");
    expect(p.toLowerCase()).toContain("due colonne");
  });

  it("include controllo colonne nel prompt di verifica", () => {
    const p = getVerifyQualitySystemPrompt(true);
    expect(p).toContain("[[PAGE_SPLIT]]");
    expect(p.toLowerCase()).toContain("struttura a due colonne");
    expect(p.toLowerCase()).toContain("retryhint");
  });
});

