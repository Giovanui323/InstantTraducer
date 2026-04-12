const normalizeGeminiError = (e: any) => {
  if (e instanceof Error) {
    if (e.message === "Richiesta annullata" && !(e as any).code) {
      (e as any).code = 'ABORTED';
    }
    return e;
  }

  const msg = e?.error?.message || e?.message || e?.statusText || (typeof e === 'string' ? e : "");
  const code = e?.error?.code || e?.status || (e?.name === 'AbortError' ? 'ABORTED' : undefined);

  if (msg.includes("Base64 decoding failed")) {
    return new Error("Immagine non valida: fornire Base64 senza prefisso data:, con mime corretto.");
  }

  if (msg === "Richiesta annullata" || msg === "Operazione annullata") {
    const err = new Error(msg);
    (err as any).code = 'ABORTED';
    return err;
  }

  const finalMsg = msg || "Errore sconosciuto Gemini API";
  const err = new Error(finalMsg);
  if (code) (err as any).code = code;
  return err;
};

export { normalizeGeminiError };
