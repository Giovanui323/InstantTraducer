import { ReadingProgress, SourcePdf } from '../types';

export function resolveSourceForPage(
  pdfSources: SourcePdf[],
  logicalPage: number
): { source: SourcePdf; physicalPage: number } | null {
  for (const source of pdfSources) {
    if (logicalPage >= source.startPage && logicalPage <= source.endPage) {
      return {
        source,
        physicalPage: logicalPage - source.startPage + 1,
      };
    }
  }
  return null;
}

export function getPhysicalPageInfo(
  project: ReadingProgress,
  logicalPage: number
): { filePath: string; physicalPage: number } {
  if (project.pdfSources && project.pdfSources.length > 0) {
    const resolved = resolveSourceForPage(project.pdfSources, logicalPage);
    if (resolved) {
      return { filePath: resolved.source.filePath, physicalPage: resolved.physicalPage };
    }
  }
  return { filePath: project.originalFilePath || '', physicalPage: logicalPage };
}
