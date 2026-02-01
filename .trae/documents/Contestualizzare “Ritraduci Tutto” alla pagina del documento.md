## Obiettivo
Rendere “Ritraduci Tutto (Reset)” un’azione contestuale al documento aperto, visibile ed eseguibile solo nella pagina specifica del documento correntemente in editing. Rimuovere tale azione dalle impostazioni globali.

## Modifiche UI
- Aggiungere un pulsante “Ritraduci Tutto” nella barra superiore del documento (Header) quando showActions è true.
- Rimuovere “Ritraduci Tutto” dalla sezione “Zona Pericolo / Azioni Avanzate” del modal impostazioni.
- Lasciare “Aggiorna Nomi File (Retroattivo)” nelle impostazioni e visibile solo in contesto libreria/home.

## Logica e Condizioni
- Il pulsante in Header è visibile solo in vista documento: hasSession && !isHomeView (già espresso come showActions).
- Il click invoca redoAllPages, che già:
  - chiede conferma,
  - cancella traduzioni/annotazioni/verifiche del documento corrente,
  - re-accoda tutte le pagine alla pipeline di traduzione.
- Nessun impatto su altri documenti: l’azione opera esclusivamente sul pdfDoc corrente.

## Implementazione
- Header.tsx:
  - Aggiungere prop opzionale onRedoAll?: () => void.
  - Renderizzare un nuovo bottone vicino a “Traduci Tutto”, con stile di attenzione (rosso) e tooltip “Ritraduci tutto il documento corrente”.
- App.tsx:
  - Passare redoAllPages a Header come onRedoAll.
  - Rimuovere onRedoAll dal passaggio a SettingsModal.
  - Opzionale: passare un flag di contesto a SettingsModal (es. isLibraryView) per mostrare solo azioni libreria.
- SettingsModal.tsx:
  - Eliminare il bottone “Ritraduci Tutto (Reset)”.
  - Mostrare “Aggiorna Nomi File (Retroattivo)” solo quando non c’è un documento aperto (home/libreria).

## Test e Verifica
- Aprire un PDF, tradurre alcune pagine, cliccare “Ritraduci Tutto”: verificare conferma, reset degli stati, riavvio traduzioni e log coerenti.
- Tornare alla Home: verificare che “Ritraduci Tutto” non sia visibile (solo import/salva/etc.).
- Aprire impostazioni: la “Zona Pericolo” non contiene più “Ritraduci Tutto”; “Aggiorna Nomi File” è visibile solo in contesto libreria.

## Impatto su Codice
- File: components/Header.tsx, App.tsx, components/SettingsModal.tsx.
- Nessun cambiamento ai servizi o alla gestione chiavi API. La conferma e logica di reset rimangono in redoAllPages.

Confermi che procedo con queste modifiche?