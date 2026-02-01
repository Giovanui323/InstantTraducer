export const countWords = (text: string) => (text.trim().match(/\S+/g) || []).length;
export const countParagraphs = (text: string) => text.split(/\n\s*\n/).filter(Boolean).length;

export function normalize(text: string) {
  return text.replace(/\r\n/g, '\n').replace(/\t/g, ' ').replace(/ {2,}/g, ' ').trim();
}

export function splitColumns(text: string) {
  const PAGE_SPLIT = '[[PAGE_SPLIT]]';
  const hasSplit = text.includes(PAGE_SPLIT);
  if (!hasSplit) return [text];
  const [left, right] = text.split(PAGE_SPLIT);
  return [left, right];
}
