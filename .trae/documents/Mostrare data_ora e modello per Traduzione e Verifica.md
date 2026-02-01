## Obiettivo
- Mostrare per ogni pagina quando è stata fatta la traduzione e la verifica (se effettuata), includendo data/ora e modello utilizzato.
- Visualizzare tali metadati sia nel pannello di pagina (Reader) sia nei log/testi di stato.

## Dati da registrare
- Per pagina: translationMeta = { savedAt: timestamp ms, model: string }
- Per pagina: verificationMeta = { savedAt: timestamp ms, model: string }
- Formato UI: data/ora locale derivata da timestamp; modello come stringa già usata in settings.

## Punti di integrazione
- Tipi: estendere i tipi per memorizzare i metadati
  - [types.ts](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/types.ts): aggiungere TranslationsMeta/VerificationsMeta e campi opzionali in ReadingProgress.
- Salvataggio (renderer → main): includere i metadati nelle chiamate di salvataggio
  - [useProjectManagement.ts → updateLibrary](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/hooks/useProjectManagement.ts#L38-L86): accettare translationsMeta/verificationsMeta e passarli all’IPC save-translation.
  - [electron/main.js → save-translation](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/electron/main.js#L470-L520): nessuna logica, inoltra a merge.
  - [electron/translationMerge.js → mergeProjectData](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/electron/translationMerge.js): unire i nuovi blocchi meta come per translations/annotations.
- Produzione dei metadati
  - Traduzione: dopo ogni traduzione/ritraduzione, creare translationsMeta[page] = { savedAt: Date.now(), model: settings.gemini.model } e salvarlo
    - [App.tsx: salvataggio post-traduzione](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/App.tsx#L720-L740)
    - [App.tsx: salvataggio post-ritraduzione](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/App.tsx#L980-L1000)
  - Verifica: alla fine di verifyAndMaybeFixTranslation, creare verificationsMeta[page] = { savedAt: Date.now(), model: verifierModel }
    - [verifyAndMaybeFixTranslation](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/App.tsx#L900-L1060)
- UI
  - Reader: mostra per pagina “Traduzione: <data/ora> • Modello: <nome>” e “Verifica: <data/ora> • Modello: <nome>”
    - [ReaderView.tsx](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/components/ReaderView.tsx): passare translationsMeta/verificationsMeta come props e renderizzare nello status.
  - Log: includere timestamp di salvataggio accanto a Provider/Model nei log per pagina
    - [App.tsx log](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/App.tsx#L1475-L1505)

## Comportamento con dati esistenti
- Se meta assenti, mostrare “N/D” in UI; nessuna migrazione obbligatoria.

## Sicurezza e configurazione
- Non memorizzare chiavi/API nei metadati; usare solo il nome del modello.
- Il modello proviene da [GeminiModel](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/types.ts#L3-L7) e dalle impostazioni correnti.

## Verifica
- Tradurre una pagina e confermare visualizzazione e persistenza dei metadati.
- Eseguire verifica sulla stessa pagina e confermare visualizzazione e persistenza.
- Riavviare l’app: caricare progetto e controllare che i metadati compaiano correttamente nel Reader e nei log.