**Problema**
- In Home, cliccando un progetto già attivo, appare la conferma di chiudere la sessione, anche se si vuole solo rientrare nello stesso progetto.

**Analisi tecnica**
- La conferma è mostrata in handleOpenProject quando esiste una sessione (pdfDoc | isReaderMode): [App.tsx:handleOpenProject](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/App.tsx#L2497-L2505)
- La Home viene mostrata se non c’è sessione o se isHomeView è true: [App.tsx:showHome](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/App.tsx#L2609-L2611)
- Il pulsante "Home" inverte solo isHomeView senza chiudere la sessione: [App.tsx:onReset](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/App.tsx#L2867-L2870)
- La lista "Recenti" usa handleOpenProject(book.fileId): [App.tsx:Home Recenti](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/App.tsx#L2977-L3007)
- Il fileId corrente si può ricavare da metadata.name con projectFileIdFromName: [useProjectLibrary.ts:projectFileIdFromName](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/hooks/useProjectLibrary.ts#L134-L137)

**Modifica proposta**
- In handleOpenProject, prima di mostrare la conferma:
  - Se esiste sessione e fileId richiesto === fileId del progetto attivo, non chiedere conferma e non chiudere la sessione; impostare isHomeView = false per tornare al Reader.
  - Se fileId richiesto è diverso, mantenere l’attuale comportamento: chiedere conferma, chiudere la sessione e caricare il nuovo progetto.

**Passi di implementazione**
- Aggiornare handleOpenProject in [App.tsx](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/App.tsx#L2497-L2505):
  - Calcolare currentFileId da metadata?.name e projectFileIdFromName.
  - Branch logico: stesso progetto → setIsHomeView(false) e return; diverso progetto → conferma + closeActiveSession + load.
- Non toccare il comportamento della card "Sessione attiva" che chiude esplicitamente la sessione: [App.tsx](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/App.tsx#L2923-L2939)

**Verifica**
- Scenario A: apri Progetto A → vai su Home → clicca Progetto A → niente prompt, si rientra al lettore allo stato corrente.
- Scenario B: apri Progetto A → vai su Home → clicca Progetto B → appare la conferma, la sessione si chiude e si carica B.
- Scenario C: nessuna sessione attiva → dalla Home, aprire un progetto non mostra conferma.

**Impatto e rischi**
- Cambio minimo, confinato alla logica di apertura; nessun impatto su salvataggi o IPC.
- Gestire correttamente metadata null (quando non c’è progetto attivo) con controllo difensivo.

Confermi che procedo con questa modifica?