# Soluzione Problema Selezione Lingua

## Modifiche Tecniche:
### 1. Dinamicità del Prompt (Gemini & OpenAI)
- Sostituzione del vincolo linguistico hardcoded in [geminiService.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/geminiService.ts) (linea 289) con un riferimento dinamico alla `sourceLanguage`.
- Implementazione di una funzione helper `getArticledLanguage(lang: string)` per generare stringhe grammaticalmente corrette (es: "dall'Inglese", "dallo Spagnolo") nel prompt di sistema.

### 2. Generalizzazione Language Detection
- Aggiornamento di `looksLikeItalian` per evitare falsi positivi/negativi quando la lingua di origine non è il tedesco.
- Utilizzo della lingua di input corrente come riferimento per il controllo "anti-originale" (assicurarsi che l'AI non abbia lasciato testo nella lingua di partenza).

### 3. Miglioramento UX Selezione Lingua
- Aggiornamento di [InputLanguageSelector.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/InputLanguageSelector.tsx) per chiarire che l'input è libero (placeholder e label migliorati).
- Aggiunta di un indicatore di lingua nella barra superiore di [App.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/App.tsx) per permettere il cambio lingua "al volo" su progetti già aperti.

## Obiettivo:
Assicurarsi che scrivendo "inglese", "francese" o qualsiasi altra lingua, il sistema adatti istantaneamente il comportamento dell'AI e produca traduzioni coerenti.

Posso procedere con queste modifiche?