import { useState, useEffect } from 'react';
import { translationManager, ManagerSnapshot } from '../services/translation/TranslationManager';

export const useTranslationSnapshot = () => {
  const [snapshot, setSnapshot] = useState<ManagerSnapshot>(translationManager.getSnapshot());

  useEffect(() => {
    const unsubscribe = translationManager.subscribe((s) => {
      setSnapshot(s);
    });
    return () => { unsubscribe(); };
  }, []);

  return snapshot;
};
