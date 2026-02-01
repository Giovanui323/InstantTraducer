Perfetto, ho capito esattamente cosa manca. La ricerca deve essere un ponte diretto verso il contenuto. Ecco il piano aggiornato per permetterti di "aprire" davvero il risultato:

### **1. Navigazione e Apertura Automatica**
Quando cliccherai su un risultato nella lista:
- **Cambio Pagina**: L'app ti porterà istantaneamente alla pagina corretta.
- **Attivazione Testo**: Se sei in modalità "Originale" (solo PDF), l'app **passerà automaticamente alla modalità "Tradotto"** così potrai vedere il testo cercato e le evidenziazioni.
- **Scroll al Punto Esatto**: L'app farà scorrere la pagina fino a centrare il testo trovato, così non dovrai cercarlo manualmente in una pagina lunga.

### **2. Risoluzione Errori Critici (Filtri e Logica)**
- **Filtri Funzionanti**: Attiverò i filtri "Cerca nel titolo" e "Solo prime 2 pagine" che ora sono inattivi.
- **Ricerca nel Titolo**: Se cerchi una parola contenuta nel nome del file, apparirà un risultato speciale che ti permetterà di "aprire" le informazioni del documento.
- **Snippet Intelligenti**: Ogni occorrenza della parola (anche se ripetuta nella stessa pagina) avrà il suo snippet dedicato nella lista, permettendoti di scegliere esattamente quale "aprire".

### **3. Feedback Visivo Potenziato**
- **Highlight Dinamico**: Il termine trovato sarà evidenziato in giallo, ma quello specifico su cui hai cliccato (o che stai navigando con le frecce) diventerà **arancione acceso** per risaltare immediatamente.
- **Navigazione Rapida**: Le frecce Su/Giù nell'header ti permetteranno di scorrere tra tutti i risultati del libro, spostando automaticamente la visuale e il testo.

### **Dettagli Tecnici**
1. Aggiornerò [useSearch.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/hooks/useSearch.ts) per generare risultati granulari (uno per ogni occorrenza).
2. Modificherò [App.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/App.tsx) per gestire lo stato del "risultato attivo" e forzare la modalità tradotta se necessario.
3. Aggiungerò la logica di `scrollIntoView` in [MarkdownText.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/MarkdownText.tsx) per il posizionamento automatico.

Procedo con questa soluzione completa?