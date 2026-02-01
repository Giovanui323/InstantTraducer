# Implementazione Cestino Progetti

L'obiettivo è modificare il processo di eliminazione dei progetti in modo che vengano spostati in un "Cestino" invece di essere cancellati immediatamente. I file nel cestino saranno eliminati definitivamente dopo 30 giorni. Il cestino sarà accessibile dalle Impostazioni.

## Modifiche Backend (Electron)

### 1. Gestione Cartella Cestino (`main.js` e `main-offline.js`)

* Creazione di una cartella `.trash` all'interno della directory dei progetti (`translations`).

* Implementazione di una funzione helper `getTrashDir()` per gestire il percorso.

### 2. Modifica Eliminazione (`delete-translation`)

* Invece di usare `fs.promises.unlink` e `fs.promises.rm`, i file verranno spostati in una sottocartella di `.trash`.

* La cartella avrà un nome univoco basato sul timestamp di eliminazione: `trash_${timestamp}_${fileId}`.

* All'interno verranno spostati sia il file JSON del progetto che la cartella `assets` corrispondente.

### 3. Pulizia Automatica

* All'avvio dell'applicazione, una funzione `autoCleanupTrash()` scansionerà la cartella `.trash`.

* I progetti eliminati più di 30 giorni fa verranno rimossi permanentemente.

### 4. Nuovi Handler IPC

* `get-trash-contents`: Restituisce l'elenco dei progetti nel cestino con metadati (nome originale, data di eliminazione).

* `restore-trash-item`: Ripristina un progetto spostandolo dalla cartella trash alla posizione originale.

* `delete-trash-item-permanently`: Elimina definitivamente un singolo elemento dal cestino.

## Modifiche Frontend (React)

### 1. Interfaccia Impostazioni (`SettingsModal.tsx`)

* Aggiunta di una nuova sezione **"Cestino"** (posizionata dopo Archiviazione Progetti).

* Visualizzazione dell'elenco degli elementi nel cestino con:

  * Nome del progetto.

  * Data di eliminazione.

  * Giorni rimanenti alla cancellazione automatica.

  * Pulsante **Ripristina**.

  * Pulsante **Elimina Definitivamente**.

### 2. Bridge IPC (`preload.cjs`)

* Esposizione dei nuovi metodi IPC al processo di rendering tramite `window.electronAPI`.

### 3. Tipi (`src/types.ts`)

* Definizione dell'interfaccia `TrashItem` per gestire i dati del cestino nel frontend.

## Verifica

* Test del flusso di eliminazione: verificare che i file si spostino in `.trash`.

* Test del ripristino: verificare che i file tornino visibili nella libreria.

* Test dell'eliminazione definitiva manuale.

* Verifica visiva del countdown dei 30 giorni nelle impostazioni.

