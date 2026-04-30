export const stripPreamble = (text: string): string => {
  if (!text) return "";
  let t = text;
  t = t.replace(/^(Ecco|Qui di seguito|La traduzione|Traduzione:).*?[\n:]+/gim, "");
  t = t.replace(/^(Certamente|Sicuro|Ok|Va bene).*?[\n]+/gim, "");
  return t;
}

export const cleanTranslationText = (text: string): string => {
  if (!text) return "";
  let t = stripPreamble(text);
  t = t.replace(/\b([A-ZÀ-ÖØ-öø-ÿ])(\s+[A-ZÀ-ÖØ-öø-ÿ])+\b/g, (m) => m.replace(/\s+/g, ""));
  t = t.replace(/\r\n/g, "\n");
  t = t.replace(/<\s*br\s*\/?\s*>/gi, "\n");
  t = t.replace(/&nbsp;/gi, " ");
  t = t.replace(/[ \t]+\n/g, "\n");
  t = t.replace(/\n[ \t]+/g, "\n");
  t = t.replace(/\n{3,}/g, "\n\n");
  // Strip markdown heading syntax (### Title → Title) — AI models sometimes emit this
  t = t.replace(/^#{1,3}[ \t]+/gm, "");
  return t;
}
