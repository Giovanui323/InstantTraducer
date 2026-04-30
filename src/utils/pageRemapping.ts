import { ReadingProgress, SourcePdf } from '../types';

export function remapPageData<T>(
  data: Record<number, T> | undefined,
  pageOffset: number
): Record<number, T> {
  if (!data) return {};
  const remapped: Record<number, T> = {};
  for (const key in data) {
    const originalPage = parseInt(key, 10);
    if (!isNaN(originalPage)) {
      remapped[originalPage + pageOffset] = data[key];
    }
  }
  return remapped;
}
