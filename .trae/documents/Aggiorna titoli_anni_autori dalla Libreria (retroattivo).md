## Obiettivo
Aggiungere in Impostazioni un’azione chiara che, con un clic, scansioni i file già caricati per estrarre Titolo/Anno/Autore e aggiornare i nomi mostrati in Home.

## Stato attuale
- Esiste già un’azione in Impostazioni (visibile quando sei in vista Libreria/Home) che fa questo per i file con nomi “vecchi”:
  - Pulsante: “Aggiorna Nomi File (Retroattivo)” [SettingsModal.tsx](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/components/SettingsModal.tsx#L337-L364)
  - Logica: scanAndRenameOldFiles in [useProjectManagement.ts](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/hooks/useProjectManagement.ts#L156-L201)
  - Estrazione metadati (Anno/Autore/Titolo) via Gemini: [extractPdfMetadata](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/services/geminiService.ts#L536-L590)
  - Wiring del pulsante nel modal: [App.tsx](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/App.tsx#L2832-L2844)
- La Home mostra il nome del file (già nel formato Anno_Autore_Titolo se rinominato): [App.tsx](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/App.tsx#L2910-L2962)

## Migliorie proposte
1. Aggiungere modalità “Tutti i file” oltre a “Solo nomi vecchi”
2. Mostrare una barra di avanzamento e un riepilogo (rinominati/saltati)
3. Gestire fallback: se metadati mancanti, lascia invariato
4. Blocchi di sicurezza: richiedere API Key Gemini valida; limitare rate
5. Aggiornare la Home automaticamente al termine

## Dettagli tecnici
- Modificare l’hook di progetto per accettare una modalità di scansione (legacy-only vs all) e iterare su recentBooks; riusare renameTranslation e refreshLibrary.
- Estensione del modal Impostazioni: aggiungere selettore “Ambito scansione” e mantenere il pulsante di avvio.
- UI/UX: feedback di progresso e toasts finali.
- Non introdurre campi separati per titolo/anno/autore: mantenere coerenza con l’attuale formato del nome file.

## Verifica
- Testare con libreria mista (file vecchi e nuovi)
- Verificare aggiornamento immediato della lista Home e conteggi
- Validare comportamento senza API Key (messaggio chiaro)

Confermi che procedo con queste migliorie?