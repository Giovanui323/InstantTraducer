## Stato attuale (cosa succede adesso)
- Le impostazioni sono un unico modal centrato, con contenuto in colonna e tutte le sezioni nello stesso scroll: [SettingsModal.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/SettingsModal.tsx#L324-L343).
- Il modal è montato da App online/offline: [App.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/App.tsx#L1803-L1820), [AppOffline.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/AppOffline.tsx#L756-L770).

## Obiettivo
- Trasformare la UI impostazioni in un layout Master–Detail: elenco sezioni a sinistra (master) e pannello contenuti a destra (detail), evitando “tutte le impostazioni in una sola finestra scrollabile”.

## Modifica UI proposta
- **Modal più largo**: passare da `max-w-md` a una larghezza desktop (es. `max-w-4xl`/`max-w-5xl`) per far stare 2 colonne.
- **Colonna sinistra (Master)**: menu verticale con voci (esempi):
  - Provider & API
  - Lingua input
  - Traduzione
  - Qualità (solo Gemini)
  - Progetti
  - Cestino
  - Export PDF
  - Diagnostica
  - Avanzate
- **Colonna destra (Detail)**: renderizza solo la sezione selezionata.
- **Responsività**: sotto `md` (mobile) il layout degrada in “selettore sezione” + detail (sempre una cosa per volta), mantenendo l’idea Master–Detail.

## Implementazione tecnica
- In [SettingsModal.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/SettingsModal.tsx):
  - Aggiungere uno stato `activeSection` (es. union type) con default (es. `provider-api`).
  - Creare una lista di definizioni sezione (id, label, icona opzionale, `visibleWhen`) e una funzione di render per ciascuna sezione.
  - Spostare i blocchi JSX già esistenti dentro i render delle singole sezioni (riuso del codice attuale, solo ricollocato e “gated” dal tab attivo).
  - Mantenere header e footer (Annulla/Salva) invariati, cambiando solo il body.
  - Gestire condizioni provider: le sezioni Gemini/OpenAI appaiono nel menu e nel detail solo quando rilevanti.

## Verifica
- Avvio app (dev) e controllo:
  - Apertura impostazioni da Header/Home.
  - Navigazione sezioni: ogni sezione mostra solo le sue opzioni.
  - Salvataggio: `onSave` riceve valori corretti come prima.
  - Provider switch: aggiorna menu e detail coerentemente.
  - Layout: nessun overflow “strano” e footer sempre raggiungibile.

## File che verranno toccati
- [SettingsModal.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/SettingsModal.tsx) (principale).
- Solo se necessario per piccole rifiniture di stile/props: [App.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/App.tsx) e/o componenti UI correlati (ma l’obiettivo è non cambiare la logica di mount).
