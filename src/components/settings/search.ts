export type SettingsSearchItem = {
  id: string;
  sectionId: string;
  sectionLabel: string;
  title: string;
  description?: string;
  keywords?: string[];
  anchorId: string;
};

export const filterSettingsSearchItems = (items: SettingsSearchItem[], query: string) => {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored = items
    .map((it) => {
      const hay = [
        it.title,
        it.sectionLabel,
        it.description || '',
        (it.keywords || []).join(' ')
      ].join(' ').toLowerCase();
      const idx = hay.indexOf(q);
      if (idx === -1) return null;
      const score = idx === 0 ? 100 : Math.max(0, 80 - idx);
      return { it, score };
    })
    .filter(Boolean) as Array<{ it: SettingsSearchItem; score: number }>;

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.it);
};

