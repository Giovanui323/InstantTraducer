# Piano per la rilevazione di file duplicati (Approccio Modulare)

Per seguire la tua indicazione di non appesantire i file esistenti, implementerò la logica in nuovi moduli separati.

## 1. Nuovo Modulo di Hashing
Creerò il file [fingerprint.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/utils/fingerprint.ts) che conterrà la logica per generare un'impronta digitale (SHA-256) del contenuto del PDF. Questo file sarà responsabile solo del calcolo matematico.

## 2. Nuovo Componente UI per l'Avviso
Creerò [DuplicateUploadModal.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/components/DuplicateUploadModal.tsx). Invece di un semplice `window.confirm`, userò un componente React dedicato che:
- Indicherà chiaramente che il file è già presente.
- Mostrerà il nome del file già caricato, come richiesto.
- Offrirà i pulsanti per procedere comunque o annullare.

## 3. Logica di Servizio per la Libreria
Creerò [libraryService.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/services/libraryService.ts) per gestire la ricerca di duplicati all'interno della libreria dei progetti, mantenendo questa logica fuori dal componente principale.

## 4. Integrazione Minima
Le uniche modifiche ai file esistenti saranno:
- **[types.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/types.ts)**: Aggiunta del campo `fingerprint` a `ReadingProgress`.
- **[App.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/App.tsx)**: 
    - Aggiunta dello stato per gestire l'apertura del nuovo modal.
    - Chiamata alle funzioni nei nuovi moduli durante il caricamento.

## Flusso di Lavoro
1. Quando carichi un file, calcoliamo il suo hash.
2. Controlliamo se esiste già un file con lo stesso hash nella libreria.
3. Se esiste, apriamo `DuplicateUploadModal` mostrando il nome del file esistente.
4. Se scegli di non caricare, il processo si ferma. Se scegli di procedere, il file viene caricato normalmente e il suo hash viene salvato.

Cosa ne pensi di questo approccio più pulito e suddiviso in file?