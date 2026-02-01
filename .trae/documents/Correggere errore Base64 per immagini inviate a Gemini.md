**Causa**

* L'API Gemini richiede bytes Base64 puri in contents.parts\[].inlineData.data. Nel tuo flusso a volte viene inviato un Data URL completo ("data:image/jpeg;base64, …"), che genera 400 "Base64 decoding failed".

* L’errore avviene sul secondo part (parts\[1]) nelle chiamate con immagine, es. verifica qualità o traduzione con contesto. Vedi costruzione parts in [geminiService.ts](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/services/geminiService.ts#L275-L297) e [verifyTranslationQualityWithGemini](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/services/geminiService.ts#L438-L465).

**Piano di Fix**

* Aggiungere una funzione di sanificazione centralizzata (ensureBase64) che:

  * Rimuove qualsiasi prefisso Data URL con regex (data:\*;base64,).

  * Trim/normalizza whitespace e newlines.

  * Valida che sia Base64 decodificabile (Buffer.from(..., 'base64')).

* Applicare ensureBase64 in tutti i punti che passano immagini a Gemini:

  * Traduzione streaming: normalizzare imageBase64, prevPageImageBase64, nextPageImageBase64 prima di costruire parts. File: [geminiService.ts](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/services/geminiService.ts#L275-L297).

  * Verifica qualità: normalizzare imageBase64 in [verifyTranslationQualityWithGemini](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/services/geminiService.ts#L438-L465).

  * Estrazione metadati: normalizzare imageBase64 in [extractPdfMetadata](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/services/geminiService.ts#L549-L571).

* Allineare mimeType:

  * Se viene fornito un Data URL, dedurre mimeType (image/jpeg|image/png) dalla parte iniziale; se non presente, usare "image/jpeg" come default.

* Migliorare messaggi d’errore:

  * Intercettare INVALID\_ARGUMENT dal client Gemini e mostrare un messaggio chiaro: "Immagine non valida: fornire Base64 senza prefisso data:".

**Verifica**

* Creare un test rapido (unit o dev util) che provi:

  * dataUrl → ensureBase64 produce stringa decodificabile.

  * Base64 già pulito → invariato.

  * Valori non Base64 → errore esplicito.

* Eseguire una chiamata di prova con un’immagine renderizzata dal PDF (che già restituisce Base64 nudo) per confermare assenza del 400.

**Note Operative**

* Controllare che GEMINI\_API\_KEY sia valorizzata (non "PLACEHOLDER\_API\_KEY") nel tuo .env/.env.local.

* Nessuna modifica alle funzioni di rendering: il fix è solo di robustezza all’ingresso del servizio Gemini.

**Output atteso**

* Niente più errori "Base64 decoding failed" quando la sorgente passa Data URL; chiamate a Gemini stabili per traduzione, verifica e metadati.

