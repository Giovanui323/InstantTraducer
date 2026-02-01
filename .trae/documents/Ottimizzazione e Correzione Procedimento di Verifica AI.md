## 1. Correzione Race Condition nel Salvataggio
- Modificare il sistema di aggiornamento della libreria per garantire che i salvataggi siano atomici o basati su merge, evitando che traduzioni parallele si sovrascrivano a vicenda.

## 2. Gestione Segnali di Interruzione (Abort propagation)
- Assicurarsi che ogni fase (Traduzione -> Verifica -> Eventuale Retry) sia collegata allo stesso `AbortSignal`.
- Se l'utente ferma una traduzione, tutti i processi AI associati (inclusa la verifica) devono interrompersi immediatamente.

## 3. Ottimizzazione del Flusso di Verifica e Retry
- Spostare i "retry nascosti" per la lingua dal service al hook di qualità (`useAppQuality`), rendendoli visibili nei log.
- Integrare i retry automatici nella coda di traduzione (`useTranslationQueue`) per rispettare rigorosamente il limite di concorrenza `MAX_CONCURRENT_TRANSLATIONS`.

## 4. Refactoring Servizi e Supporto Multi-Provider
- Unificare i controlli di readiness in `aiService.ts` per eliminare la duplicazione tra Gemini e OpenAI.
- Implementare il supporto base per la verifica qualità tramite OpenAI, permettendo l'uso della funzione anche senza chiavi Gemini.
- Rendere configurabile il modello del verificatore.

## 5. Miglioramento Rilevamento Lingua
- Rendere più robusta la funzione `looksLikeItalian` o delegare parte del controllo al verificatore AI per ridurre i falsi negativi in testi tecnici/giuridici.
