export const mergeProjectData = (existing, incoming) => {
  const base = (existing && typeof existing === 'object') ? existing : {};
  const next = (incoming && typeof incoming === 'object') ? incoming : {};

  const baseTranslations = (base.translations && typeof base.translations === 'object') ? base.translations : {};
  const nextTranslations = (next.translations && typeof next.translations === 'object') ? next.translations : undefined;

  const baseAnnotations = (base.annotations && typeof base.annotations === 'object') ? base.annotations : {};
  const nextAnnotations = (next.annotations && typeof next.annotations === 'object') ? next.annotations : undefined;

  const baseVerifications = (base.verifications && typeof base.verifications === 'object') ? base.verifications : {};
  const nextVerifications = (next.verifications && typeof next.verifications === 'object') ? next.verifications : undefined;

  const baseTranslationsMeta = (base.translationsMeta && typeof base.translationsMeta === 'object') ? base.translationsMeta : {};
  const nextTranslationsMeta = (next.translationsMeta && typeof next.translationsMeta === 'object') ? next.translationsMeta : undefined;

  const baseVerificationsMeta = (base.verificationsMeta && typeof base.verificationsMeta === 'object') ? base.verificationsMeta : {};
  const nextVerificationsMeta = (next.verificationsMeta && typeof next.verificationsMeta === 'object') ? next.verificationsMeta : undefined;

  const baseReplacements = (base.pageReplacements && typeof base.pageReplacements === 'object') ? base.pageReplacements : {};
  const nextReplacements = (next.pageReplacements && typeof next.pageReplacements === 'object') ? next.pageReplacements : undefined;

  const baseRotations = (base.rotations && typeof base.rotations === 'object') ? base.rotations : {};
  const nextRotations = (next.rotations && typeof next.rotations === 'object') ? next.rotations : undefined;

  const basePageDims = (base.pageDims && typeof base.pageDims === 'object') ? base.pageDims : {};
  const nextPageDims = (next.pageDims && typeof next.pageDims === 'object') ? next.pageDims : undefined;

  const basePageImages = (base.pageImages && typeof base.pageImages === 'object') ? base.pageImages : {};
  const nextPageImages = (next.pageImages && typeof next.pageImages === 'object') ? next.pageImages : undefined;
  const baseSources = (basePageImages.sources && typeof basePageImages.sources === 'object') ? basePageImages.sources : {};
  const nextSources = (nextPageImages?.sources && typeof nextPageImages.sources === 'object') ? nextPageImages.sources : undefined;
  const baseCrops = (basePageImages.crops && typeof basePageImages.crops === 'object') ? basePageImages.crops : {};
  const nextCrops = (nextPageImages?.crops && typeof nextPageImages.crops === 'object') ? nextPageImages.crops : undefined;

  const merged = { ...base, ...next };
  if (nextTranslations) merged.translations = { ...baseTranslations, ...nextTranslations };
  if (nextAnnotations) merged.annotations = { ...baseAnnotations, ...nextAnnotations };
  if (nextVerifications) merged.verifications = { ...baseVerifications, ...nextVerifications };
  if (nextTranslationsMeta) merged.translationsMeta = { ...baseTranslationsMeta, ...nextTranslationsMeta };
  if (nextVerificationsMeta) merged.verificationsMeta = { ...baseVerificationsMeta, ...nextVerificationsMeta };
  if (nextReplacements) merged.pageReplacements = { ...baseReplacements, ...nextReplacements };
  if (nextRotations) merged.rotations = { ...baseRotations, ...nextRotations };
  if (nextPageDims) merged.pageDims = { ...basePageDims, ...nextPageDims };
  if (nextPageImages) {
    const mergedSources = { ...baseSources };
    if (nextSources) {
      for (const [k, v] of Object.entries(nextSources)) {
        if (v === null || v === '') delete mergedSources[k];
        else mergedSources[k] = v;
      }
    }

    const mergedCrops = { ...baseCrops };
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

  if (merged.totalPages !== undefined) {
    const n = Number(merged.totalPages);
    merged.totalPages = (Number.isFinite(n) && n > 0) ? Math.floor(n) : 0;
  }
  if (merged.lastPage !== undefined) {
    const n = Number(merged.lastPage);
    merged.lastPage = (Number.isFinite(n) && n >= 1) ? Math.floor(n) : 1;
  }
  if (typeof merged.totalPages === 'number' && merged.totalPages > 0 && typeof merged.lastPage === 'number') {
    merged.lastPage = Math.min(merged.lastPage, merged.totalPages);
  }

  return merged;
};

export const normalizeLoadedProjectData = (raw) => {
  const data = (raw && typeof raw === 'object') ? { ...raw } : {};

  const coerceTranslations = (src) => {
    if (!src) return {};
    if (Array.isArray(src)) {
      const out = {};
      for (let i = 0; i < src.length; i += 1) {
        const v = src[i];
        if (v == null) continue;
        const page = i + 1;
        out[String(page)] = typeof v === 'string' ? v : String(v);
      }
      return out;
    }
    if (typeof src !== 'object') return {};

    const out = {};
    for (const [k, v] of Object.entries(src)) {
      if (v == null) continue;
      if (typeof v === 'string') out[k] = v;
      else if (Array.isArray(v)) out[k] = v.filter(x => x != null).map(x => String(x)).join('\n');
      else if (typeof v === 'object') {
        const maybeText = v.text ?? v.translatedText ?? v.translation ?? v.value;
        if (typeof maybeText === 'string') out[k] = maybeText;
        else if (maybeText != null) out[k] = String(maybeText);
      } else {
        out[k] = String(v);
      }
    }
    return out;
  };

  const currentTranslations = (data.translations && typeof data.translations === 'object' && !Array.isArray(data.translations))
    ? data.translations
    : null;

  if (!currentTranslations || Object.keys(currentTranslations).length === 0) {
    const candidates = [
      data.translationMap,
      data.translationsMap,
      data.pageTranslations,
      data.pagesTranslations,
      data.translatedPages,
      data.pageMap
    ];
    let picked = null;
    for (const c of candidates) {
      if (c && typeof c === 'object') { picked = c; break; }
    }
    if (!picked && data.pages && typeof data.pages === 'object') picked = data.pages;
    if (!picked && data.results && typeof data.results === 'object') picked = data.results;

    const coerced = coerceTranslations(picked);
    if (Object.keys(coerced).length > 0) data.translations = coerced;
  }

  if (!data.translations || typeof data.translations !== 'object') data.translations = {};

  return data;
};
