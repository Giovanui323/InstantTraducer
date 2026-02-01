### 1. Dettagli nel Provider Gemini
Aggiornerò `geminiService.ts` per inviare messaggi di progresso molto più specifici tramite il callback `onProgress`:
- **Preparazione**: "Lettura immagine e ottimizzazione prompt..."
- **Invio**: "Richiesta inviata a Gemini (model: [model]). In attesa del primo chunk..."
- **Streaming**: "Ricezione testo in corso... ([caratteri] ricevuti)"
- **Heartbeat**: Se Gemini impiega tempo, il sistema dirà: "Gemini sta ancora pensando... (attesa da [secondi]s)"
- **Post-Processing**: "Pulizia del testo e rimozione meta-testi AI..."
- **Verifica**: "Verifica coerenza linguistica (italiano) in corso..."

### 2. Dettagli nel Provider OpenAI
Aggiornerò `openaiService.ts` con log simili:
- "Connessione ai server OpenAI..."
- "Analisi immagine in corso..."
- "Risposta ricevuta, elaborazione testo..."

### 3. Dettagli nella Preparazione della Pagina
Aggiornerò `useAppTranslation.ts` per tracciare i passaggi "locali" prima dell'invio all'IA:
- **In Coda**: Appena clicchi o scorri, lo stato diventerà "In coda per la traduzione...".
- **Rendering**: "Rendering della pagina PDF in alta risoluzione..."
- **Cache**: "Recupero immagine originale salvata..."

### 4. Miglioramento dell'Interfaccia Utente (ReaderView)
Aggiornerò `ReaderView.tsx` per rendere queste informazioni più leggibili:
- **Testo di Stato**: Il messaggio centrale sarà più dinamico e mostrerà questi nuovi log dettagliati.
- **Log Console**: La piccola console in fondo alla pagina (`geminiLogs`) sarà più visibile.
- **Distinzione Coda vs Lavoro**: Se una pagina è solo in coda (perché ne stai traducendo già 2 contemporaneamente), scriverà chiaramente "In attesa nella coda..." invece di un generico "Elaborazione".
