# Implementazione Messaggio di Errore per Formati File Non Supportati

L'obiettivo è informare l'utente quando tenta di caricare un file che non è in formato PDF, specialmente durante l'operazione di trascinamento (drag-and-drop).

## Modifiche previste:

### 1. Validazione in App.tsx (Drag-and-Drop)
- Aggiornerò la funzione `onDrop` passata al componente `HomeView` per verificare se il file trascinato è effettivamente un PDF.
- Se il formato non è corretto, utilizzerò il sistema di messaggistica esistente (`showConfirm`) con il tipo `alert` per mostrare un modale di errore.

### 2. Validazione in App.tsx (Input File)
- Aggiungerò un controllo simile all'input file nascosto utilizzato quando l'utente clicca su "Sfoglia File".
- Nonostante l'attributo `accept="application/pdf"`, un controllo programmatico garantisce che l'utente non possa forzare il caricamento di altri tipi di file.

### 3. Feedback all'Utente
- Il messaggio di errore sarà chiaro e in italiano: **"Formato non supportato"** come titolo e **"Spiacenti, è possibile caricare solo file in formato PDF."** come descrizione.

## Technical Implementation:
- Utilizzo della funzione `showConfirm` già presente in [App.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/App.tsx).
- Impostazione del parametro `type` a `'alert'` nel componente [SimpleConfirmModal.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/SimpleConfirmModal.tsx) per nascondere il tasto di annullamento e mostrare solo il tasto "OK".

## Milestone
- [ ] Modifica logica `onDrop` in `App.tsx`
- [ ] Modifica logica `onChange` dell'input file in `App.tsx`
- [ ] Test con file non PDF per verificare la comparsa del messaggio di errore

Ti sembra corretto procedere così?