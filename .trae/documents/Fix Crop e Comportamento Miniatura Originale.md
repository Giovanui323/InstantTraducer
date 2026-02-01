## Implementazione Correzioni Crop e Miniature

### 1. Correzione Layering (Z-Index)
Aumenterò lo z-index della modale di ritaglio per assicurarmi che appaia sopra l'anteprima.
- Modifica `src/components/ImageCropModal.tsx`: cambia `z-[320]` in `z-[500]`.

### 2. Comportamento Miniatura
Allineerò il click sulla miniatura al comportamento del tasto "Originale" della toolbar.
- Modifica `src/components/ReaderView.tsx`:
    - Il click principale sulla miniatura (`onOpen`) ora chiamerà `onOpenOriginalPage`, che commuta l'intera visualizzazione in modalità originale (PDF).
    - Il click sull'icona di espansione (`onOpenModal`) continuerà ad aprire l'anteprima modale.

### 3. Miglioramento Gestione Ritaglio
Aggiungerò controlli nell'anteprima per gestire i ritagli esistenti.
- Modifica `src/components/OriginalPreviewModal.tsx`:
    - Aggiunta di un toggle tra "Immagine Originale" e "Ritaglio" se quest'ultimo esiste.
    - Aggiunta di un tasto per eliminare il ritaglio corrente.
- Modifica `src/components/ReaderView.tsx`: passaggio dei dati e delle funzioni (`hasCrop`, `showCrop`, `onClearCrop`) alla modale di anteprima.

### 4. Verifica Finale
- Verificherò che salvando un crop la modale sia visibile.
- Verificherò che cliccando sulla miniatura si passi correttamente alla visualizzazione PDF originale.
- Verificherò che sia possibile tornare all'immagine originale dopo aver effettuato un ritaglio.