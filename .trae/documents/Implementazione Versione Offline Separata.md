# Piano per la Versione Offline dell'App

L'obiettivo è creare una versione dell'applicazione che funzioni completamente senza connessione internet, mantenendo l'aspetto e le funzionalità il più possibile identici all'originale. La versione attuale dipende da CDN esterni (Tailwind, Google Fonts, esm.sh) che impediscono l'avvio in assenza di rete.

## 1. Risorse Locali (Assets)
- **CSS e Tailwind**: Creerò un file `src/index-offline.css` che include le direttive Tailwind per il bundling locale, eliminando la dipendenza dal CDN di Tailwind.
- **Font**: Configurerò l'app per utilizzare font di sistema o locali invece di caricarli da Google Fonts.

## 2. Nuovi Entry Point e Configurazione
- **HTML**: Creerò `index-offline.html` che:
    - Rimuove tutti i link a CDN esterni.
    - Rimuove la `importmap` che punta a `esm.sh`.
    - Collega i file locali che verranno inclusi nel bundle finale.
- **Vite**: Creerò `vite.config.offline.ts` per gestire una build separata che includa tutte le dipendenze nel pacchetto locale.
- **Electron**: Creerò `electron/main-offline.js` (basato su `main.js`) configurato per caricare la versione offline.

## 3. Mock del Servizio AI
- **Service**: Creerò `src/services/aiServiceOffline.ts` che implementa la stessa interfaccia di `aiService.ts`. Invece di chiamare le API di Gemini/OpenAI (che fallirebbero senza internet), restituirà risposte simulate o messaggi di stato "Offline Mode".
- **App**: Creerò `src/AppOffline.tsx` che utilizza questo servizio mockato, assicurando che l'interfaccia rimanga identica ma non tenti connessioni esterne.

## 4. Script di Avvio e Build
- Aggiungerò nuovi script a `package.json` (es. `npm run electron:offline`) per permetterti di avviare o pacchettizzare specificamente la versione offline senza toccare quella esistente.

## Milestone Tecnica
1. Creazione dei file di configurazione (`vite.config.offline.ts`, `index-offline.html`).
2. Implementazione del mock service per simulare l'AI offline.
3. Configurazione del bundling locale per Tailwind e dipendenze React.
4. Test di avvio della versione offline tramite il nuovo entry point di Electron.

**Confermi di voler procedere con la creazione di questi nuovi file?**
