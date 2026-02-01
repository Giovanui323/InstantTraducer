Ho analizzato il motivo per cui la ritraduzione automatica non parte sempre come previsto dopo una verifica manuale. 

### **Analisi del problema**
1.  **Limite di Tentativi**: Esiste già una logica di "auto-fix" che interviene quando la severità è `SEVERE`, ma è limitata da un numero massimo di tentativi (default 1). Se la pagina è stata già ritradotta una volta e fallisce di nuovo, il sistema non riprova all'infinito per evitare loop di consumo API.
2.  **Contesto Manuale**: Quando avvii manualmente una "Rianalisi", il contatore dei tentativi non viene resettato. Se avevi già provato a tradurre quella pagina, il sistema "pensa" di aver già esaurito i tentativi automatici.
3.  **Mancanza di Controllo Manuale**: Nel pannello "Dubbi & verifica" mancano le istruzioni esplicite per forzare la ritraduzione usando i suggerimenti emersi dalla verifica.

### **Soluzione Proposta**

#### **1. Reset del contatore su Rianalisi**
Modificherò `useAppQuality.ts` per fare in modo che, quando richiedi manualmente una "Rianalisi", il contatore dei tentativi per quella pagina venga azzerato. Questo permetterà alla logica automatica di ripartire se la nuova analisi conferma problemi gravi.

#### **2. Nuovo tasto "Rifai traduzione migliorata"**
Aggiungerò nel modal di verifica un pulsante esplicito che ti permetta di far ripartire la traduzione includendo automaticamente nel prompt le evidenze trovate (es. "Mancano le formule", "Titolo saltato").

#### **3. Miglioramento del Prompt di Recupero**
Potenzierò la logica che costruisce le istruzioni di "fix" per assicurarmi che il modello AI riceva un ordine perentorio di non omettere nulla, citando specificamente i pezzi mancanti identificati dal verificatore.

### **Dettagli Tecnici**
- **File coinvolti**:
    - [useAppQuality.ts](file:///Users/lucasicignano/Lavoro temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/hooks/useAppQuality.ts): Aggiunta funzione `fixTranslation` e reset contatore.
    - [ReaderView.tsx](file:///Users/lucasicignano/Lavoro temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/ReaderView.tsx): Aggiunta del tasto "Rifai" nel `NotesModal`.
    - [App.tsx](file:///Users/lucasicignano/Lavoro temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/App.tsx): Collegamento della nuova funzione tra gli hook.

Procedo con l'implementazione?