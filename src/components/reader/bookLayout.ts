export type ReaderViewModePreference = 'auto' | 'single' | 'spread';

export type ReaderResolvedViewMode = 'single' | 'spread';

export interface ResolveReaderViewModeOptions {
  isLandscape: boolean;
  hasSplitText: boolean;
}

export function resolveReaderViewMode(
  preference: ReaderViewModePreference,
  { isLandscape, hasSplitText }: ResolveReaderViewModeOptions
): ReaderResolvedViewMode {
  if (preference === 'single') return 'single';
  if (preference === 'spread') return 'spread';

  if (!hasSplitText) return 'single';
  return isLandscape ? 'spread' : 'single';
}

export function getFlipRenderPages(params: { pages: number[]; currentPage?: number }): number[] {
  const { pages, currentPage } = params;
  const validPages = pages.filter((p) => typeof p === 'number' && Number.isFinite(p) && p >= 1);
  const base = (typeof currentPage === 'number' && Number.isFinite(currentPage))
    ? currentPage
    : (validPages[0] ?? null);
  if (base == null) return [];
  return validPages.includes(base) ? [base] : [];
}
