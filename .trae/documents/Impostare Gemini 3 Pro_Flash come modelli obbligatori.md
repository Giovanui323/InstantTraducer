## Obiettivo
- Traduzione: usare sempre **gemini-3-pro-preview**.
- Verifica qualità: usare sempre **gemini-3-flash-preview**.

## Dove intervenire (stato attuale)
- Default modelli: [useAiSettings.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/hooks/useAiSettings.ts#L5-L15)
- Selezione modelli in UI: [SettingsModal.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/SettingsModal.tsx#L201-L275)
- Uso effettivo del modello per traduzione/verifica: [aiService.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/aiService.ts#L55-L186) → [geminiService.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/geminiService.ts#L48-L372)
- Fallback modello verifica in hook qualità: [useAppQuality.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/hooks/useAppQuality.ts#L110-L116)

## Piano di modifica
1) Centralizzare i due model id
- Aggiungere in [constants.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/constants.ts) due costanti:
  - `GEMINI_TRANSLATION_MODEL = 'gemini-3-pro-preview'`
  - `GEMINI_VERIFIER_MODEL = 'gemini-3-flash-preview'`

2) Aggiornare i tipi e i default
- In [types.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/types.ts#L4-L11) includere esplicitamente anche `gemini-3-pro-preview` e `gemini-3-flash-preview` nella union (resta comunque `| string`).
- In [useAiSettings.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/hooks/useAiSettings.ts#L5-L15) impostare i default ai nuovi valori.
- Aggiungere una normalizzazione in fase di load delle settings: se provider è `gemini`, assicurare che `settings.gemini.model` e `settings.qualityCheck.verifierModel` vengano riportati ai due nuovi model id (così anche i progetti già salvati migrano automaticamente).

3) Rendere i modelli “obbligatori” a runtime
- In [aiService.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/services/aiService.ts#L55-L186):
  - Traduzione (provider gemini): ignorare `translationModelOverride` e qualsiasi modello salvato, usando sempre `GEMINI_TRANSLATION_MODEL`.
  - Verifica qualità (provider gemini): usare sempre `GEMINI_VERIFIER_MODEL`.

4) Allineare l’UI alle nuove regole
- In [SettingsModal.tsx](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/components/SettingsModal.tsx#L201-L275):
  - Mostrare i nuovi modelli (Gemini 3 Pro / Gemini 3 Flash) come selezionati di default.
  - Disabilitare/semplificare la selezione dei vecchi modelli quando provider è Gemini, per evitare mismatch tra UI e comportamento reale.

5) Sistemare fallback incoerenti
- In [useAppQuality.ts](file:///Users/lucasicignano/Lavoro%20temporaneo/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/src/hooks/useAppQuality.ts#L110-L116) sostituire il fallback hardcoded `gemini-1.5-flash` con `GEMINI_VERIFIER_MODEL` (o, meglio, usare sempre `settings.qualityCheck.verifierModel` che sarà normalizzato).

## Verifica
- Build TypeScript/electron (build già presente nel repo) per assicurare che non ci siano errori di tipi.
- Smoke test manuale:
  - avvio traduzione di 1 pagina e controllo log: deve riportare `gemini-3-pro-preview`.
  - avvio verifica qualità e controllo log/meta: deve riportare `gemini-3-flash-preview`.

## Output atteso
- Qualunque impostazione precedente viene migrata, e l’app usa sempre Gemini 3 Pro per tradurre e Gemini 3 Flash per verificare, senza dipendere dalla selezione UI.