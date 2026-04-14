export const safeParseJsonObject = (raw: string): any => {
  let text = (raw || "").trim();
  if (!text) throw new Error("Risposta vuota");
  // Rimuove eventuali code-fence ```json ... ``` o ``` ... ```
  if (text.startsWith("```")) {
    const firstFenceEnd = text.indexOf("\n");
    if (firstFenceEnd >= 0) {
      const closingFenceIdx = text.lastIndexOf("```");
      if (closingFenceIdx > firstFenceEnd) {
        text = text.slice(firstFenceEnd + 1, closingFenceIdx).trim();
      }
    }
  }
  try {
    const obj = JSON.parse(text);
    if (obj && typeof obj === "object") return obj;
    throw new Error("JSON non valido");
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end < 0 || end <= start) throw new Error("JSON non trovato");
    const slice = text.slice(start, end + 1);
    try {
      const obj = JSON.parse(slice);
      if (obj && typeof obj === "object") return obj;
      throw new Error("JSON non valido");
    } catch (sliceError) {
      // Fallback aggressivo: sanitizzazione per "Bad escaped character" (es. newline o tab non escaped)
      try {
        const sanitized = slice.replace(/[\u0000-\u001F]+/g, ' ');
        const sanitizedObj = JSON.parse(sanitized);
        if (sanitizedObj && typeof sanitizedObj === "object") return sanitizedObj;
      } catch (sanitizedError) {
        throw new Error("JSON non valido e non recuperabile");
      }
      throw new Error("JSON non valido");
    }
  }
};
