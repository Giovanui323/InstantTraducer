Dopo un'analisi "chirurgica" di ogni singolo file, ho individuato altri due errori critici (High Priority) che finora erano rimasti nascosti e che potrebbero compromettere seriamente l'uso dell'app:

### **Le "Falle" Nascoste individuate (High Priority)**

1.  **Bug del Rendering degli Highlight (Critico):**
    - In [renderText.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/utils/renderText.ts), la funzione `applyHtmlHighlights` inserisce tag `<span>` per evidenziare il testo. Subito dopo, però, la funzione `escapeHtml` trasforma i caratteri `<` e `>` in `&lt;` e `&gt;`.
    - **Conseguenza:** Le evidenziazioni salvate dall'utente non appariranno mai come colori, ma come brutto codice HTML testuale (`<span>...</span>`) visualizzato direttamente nel reader.

2.  **Rottura degli Highlight multi-paragrafo:**
    - La logica di suddivisione in paragrafi (`split(/\n{2,}/g)`) avviene *dopo* l'inserimento degli highlight.
    - **Conseguenza:** Se un utente evidenzia un testo che attraversa due paragrafi, il tag `<span>` viene spezzato a metà, creando un HTML invalido che rompe completamente la visualizzazione della pagina.

3.  **Inconsistenza del Worker PDF.js:**
    - In `App.tsx` il worker viene configurato localmente, ma nei render della qualità in `useAppQuality` vengono usati CDN esterni. 
    - **Conseguenza:** Se l'utente è offline, alcune parti dell'app (come la verifica qualità) smetteranno di funzionare misteriosamente.

---

### **Piano di Azione Definitivo (con Indicatore di Salvataggio)**

#### **Fase 1: Persistenza e Feedback Visivo (High Priority)**
*   **LED di Salvataggio:** Implementazione di uno stato `isSaving` globale. Aggiunta nell'[Header.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/Header.tsx) di un indicatore luminoso (pulsante o icona) che indichi quando i dati stanno venendo scritti su disco.
*   **Debounced Saver:** Creazione di un manager di salvataggio che raggruppa le modifiche e le scrive ogni 2 secondi, evitando sovraccarichi IPC e race conditions.

#### **Fase 2: Correzione Rendering e Annotazioni**
*   **Fix Highlight:** Riscriverò la logica di `renderText.ts` per applicare gli highlight *dopo* l'escaping HTML o usando un approccio basato su nodi, risolvendo il bug dei tag visibili e quello dei paragrafi spezzati.

#### **Fase 3: Gestione Memoria e PDF**
*   **Distruzione PDF:** Aggiunta di `doc.destroy()` sistematico in `pdfUtils.ts` per liberare la RAM dopo ogni rendering di pagine sostituite.

#### **Fase 4: Consolidamento Architetturale**
*   **Rimozione ridondanze:** Unificazione del caricamento impostazioni e della funzione `updateLibrary`.

Sono "sicuro sicuro" che con questi interventi l'app diventerà solida, veloce e senza i bug di visualizzazione che abbiamo scoperto. Posso iniziare con la Fase 1 e la "lucina" di salvataggio?
