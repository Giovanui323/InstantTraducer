## 1. Parità Funzionale OpenAI
- **src/services/openaiService.ts**: Implementazione di `testOpenAIConnection` per validare API Key e Modello.
- **src/services/aiService.ts**: 
    - Aggiunta di `ensureOpenAIReady` (con sistema di caching simile a Gemini).
    - Aggiornamento di `translatePage` per includere il controllo di disponibilità anche per OpenAI prima di iniziare.

## 2. Allineamento Impostazioni e Default
- **src/hooks/useAiSettings.ts**: Correzione dei modelli di default (da `gemini-3...` a `gemini-2.0-flash`) per riflettere le opzioni effettivamente disponibili nell'interfaccia.
- **src/components/SettingsModal.tsx**: 
    - Aggiunta del tasto di test per OpenAI.
    - Unificazione della logica di salvataggio: il test di connessione diventa obbligatorio (o con conferma in caso di errore) per entrambi i provider.

## 3. Revisione Totale UI (Italiano)
- **Localizzazione Completa**: Correzione di tutti i testi "ibridi" in:
    - `Header.tsx` ("Ritraduci Tutto", "Salvataggio...")
    - `ReaderView.tsx` (messaggi di errore e log)
    - `SettingsModal.tsx` (descrizioni opzioni e avvisi di pericolo)
- **Tooltips**: Verifica che tutti i suggerimenti al passaggio del mouse siano in italiano.

## 4. Verifica e Stress Test
- Simulazione di API Key errate per entrambi i provider per confermare che il sistema blocchi l'utente prima che sprechi tempo in traduzioni destinate a fallire.
- Verifica del corretto re-rendering dei bottoni della toolbar durante il cambio di stato (Pausa/Play).
