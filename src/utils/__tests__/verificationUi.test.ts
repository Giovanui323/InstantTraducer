import { describe, expect, it } from "vitest";
import { getVerificationUiState } from "../verificationUi";

describe("getVerificationUiState", () => {
  it("ritorna stato idle se non c'è report", () => {
    expect(getVerificationUiState()).toEqual({
      dotClass: "bg-gray-400",
      label: "Verifica non avviata",
      severityLabel: undefined
    });
  });

  it("mappa verifying", () => {
    expect(getVerificationUiState({ state: "verifying" })).toEqual({
      dotClass: "bg-blue-500",
      label: "Verifica in corso…",
      severityLabel: undefined
    });
  });

  it("mappa failed", () => {
    expect(getVerificationUiState({ state: "failed" })).toEqual({
      dotClass: "bg-red-500",
      label: "Verifica fallita",
      severityLabel: undefined
    });
  });

  it("mappa verified ok", () => {
    expect(getVerificationUiState({ state: "verified", severity: "ok" })).toEqual({
      dotClass: "bg-green-500",
      label: "Verifica OK",
      severityLabel: undefined
    });
  });

  it("mappa verified minor", () => {
    expect(getVerificationUiState({ state: "verified", severity: "minor" })).toEqual({
      dotClass: "bg-amber-500",
      label: "Verifica: attenzione",
      severityLabel: "MINOR"
    });
  });

  it("mappa verified severe", () => {
    expect(getVerificationUiState({ state: "verified", severity: "severe" })).toEqual({
      dotClass: "bg-red-500",
      label: "Verifica: problemi gravi",
      severityLabel: "SEVERE"
    });
  });

  it("evidenzia report da ricontrollare anche se severity ok", () => {
    expect(getVerificationUiState({ state: "verified", severity: "ok", postRetryFailed: true })).toEqual({
      dotClass: "bg-amber-500",
      label: "Verifica: da ricontrollare",
      severityLabel: undefined
    });
  });

  it("evidenzia testo aggiornato anche se severity ok", () => {
    expect(getVerificationUiState({ state: "verified", severity: "ok", changed: true })).toEqual({
      dotClass: "bg-amber-500",
      label: "Verifica: testo aggiornato",
      severityLabel: undefined
    });
  });
});
