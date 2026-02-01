## Correzione Layout Anteprima e Bottoni

### 1. Modifica OriginalPreviewModal.tsx
*   **Correzione Larghezza Bottoni**: Cambierò `items-stretch` in `items-end` nel contenitore dei bottoni (linea 225) per evitare che il tasto "Chiudi" si allarghi eccessivamente.
*   **Aumento z-index**: Porterò lo `z-index` del modal da `z-[200]` a `z-[400]` per assicurarmi che copra correttamente la barra centrale (MainToolbar) e altri elementi flottanti.
*   **Compattazione UI**: Ridurrò il padding dei bottoni "PDF" e "Immagine" per renderli meno ingombranti e più coerenti con il resto dell'interfaccia.

### 2. Modifica App.tsx
*   **Gestione Visibilità**: Nasconderò la `MainToolbar` e la `PagePreviewStrip` quando il `previewPage` è attivo. Questo pulirà l'interfaccia durante l'anteprima, evitando sovrapposizioni inutili.

### 3. Raffinatezze Estetiche
*   Uniformerò lo stile dei bottoni per un look più moderno e professionale, seguendo il feedback sull'aspetto "orribile" della versione attuale.
