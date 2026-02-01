## Obiettivo
- Mostrare nel banner rosso “Riprova N pagine con errori” anche i numeri delle pagine che hanno avuto errori (traduzione fallita o verifica qualità severa/fallita).

## Stato attuale (dove intervenire)
- Il banner è in [ReaderView.tsx:L1318-L1351](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/ReaderView.tsx#L1318-L1351).
- La lista delle pagine problematiche esiste già come `criticalErrorPages` in [ReaderView.tsx:L712-L721](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/ReaderView.tsx#L712-L721).

## Modifica proposta
- Aggiungere una formattazione leggibile dei numeri pagina (compressa in intervalli): es. `1–3, 7, 10–12`.
- Visualizzare questa lista come riga aggiuntiva nel banner, sotto al testo principale.
- Gestire liste molto lunghe:
  - mostrare la stringa “compatta” nel banner (eventualmente troncata oltre una soglia di caratteri),
  - aggiungere `title`/tooltip con l’elenco completo.

## Dettagli tecnici
- Implementare una piccola funzione pura (nello stesso file) che:
  - deduplica e ordina `criticalErrorPages`,
  - produce intervalli contigui,
  - restituisce una stringa.
- Calcolare `criticalErrorPagesLabel` con `useMemo` e usarlo nel markup del banner.

## Verifica
- Aprire un PDF e forzare 1+ pagine in errore (es. interrompendo la traduzione o simulando fallimento qualità).
- Verificare che il banner mostri:
  - conteggio corretto,
  - lista pagine corretta e tooltip completo,
  - nessun impatto su “Riprovo…” durante il retry.

Se confermi, applico la modifica in ReaderView e valido il comportamento in UI.