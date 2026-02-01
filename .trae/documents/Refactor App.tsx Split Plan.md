# Piano di Rifattorizzazione di App.tsx

L'obiettivo è ridurre la complessità di `App.tsx` (circa 3900 righe) suddividendolo in moduli logici, hook e componenti riutilizzabili, garantendo la conservazione di tutte le funzionalità.

## Fasi dell'intervento

### 1. Preparazione e Sicurezza
- Creazione di un file di backup completo: `App.tsx.bak`.
- Analisi approfondita delle dipendenze tra gli stati per evitare regressioni.

### 2. Estrazione delle Utilità (Stateless)
Sposteremo le funzioni che non dipendono dallo stato del componente in file dedicati:
- **`src/utils/pdfUtils.ts`**: (Nuovo) Funzioni per il rendering di pagine PDF (`renderPageToJpegBase64`, `renderDocPageToJpeg`, ecc.).
- **`src/utils/imageUtils.ts`**: (Aggiornamento) Spostamento di funzioni come `rotateJpegBase64`, `downsampleCanvasToJpegBase64`.
- **`src/utils/textUtils.ts`**: (Aggiornamento) `countWords`, `countParagraphs`.
- **`src/constants.ts`**: Centralizzazione di costanti come timeout e configurazioni di qualità.

### 3. Estrazione della Logica in Custom Hooks
Creeremo degli hook per gestire domini specifici di logica, riducendo il numero di righe in `App.tsx`:
- **`useLibraryManager`**: Gestione del caricamento progetti, rinomina, eliminazione e gruppi.
- **`usePageTranslator`**: Gestione del processo di traduzione, code di lavoro e ritraduzione.
- **`useQualityChecker`**: Logica di verifica automatica e batch della qualità delle traduzioni.
- **`useAnnotations`**: Gestione di highlight e note utente.

### 4. Scomposizione dei Componenti UI
Sposteremo i grossi blocchi di JSX in componenti React dedicati:
- **`src/components/HomeView.tsx`**: La schermata iniziale (Libreria, Caricamento PDF, Importazione).
- **`src/components/SimplifiedReader.tsx`**: La vista testuale semplificata (attualmente `renderReaderMode`).
- **`src/components/MainToolbar.tsx`**: La barra degli strumenti fluttuante e trascinabile.

### 5. Semplificazione di App.tsx
`App.tsx` diventerà un orchestratore leggero che:
- Inizializza gli hook.
- Gestisce la navigazione di alto livello (Home vs Reader).
- Passa i dati necessari ai componenti figli.

## Verifica finale
- Test di caricamento PDF e ripresa progetti esistenti.
- Test del processo di traduzione e verifica qualità.
- Verifica della persistenza di annotazioni, gruppi e impostazioni.

Questo approccio garantisce che ogni singola riga di logica sia preservata ma organizzata in modo molto più manutenibile.

**Confermi di voler procedere con questo piano?**
