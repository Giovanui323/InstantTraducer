Dopo un'analisi approfondita, confermo che esistono diversi **errori critici** nella logica dei gruppi e della gestione dei file che possono causare perdita di dati, duplicazione di progetti o malfunzionamenti dell'interfaccia.

Ecco i problemi critici individuati:

## **1. Rischio di Duplicazione Progetti (CRITICO)**
*   **Errore**: La funzione `handleAssignGroup` chiama `updateLibrary` senza passare l'ID univoco del file (`fileId`).
*   **Conseguenza**: Se la cache interna non è allineata, il sistema ricalcola l'ID basandosi sul nome del file. Se il calcolo differisce (anche di poco), viene creato un **nuovo file JSON** invece di aggiornare quello esistente. L'utente si ritroverebbe con due versioni dello stesso libro nella lista.

## **2. Race Condition negli Aggiornamenti (CRITICO)**
*   **Errore**: `handleAssignGroup` legge i dati del libro dallo stato "chiuso" (closure) della funzione.
*   **Conseguenza**: Se l'utente clicca velocemente su più gruppi, le modifiche si sovrascrivono a vicenda. Ad esempio, aggiungendo "Gruppo A" e poi "Gruppo B" velocemente, il secondo aggiornamento potrebbe non vedere il primo, salvando solo "Gruppo B" e perdendo "Gruppo A".

## **3. Gruppi "Invisibili" dopo l'Importazione**
*   **Errore**: Quando si importa un progetto (`.gpt`), i gruppi associati non vengono aggiunti alla lista globale `availableGroups`.
*   **Conseguenza**: L'utente vede i gruppi nel dettaglio del libro, ma non può usarli per filtrare nella sidebar finché non li ricrea manualmente con lo stesso identico nome.

## **4. Logica di Filtro Inefficace**
*   **Errore**: Il filtro attuale è di tipo **OR** (`some`).
*   **Conseguenza**: Se selezioni "Legale" e "2024", vedi TUTTI i documenti legali e TUTTI i documenti del 2024. Questo rende inutile il filtro multiplo per chi vuole trovare "i documenti legali *del* 2024".

---

## **Piano di Risoluzione Dettagliato**

### **Fase 1: Correzione Integrità Dati (Priorità Alta)**
1.  **Fix ID Propagation**: Modificare `handleAssignGroup` in [useAppLibrary.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/hooks/useAppLibrary.ts) per passare esplicitamente il `fileId` a `updateLibrary`, garantendo che venga aggiornato sempre lo stesso file.
2.  **Fix Race Condition**: Utilizzare l'aggiornamento funzionale di React per garantire che ogni modifica ai gruppi si basi sullo stato più recente disponibile, evitando sovrascritture accidentali.

### **Fase 2: Sincronizzazione e Normalizzazione**
1.  **Auto-Sync Gruppi**: Potenziare `refreshLibrary` affinché scansioni tutti i progetti caricati e aggiunga automaticamente i gruppi mancanti alla lista globale in `groups.json`.
2.  **Case-Insensitivity**: Normalizzare i nomi dei gruppi (trim e controllo minuscole/maiuscole) per evitare duplicati come "Lavoro" e "lavoro".

### **Fase 3: Miglioramento UX e Filtri**
1.  **Filtro AND**: Cambiare la logica di filtraggio in [HomeView.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/HomeView.tsx) da `some` a `every`.
2.  **Gestione Modal**: In [GroupManagementModal.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/GroupManagementModal.tsx), permettere l'assegnazione immediata se il gruppo inserito esiste già globalmente.
3.  **Eliminazione Globale**: Aggiungere la possibilità di eliminare definitivamente un gruppo dalla lista globale se non più utilizzato.

**Procedo con l'applicazione di queste correzioni critiche?**
