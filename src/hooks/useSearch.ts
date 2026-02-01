import { useCallback, useState, useMemo, useEffect } from 'react';

export interface SearchResultItem {
  id: string;
  title: string;
  subtitle?: string;
  snippet: string;
  page: number;
  matchIndex: number;
}

export function useSearch(
  translationMap: Record<number, string> = {}, 
  currentPage: number = 1, 
  setCurrentPage?: (p: number) => void,
  documentName?: string
) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [activeResultId, setActiveResultId] = useState<string | null>(null);
  
  const [filters, setFilters] = useState({
    inTitle: true,
    firstTwoPages: false
  });

  // Debounce logic
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const toggleSearch = useCallback(() => setSearchOpen(v => !v), []);
  
  const setFilter = useCallback((key: keyof typeof filters, value: boolean) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  const searchHitsMap = useMemo(() => {
    const out: Record<number, number> = {};
    const q = (debouncedSearchTerm || '').trim();
    if (!q) return out;

    const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    
    for (const [k, v] of Object.entries(translationMap)) {
      const pageNum = Number(k);
      
      // Apply firstTwoPages filter
      if (filters.firstTwoPages && pageNum > 2) continue;

      if (typeof v !== 'string' || v.trim().length === 0) continue;
      const matches = v.match(re);
      const count = matches ? matches.length : 0;
      if (count > 0) out[pageNum] = count;
    }
    return out;
  }, [debouncedSearchTerm, translationMap, filters.firstTwoPages]);

  const pagesWithHits = useMemo(() => Object.keys(searchHitsMap).map(Number).sort((a, b) => a - b), [searchHitsMap]);
  const totalHits = useMemo(() => {
    let count = (Object.values(searchHitsMap) as number[]).reduce((a, b) => a + b, 0);
    // Add title hit
    const q = (debouncedSearchTerm || '').trim();
    if (q && filters.inTitle && documentName?.toLowerCase().includes(q.toLowerCase())) {
      count += 1;
    }
    return count;
  }, [searchHitsMap, debouncedSearchTerm, filters.inTitle, documentName]);

  const searchResults = useMemo(() => {
    const q = (debouncedSearchTerm || '').trim();
    if (!q) return [];
    
    const results: SearchResultItem[] = [];

    // 1. Search in title if filter active
    if (filters.inTitle && documentName && documentName.toLowerCase().includes(q.toLowerCase())) {
      results.push({
        id: 'search-title',
        title: 'Titolo Documento',
        subtitle: documentName,
        snippet: documentName,
        page: 1,
        matchIndex: -1
      });
    }

    // 2. Search in pages
    pagesWithHits.forEach(p => {
      const text = translationMap[p] || '';
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      let match;
      let matchIdx = 0;
      while ((match = re.exec(text)) !== null) {
        const idx = match.index;
        const start = Math.max(0, idx - 40);
        const end = Math.min(text.length, idx + q.length + 40);
        let snippet = text.slice(start, end);
        if (start > 0) snippet = '...' + snippet;
        if (end < text.length) snippet = snippet + '...';

        results.push({
          id: `search-p${p}-m${matchIdx}`,
          title: `Pagina ${p}`,
          subtitle: `Occorrenza ${matchIdx + 1}`,
          snippet,
          page: p,
          matchIndex: matchIdx
        });
        matchIdx++;
        // Limit to 20 matches per page to avoid performance issues in the list
        if (matchIdx >= 20) break;
      }
    });

    return results;
  }, [debouncedSearchTerm, pagesWithHits, translationMap, filters.inTitle, documentName]);

  const goToNextSearch = useCallback(() => {
    if (searchResults.length === 0 || !setCurrentPage) return;
    
    const currentIndex = searchResults.findIndex(r => r.id === activeResultId);
    const nextIndex = (currentIndex + 1) % searchResults.length;
    const nextResult = searchResults[nextIndex];
    
    setActiveResultId(nextResult.id);
    setCurrentPage(nextResult.page);
  }, [searchResults, activeResultId, setCurrentPage]);

  const goToPrevSearch = useCallback(() => {
    if (searchResults.length === 0 || !setCurrentPage) return;
    
    const currentIndex = searchResults.findIndex(r => r.id === activeResultId);
    const prevIndex = currentIndex <= 0 ? searchResults.length - 1 : currentIndex - 1;
    const prevResult = searchResults[prevIndex];
    
    setActiveResultId(prevResult.id);
    setCurrentPage(prevResult.page);
  }, [searchResults, activeResultId, setCurrentPage]);

  return { 
    searchOpen, 
    setSearchOpen,
    searchTerm, 
    setSearchTerm, 
    toggleSearch, 
    filters, 
    setFilter,
    searchHitsMap,
    pagesWithHits,
    totalHits,
    searchResults,
    activeResultId,
    setActiveResultId,
    goToNextSearch,
    goToPrevSearch
  };
}

