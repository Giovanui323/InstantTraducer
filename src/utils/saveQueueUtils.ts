export const mergeSaveDelta = (base: any, incoming: any) => {
  const b = (base && typeof base === 'object') ? base : {};
  const n = (incoming && typeof incoming === 'object') ? incoming : {};
  const merged: any = { ...b, ...n };

  const pageIndexedFields = [
    'translations', 'translationsMeta', 'annotations',
    'verifications', 'verificationsMeta', 'pageDims',
    'userHighlights', 'userNotes'
  ] as const;

  for (const field of pageIndexedFields) {
    if (n[field] && typeof n[field] === 'object') {
      merged[field] = { ...(b[field] || {}), ...n[field] };
    }
  }

  if (n.pageImages && typeof n.pageImages === 'object') {
    const basePageImages = (b.pageImages && typeof b.pageImages === 'object') ? b.pageImages : {};
    const nextPageImages = n.pageImages;
    const baseSources = (basePageImages.sources && typeof basePageImages.sources === 'object') ? basePageImages.sources : {};
    const nextSources = (nextPageImages.sources && typeof nextPageImages.sources === 'object') ? nextPageImages.sources : undefined;
    const baseCrops = (basePageImages.crops && typeof basePageImages.crops === 'object') ? basePageImages.crops : {};
    const nextCrops = (nextPageImages.crops && typeof nextPageImages.crops === 'object') ? nextPageImages.crops : undefined;

    const mergedSources: Record<string, any> = { ...baseSources };
    if (nextSources) {
      for (const [k, v] of Object.entries(nextSources)) {
        if (v === null || v === '') delete mergedSources[k];
        else mergedSources[k] = v;
      }
    }

    const mergedCrops: Record<string, any> = { ...baseCrops };
    if (nextCrops) {
      for (const [k, v] of Object.entries(nextCrops)) {
        if (v === null || v === '') delete mergedCrops[k];
        else mergedCrops[k] = v;
      }
    }

    merged.pageImages = {
      ...basePageImages,
      ...nextPageImages,
      ...(nextSources ? { sources: mergedSources } : {}),
      ...(nextCrops ? { crops: mergedCrops } : {})
    };
  }

  return merged;
};

export const buildProjectSavePayload = (fileId: string, data: any, base: any) => {
  const fileName = data?.fileName || base?.fileName;
  if (!fileName) return null;

  const payload: any = { ...(data || {}) };
  payload.fileId = fileId;
  payload.fileName = fileName;

  if (payload.originalFilePath == null && base?.originalFilePath) payload.originalFilePath = base.originalFilePath;
  if (payload.totalPages == null && base?.totalPages != null) payload.totalPages = base.totalPages;
  if (payload.lastPage == null && base?.lastPage != null) payload.lastPage = base.lastPage;
  if (payload.inputLanguage == null && base?.inputLanguage) payload.inputLanguage = base.inputLanguage;

  return payload;
};

