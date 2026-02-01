**Obiettivo**

* Rendere chiaro “cosa sta facendo” l’app in ogni momento: IPC, I/O su disco, traduzione Gemini, esportazione PDF, salvataggio/caricamento impostazioni e stato UI.

**Contesto attuale**

* Nessuna libreria di logging dedicata in package.json.

* Logging quasi solo in main con errori; poche tracce in React.

  * File principali da toccare: [main.js](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/electron/main.js), [preload.cjs](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/electron/preload.cjs), [geminiService.ts](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/services/geminiService.ts), [aiService.ts](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/services/aiService.ts), [App.tsx](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/App.tsx), [useAiSettings.ts](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/hooks/useAiSettings.ts), [useProjectLibrary.ts](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/hooks/useProjectLibrary.ts).

**Strategia di logging**

* Implemento un logger leggero senza dipendenze:

  * Livelli: trace, debug, info, warn, error.

  * Timestamp ISO, contesto (modulo), operationId correlato.

  * Output: console (dev) + file app.log in app.getPath('userData') con rotazione giornaliera.

  * Sanitizzazione: maschero API key, token sensibili e testo lungo (prompt) con regole.

* Variabili di controllo: LOG\_LEVEL (env/impostazioni), LOG\_TO\_FILE (on/off), VERBOSE (toggle UI).

**Punti di strumentazione**

* Processo Main (Electron):

  * Lifecycle e BrowserWindow: avvio/chiusura, URL caricato, dimensioni, crash.

  * Tutti i canali IPC con before/after + timing e dimensione payload:

    * open-file-dialog, open-project-dialog, save-settings, load-settings, save-translation(-requested), save/read/delete image, get/load/delete/rename translation, read-pdf-file, copy-original-pdf, get-original-pdf-path, export-translations-pdf. Vedi [main.js](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/electron/main.js#L395-L1105).

  * Esportazione PDF: log per inizio/fine, per pagina, tempo per pagina, path output e dimensione.

  * Persistenza stato (userData JSON) <mccoremem id="03fgpnlpwms0rltvstgk333h0" />: log a ogni salvataggio/caricamento con esito.

* Renderer/Servizi AI:

  * aiService: log di routing provider, pagina, lingua, fallback/ritentativi. Vedi [aiService.ts](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/services/aiService.ts#L1-L50).

  * geminiService: per ogni funzione (checkItalian, translate, verifyQuality, testConnection, extractPdfMetadata):

    * start/end, modello, temperatura/parametri, latenza totale, dimensione input, conteggio chunk streaming, eventuali retry.

    * errori con codice/stato, senza esporre chiave o prompt completo. Vedi [geminiService.ts](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/services/geminiService.ts#L203-L421).

  * Settings/localStorage: lettura/scrittura chiave API e modelli con esito. Vedi [useAiSettings.ts](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/hooks/useAiSettings.ts#L5-L40), [App.tsx](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/App.tsx#L308).

  * Libreria progetto: caricamenti/salvataggi ed errori. Vedi [useProjectLibrary.ts](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/hooks/useProjectLibrary.ts).

**UX di controllo**

* Aggiungo toggle “Verbose logging” nelle Impostazioni AI.

* Mostro il livello corrente e un pulsante “Apri file di log” (solo dev) che apre il percorso in Finder.

* Supporto ENV: LOG\_LEVEL=debug per abilitare subito il dettaglio.

**Sicurezza e performance**

* Non loggo API key, contenuti sensibili, né path fuori dallo scope progetto.

* Riduzione rumore: campiono trace in loop lunghi; dimensione massima per stringhe.

**Deliverable**

* Nuovi moduli: electron/logger.ts e src/utils/logger.ts condividendo formati.

* Strumentazione nei file indicati con messaggi coerenti e operationId per flussi (traduzione, esportazione).

* Documentazione in README: come abilitare/verificare logging.

**Verifica**

* Scenario: aprire PDF, avviare traduzione, esportare; controllare console e app.log con tempi e stati allineati.

* Test rapido: funzione di self-check che logga 5 eventi di esempio e verifica la rotazione file.

