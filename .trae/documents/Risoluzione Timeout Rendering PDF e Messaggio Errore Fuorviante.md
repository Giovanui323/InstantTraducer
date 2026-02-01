Ricevuto. Implementerò un sistema di fallback "intelligente" con memoria temporale:

### Piano di Intervento Rafforzato

**1. Fallback Universale a Flash 2.5**
- Ogni errore (Timeout, Quota, o errore generico del modello Pro) innescherà il passaggio automatico a `gemini-2.5-flash`.

**2. Meccanismo di "Cooldown" di 20 Minuti**
- Implementerò un sistema di blocco temporaneo in [geminiService.ts](file:///Users/lucasicignano/Lavoro temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/geminiService.ts):
    - Se un modello Pro fallisce per **esaurimento API (Quota)**, verrà inserito in una "blacklist" per **20 minuti**.
    - Durante questo intervallo, tutte le richieste successive useranno direttamente il modello Flash, senza nemmeno tentare il Pro, per evitare inutili attese e retry fallimentari.
    - Scaduti i 20 minuti, il sistema proverà di nuovo a ripristinare il modello Pro.

**3. Gestione Timeout AI**
- In caso di timeout (come quello da 60s che hai mostrato), il sistema passerà a Flash per la pagina corrente e valuterà se applicare il cooldown anche in questo caso (se i timeout sono ripetuti).

**4. Aggiornamento Costanti**
- Aggiungerò `GEMINI_COOLDOWN_MS = 20 * 60 * 1000` (20 min) in [constants.ts](file:///Users/lucasicignano/Lavoro temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/constants.ts).

Procedo con questa implementazione?