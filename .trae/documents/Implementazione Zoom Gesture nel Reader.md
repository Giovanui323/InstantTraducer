Ho analizzato il codice e ho definito i passaggi necessari per implementare lo zoom tramite gesture (pinch-to-zoom) nel reader.

Ecco il piano di implementazione:

## Modifiche al componente ReaderView
1.  **Aggiunta della prop `onScaleChange`**: Aggiornerò l'interfaccia `ReaderViewProps` per includere una callback che permetta di comunicare le variazioni di zoom al componente padre.
2.  **Gestione Gesture Vista Principale**:
    -   Aggiungerò un listener per l'evento `wheel` sul contenitore principale del reader (`scrollRef`).
    -   Intercetterò le gesture del trackpad (identificate dal browser come eventi `wheel` con `ctrlKey: true`).
    -   Calcolerò il nuovo fattore di zoom e invocherò `onScaleChange` per aggiornare lo stato globale.
3.  **Gestione Gesture Miniatura Originale**:
    -   Applicherò la stessa logica al componente `OriginalThumbnail` all'interno di `ReaderView.tsx`, permettendo di ridimensionare la miniatura trascinabile tramite pinch gesture.

## Modifiche ad App.tsx
1.  **Collegamento dello Stato**: Passerà la funzione `setScale` al componente `ReaderView` tramite la nuova prop `onScaleChange`. Questo assicurerà che lo zoom effettuato tramite gesture sia persistito e sincronizzato con gli altri controlli dell'interfaccia.

## Verifica
-   Testerò che allargando e rimpicciolendo le dita sul trackpad il testo tradotto e il file originale si ingrandiscano o rimpiccioliscano fluidamente.
-   Verificherò che lo zoom funzioni correttamente sia sulla vista principale che sulla miniatura dell'originale.

Sei d'accordo con questo approccio?