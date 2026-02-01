## **Aggiornamento dei Prompt per Doppie Pagine e Verifica Numerazione**

### **1. Modifica dei Prompt di Traduzione**
Aggiornerò [prompts.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/prompts.ts) per includere istruzioni esplicite sulla gestione degli "spread":
- **Rilevamento Spread**: Istruire l'AI a identificare se l'immagine contiene due pagine affiancate.
- **Marker di Separazione**: Obbligare l'uso di `[[PAGE_SPLIT]]` per dividere il contenuto della pagina sinistra da quella destra.
- **Fedeltà ai Metadati**: Imporre il rispetto assoluto dei numeri di pagina e dei titoli capitolo visibili nell'immagine, evitando allucinazioni (come il "56" segnalato).

### **2. Potenziamento della Verifica Qualità**
Modificherò il prompt del "Verifier" in [prompts.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/prompts.ts) per aggiungere:
- **Controllo Numerazione**: Verificare che il numero di pagina nel testo tradotto coincida con quello nell'immagine.
- **Controllo Integrità Spread**: Se l'immagine è doppia, il verificatore deve segnalare come errore grave (`SEVERE`) la mancanza di uno dei due lati o la mancanza del marker di split.

### **3. Risoluzione del Caso Specifico**
Dopo l'aggiornamento, la pagina 22 potrà essere ritradotta. Il sistema:
- Vedrà "22" e "23" nell'immagine.
- Tradurrà entrambi i lati.
- Userà `[[PAGE_SPLIT]]` per permettere alla UI di mostrarli correttamente affiancati.
- Il verificatore bloccherà qualsiasi tentativo di cambiare il numero di pagina in "56".

Desideri che proceda con queste modifiche ai file di configurazione dei prompt?