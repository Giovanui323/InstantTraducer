# Risoluzione distorsione immagini originali

## Problemi identificati:
1. **Larghezza forzata**: Il ReaderView forza tutte le pagine a una larghezza comune (`frameDims.width`), causando distorsioni se le pagine hanno aspect ratio diversi.
2. **Ratio di default errato**: La miniatura usa un aspect ratio fisso (1.41) che non si adatta alle pagine landscape.
3. **Ritardo nei metadati**: Le dimensioni reali della pagina vengono acquisite solo al primo rendering, causando distorsioni temporanee.

## Passaggi di implementazione:

### 1. Ottimizzazione ReaderView
- Modificare lo stile del contenitore pagina in `ReaderView.tsx` per usare `dims.width` invece di `frameDims.width`.
- Aggiornare il calcolo di `effectiveScale` per essere basato sulla larghezza reale di ogni singola pagina rispetto al viewport.

### 2. Correzione Miniature
- Aggiornare `OriginalThumbnail` per calcolare dinamicamente l'aspect ratio dell'immagine caricata se `pageRatio` non è disponibile.
- Impedire lo schiacciamento forzato della miniatura impostando `height: auto` o un ratio corretto.

### 3. Sincronizzazione Dimensioni
- In `App.tsx`, assicurarsi che le dimensioni della pagina vengano salvate nei metadati del progetto non appena sono disponibili (anche durante la generazione delle immagini per l'AI).

### 4. Verifica
- Caricare un PDF con pagine di dimensioni miste (Portrait/Landscape) e verificare che l'aspect ratio sia mantenuto correttamente in tutte le modalità di visualizzazione.

Confermi di voler procedere con queste modifiche?