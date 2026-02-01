import { useState, useEffect, useCallback } from 'react';

export const useInputLanguageDefault = () => {
  const [defaultLang, setDefaultLang] = useState<string>('tedesco');

  useEffect(() => {
    const stored = localStorage.getItem('input_language_default');
    if (stored && stored.trim()) {
      setDefaultLang(stored);
    }
  }, []);

  const saveDefaultLang = useCallback((lang: string) => {
    const next = lang.trim() || 'tedesco';
    setDefaultLang(next);
    localStorage.setItem('input_language_default', next);
  }, []);

  return {
    defaultLang,
    setDefaultLang: saveDefaultLang
  };
};

