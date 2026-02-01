# Analisi e Correzione Critica degli Hooks

Dopo un'analisi approfondita, ho identificato diversi **errori gravi** che compromettono la stabilità e l'integrità dei dati dell'applicazione. Non si tratta solo di ottimizzazioni, ma di difetti strutturali nella gestione dello stato e della concorrenza.

## **Errori Critici Rilevati**

### **1. Effetti Collaterali negli Updater di React (Sistemico)**
In quasi tutti gli hooks (`useAppLibrary`, `useAppAnnotations`, `useAppQuality`, `useAppTranslation`), viene chiamata la funzione `updateLibrary` (che esegue chiamate asincrone all'API di Electron) **dentro** la funzione di aggiornamento dello stato di React (es. `setUserHighlights(prev => { ... updateLibrary(...); return next; })`).
- **Perché è grave:** React può eseguire gli updater più volte o scartarli. Eseguire operazioni I/O asincrone al loro interno rompe il paradigma di purezza di React, portando a salvataggi duplicati, dati corrotti o fallimenti silenziosi.

### **2. Bug di Concorrenza in `useTranslationQueue`**
La funzione `pumpQueue` gestisce male il flag `isPumpingQueueRef`.
- **Il problema:** Il flag viene resettato a `false` all'interno del `finally` di una IIFE asincrona lanciata *mentre il ciclo principale è ancora in esecuzione*.
- **Conseguenza:** Questo permette l'avvio di molteplici cicli `while` paralleli sulla stessa coda, causando race conditions, traduzioni duplicate e un numero di processi attivi superiore al limite `MAX_CONCURRENT_TRANSLATIONS`.

### **3. Memory Leaks nei Cache PDF**
In `usePdfDocument.ts`, `replacementPdfCacheRef` accumula documenti PDF caricati senza mai svuotarli. Se l'utente apre molti file, la memoria crescerà indefinitamente fino al crash del processo renderer.

### **4. Inconsistenza nelle Implementazioni di `updateLibrary`**
Esistono due versioni diverse di `updateLibrary` con logiche differenti in `useAppLibrary.ts` e `useProjectManagement.ts`, il che rende imprevedibile il comportamento di salvataggio.

---

## **Piano di Intervento Proposto**

### **Fase 1: Correzione del Pattern di Salvataggio (Urgente)**
- Spostare tutte le chiamate a `updateLibrary` e `electronAPI` **fuori** dalle funzioni `set...` (updater).
- Implementare un pattern "Update then Persist" pulito o utilizzare `useEffect` per la persistenza dove appropriato.

### **Fase 2: Rifacimento della Coda di Traduzione**
- Riscrivere `useTranslationQueue` per utilizzare un meccanismo di segnale più robusto (es. un trigger che non soffra di ricorsione asincrona).
- Garantire che `isPumpingQueueRef` protegga correttamente l'intero ciclo di vita del "pumping".

### **Fase 3: Unificazione e Pulizia**
- Unificare `updateLibrary` in un unico servizio o hook (`useAppLibrary`) e passarlo in modo consistente agli altri.
- Aggiungere un meccanismo di pulizia per `replacementPdfCacheRef` alla chiusura del documento.
- Ottimizzare la creazione del `canvas` in `useAppTranslation` per evitare allocazioni inutili.

### **Fase 4: Robustezza e Tipizzazione**
- Sostituire i tipi `any` critici con interfacce corrette per prevenire errori a runtime.
- Revisionare gli array di dipendenze per evitare loop di re-render.

**Sei d'accordo di procedere con queste correzioni strutturali?**
