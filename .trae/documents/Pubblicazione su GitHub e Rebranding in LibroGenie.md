# Piano per la pubblicazione su GitHub di **LibroGenie**

Il progetto verrà rinominato in modo più accattivante e preparato per una pubblicazione sicura su GitHub, assicurando che non ci siano dati sensibili e che la presentazione sia professionale.

## 1. Rinominazione del Progetto
*   **Nuovo Nome**: `LibroGenie` (un nome "cute" che evoca magia e libri).
*   **Aggiornamento File di Configurazione**:
    *   `package.json`: Aggiornamento di `name`, `productName` e `description`.
    *   `metadata.json`: Aggiornamento del nome e della descrizione del progetto.
*   **Aggiornamento Interfaccia (UI)**:
    *   `src/components/Header.tsx`: Sostituzione di "Gemini Translator Pro" con "LibroGenie".

## 2. Revisione Sicurezza e Pulizia
*   **Verifica Chiavi API**: Conferma che non ci siano chiavi hardcoded (già verificato: i servizi caricano le chiavi dalle impostazioni o variabili d'ambiente).
*   **Gitignore**: Verifica che `.env.local` e altre cartelle sensibili (come `.local-userdata`) siano correttamente ignorate dal controllo di versione (già presente nel `.gitignore`).

## 3. Creazione di una Descrizione Professionale (README)
Verrà creato un nuovo `README.md` con:
*   Un titolo accattivante: **LibroGenie 📚✨**.
*   Una descrizione emozionale: *"Il tuo genio personale per la traduzione di libri. Trasforma PDF complessi in letture fluide nella tua lingua, mantenendo il contesto e l'anima dell'opera originale."*
*   Elenco delle funzionalità principali (Traduzione AI multimodale, Gestione Libreria, Supporto Gemini/OpenAI).
*   Istruzioni chiare per l'installazione e l'uso.

## 4. Preparazione per la Pubblicazione
*   **Commit Finale**: Creazione di un commit pulito con tutte le modifiche di rebranding.
*   **Istruzioni per l'utente**: Ti fornirò i comandi finali per collegare la cartella locale a un nuovo repository GitHub e caricare il codice.

**Sei d'accordo con il nome "LibroGenie" e con questo piano d'azione?**