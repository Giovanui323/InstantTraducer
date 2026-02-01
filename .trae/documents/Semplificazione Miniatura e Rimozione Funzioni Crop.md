## Semplificazione Comportamento Miniatura e Rimozione Crop

### 1. Rimozione Funzionalità Crop e Anteprima
Eliminerò le componenti e le funzioni relative al ritaglio e alla modale di anteprima, come richiesto.
- Eliminazione file: `src/components/ImageCropModal.tsx` e `src/components/OriginalPreviewModal.tsx`.
- Rimozione di `onCropPage`, `Scissors` (forbici) e relativi riferimenti in `App.tsx` e `ReaderView.tsx`.

### 2. Trasformazione Miniatura in Toggle Diretto
Modificherò la miniatura fluttuante in `src/components/ReaderView.tsx` affinché agisca da interruttore per la visualizzazione originale.
- **In modalità Traduzione**: La miniatura mostra l'immagine della pagina. Cliccandola si passa alla visualizzazione originale (PDF).
- **In modalità Originale**: Al posto della miniatura comparirà un **bottone rosso di chiusura** (con una "X"). Cliccandolo si tornerà alla visualizzazione tradotta.
- La componente rimarrà trascinabile (draggable) per permetterti di posizionarla dove preferisci.

### 3. Aggiornamento Logica in App.tsx
- Passaggio della funzione `onToggleTranslatedMode` a `ReaderView`.
- Pulizia dei vari stati e handler ormai inutilizzati (cropModal, previewPage, etc.).

### 4. Verifica Finale
- Confermerò che il click sulla miniatura passi all'originale e viceversa tramite il bottone rosso, senza aprire modali intermedie.