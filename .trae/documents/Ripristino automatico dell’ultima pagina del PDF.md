## Obiettivo
- Alla riapertura di un file (chiuso o già aperto), mostrare esattamente la pagina dove era stato chiuso.

## Stato attuale
- La pagina corrente viene già salvata su cambio di currentPage (debounce 600ms) e su beforeunload: vedi [App.tsx:L1857-L1889](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/App.tsx#L1857-L1889).
- All’apertura di un progetto, se esiste il salvataggio, viene ripristinata lastPage: vedi [App.tsx:L1947-L1965](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/App.tsx#L1947-L1965).
- La persistenza avviene via JSON in userData, gestita da updateLibrary/saveTranslation: vedi [useProjectLibrary.ts:L57-L81](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/hooks/useProjectLibrary.ts#L57-L81).

## Lacuna individuata
- In ReaderView lo scorrimento calcola activePage ma non aggiorna App.currentPage, quindi lastPage potrebbe non riflettere l’ultima pagina vista se si chiude mentre si è nel Reader: vedi [ReaderView.tsx:L436-L454](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/components/ReaderView.tsx#L436-L454).

## Modifica proposta
- Aggiungere una prop opzionale onActivePageChange a ReaderView e invocarla quando cambia activePage.
  - Definizione prop: interface ReaderViewProps { …; onActivePageChange?: (p: number) => void }
  - Invocazione nel callback dell’IntersectionObserver: quando si imposta setActivePage(bestPage), chiamare anche onActivePageChange?.(bestPage).
  - Riferimento punto di inserimento: [ReaderView.tsx:L436-L454](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/components/ReaderView.tsx#L436-L454).
- In App.tsx, passare onActivePageChange={setCurrentPage} all’istanza di ReaderView per sincronizzare la pagina con lo stato globale.
  - Riferimento istanziazione ReaderView: [App.tsx:L3042-L3065](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/App.tsx#L3042-L3065).

## Considerazioni
- Modalità affiancata: currentPage governa [currentPages] e ReaderView seleziona la miglior pagina visibile; la sincronizzazione manterrà coerenza anche in side-by-side.
- Non tocca la logica di salvataggio (debounce e beforeunload) né la persistenza su disco.

## Verifica
- Scenario 1: aprire un PDF, scorrere nel ReaderView a pagina N, chiudere e riaprire: deve aprire a N.
- Scenario 2: navigazione con anteprime/frecce, salvataggio e riapertura: deve ripristinare correttamente.
- Scenario 3: modalità side-by-side, scorrere e chiudere: ripristino coerente.

Confermi che procedo con queste modifiche?