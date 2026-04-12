import { useEffect } from 'react';
import { translationManager } from './TranslationManager';
import { log } from '../logger';

interface Props {
  showConfirm: (title: string, message: string, onConfirm: () => void, type?: 'danger' | 'info' | 'alert') => void;
  onOpenProject: (fileId: string) => void;
}

export const TranslationCompletionNotifier: React.FC<Props> = ({ showConfirm, onOpenProject }) => {
  useEffect(() => {
    let lastStatus: string | null = null;
    let lastFileId: string | null = null;

    const unsubscribe = translationManager.subscribe((snapshot) => {
      const job = snapshot.backgroundJob;
      
      if (job && job.fileId !== lastFileId) {
        // New job started
        lastFileId = job.fileId;
        lastStatus = job.status;
      }
      
      if (job && job.fileId === lastFileId && job.status !== lastStatus) {
        // Status changed
        if (job.status === 'completed' && lastStatus !== 'completed') {
           log.info(`[Notifier] Traduzione background completata per ${job.fileName}`);
           
           showConfirm(
             "Traduzione completata",
             `La traduzione di "${job.fileName}" è terminata.`,
             () => onOpenProject(job.fileId),
             'info'
           );
           
           // Optionally clean up the background job after notification?
           // User said: "Se l’utente chiude la modale... lo stato completed rimane visibile".
           // So we don't auto-close it in Manager.
        }
        lastStatus = job.status;
      }
    });
    
    return () => { unsubscribe(); };
  }, [showConfirm, onOpenProject]);

  return null; // Logic only component
};
