# Correzione Errori Critici Logica Traduzione

Ho analizzato il codice e ho trovato alcuni problemi che influenzano la qualità e l'affidabilità della traduzione dei libri.

## Analisi Problemi Rilevati
1. **Lingua Sorgente Hardcoded**: In `geminiService.ts` e `openaiService.ts` ci sono riferimenti fissi al "tedesco". Se traduci da un'altra lingua, Gemini/OpenAI potrebbero confondersi o applicare regole errate.
2. **Perdita di Coerenza su Pagine Brevi**: Se una pagina contiene poche parole (es. un titolo), il sistema invalida il contesto per la pagina successiva. Questo rompe la continuità della traduzione (es. nomi di personaggi o termini tecnici che cambiano).
3. **OpenAI Limitato**: Le istruzioni extra fornite dall'utente vengono ignorate con OpenAI, e il contesto passato è troppo ridotto (solo 1000 caratteri).
4. **Validazione Rigida**: Il controllo "è italiano?" fallisce sistematicamente su testi sotto le 12 parole, innescando inutili (e costosi) tentativi di ri-traduzione.

## Piano di Intervento

### 1. Ottimizzazione Utility Lingua
- Modificare [aiUtils.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/aiUtils.ts) per gestire meglio i testi brevi, evitando falsi negativi che causano retry infiniti.

### 2. Correzione Gemini Service
- In [geminiService.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/geminiService.ts):
    - Rendere dinamica la lingua di fallback nel controllo `looksLikeItalian`.
    - Preservare il contesto precedente anche se la pagina corrente è molto breve, garantendo coerenza narrativa.

### 3. Potenziamento OpenAI Service
- In [openaiService.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/openaiService.ts):
    - Integrare il supporto a `extraInstruction`.
    - Rimuovere il riferimento hardcoded al tedesco nel prompt di retry.
    - Espandere la finestra di contesto da 1000 a almeno 3000 caratteri per una migliore coerenza.

### 4. Allineamento AI Service
- In [aiService.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/aiService.ts):
    - Assicurarsi che tutti i parametri (incluse le istruzioni extra) siano passati correttamente al provider OpenAI.

Vuoi che proceda con queste correzioni?