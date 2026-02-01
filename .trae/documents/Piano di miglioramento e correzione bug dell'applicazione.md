Ho approfondito ulteriormente l'analisi del codice e ho trovato diversi altri punti critici e opportunità di miglioramento. Ecco il piano completo e definitivo, organizzato per aree di intervento:

**1. Correzione Bug Critici (Priorità 1)**
- **OpenAI API**: Correggerò l'integrazione in [openaiService.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/openaiService.ts) che attualmente usa un endpoint e un formato dati non standard, rendendo l'app inutilizzabile con i modelli OpenAI comuni.
- **Pulizia Testo OCR**: Migliorerò la logica in [textClean.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/textClean.ts) per unire correttamente le parole con lettere spaziate (es. "T I T O L O") di qualsiasi lunghezza, non solo di 3 lettere.

**2. Stabilità e Performance (Sotto il cofano)**
- **Coda di Traduzione**: Implementerò l'annullamento reale (`abort`) delle richieste AI in corso quando si forza una ritraduzione, evitando sprechi di API e possibili sovrascritture di dati.
- **Memoria**: Aggiungerò una pulizia più rigorosa delle risorse (canvas e immagini) durante il cambio pagina per evitare rallentamenti su libri molto lunghi.
- **Offline Mode**: Sposterò le dipendenze di PDF.js da CDN esterno a risorse locali in [useProjectManagement.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/hooks/useProjectManagement.ts).

**3. Architettura e Pulizia Codice**
- **Unificazione Log e Impostazioni**: Eliminerò i logger duplicati e centralizzerò la gestione di tutte le preferenze (inclusi log e lingua) in [useAiSettings.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/hooks/useAiSettings.ts).
- **Context Electron**: Semplificherò le chiamate alle API di sistema eliminando i continui controlli ridondanti sulla presenza di `window.electronAPI`.

**4. Interfaccia e UX**
- **Dialoghi Moderni**: Sostituirò i `confirm` e `alert` del browser con messaggi integrati nell'interfaccia, specialmente nelle operazioni distruttive come l'eliminazione di un progetto.
- **Feedback Errori**: Renderò i messaggi di errore dell'AI più "parlanti" (es. distinguendo tra errore di rete, credito esaurito o chiave non valida).
- **Fix UI Toolbar**: Sistemerò alcune etichette ambigue nella barra degli strumenti principale (es. il tasto "Originale/Traduci").

Questo piano risolve i problemi di funzionamento, migliora la qualità delle traduzioni OCR e rende l'app molto più solida. Procedo?