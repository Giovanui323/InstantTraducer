## Obiettivo
- Permettere di scegliere la lingua di input del PDF sia nelle Impostazioni (default) sia al momento del caricamento del file.
- Supportare inserimento manuale della lingua (es. “tedesco”, “francese”, “inglese”).

## Stato attuale
- La lingua sorgente è hardcoded a “tedesco” nelle chiamate di traduzione in App: [App.tsx:L1218-L1226](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/App.tsx#L1218-L1226) e per ritraduzione: [App.tsx:L625-L633](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/App.tsx#L625-L633).
- I provider (Gemini/OpenAI) già accettano sourceLanguage e lo integrano nel prompt, quindi non necessitano modifiche.

## Nuovi file (per non appesantire App.tsx)
- components/InputLanguageSelector.tsx: componente riutilizzabile con campo testo + suggerimenti (datalist) per “tedesco, francese, inglese, spagnolo…”, ma sempre editabile.
- components/UploadLanguagePrompt.tsx: piccolo modal mostrato subito dopo la selezione del PDF; contiene InputLanguageSelector e restituisce la lingua scelta.
- src/hooks/useInputLanguageDefault.ts: hook che legge/scrive la lingua di input di default dalle Impostazioni (localStorage + settings.json via Electron).

## Aggiornamenti mirati (file esistenti)
- types.ts: aggiungere a AISettings il campo opzionale inputLanguageDefault.
- components/SettingsModal.tsx: aggiungere sezione “Lingua di input (default)” usando InputLanguageSelector; persistere su localStorage e su settings.json tramite window.electronAPI.saveSettings.
- App.tsx (modifiche minime):
  - Introdurre stato docInputLanguage per il documento caricato.
  - In handleBrowseClick/handleFileChange aprire UploadLanguagePrompt con default preso da useInputLanguageDefault; al “Conferma” impostare docInputLanguage e proseguire il parsing.
  - Passare docInputLanguage come sourceLanguage alle chiamate di traduzione ai servizi: sostituire i "tedesco" hardcoded in [App.tsx:L1218-L1226](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/App.tsx#L1218-L1226) e [App.tsx:L625-L633](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/App.tsx#L625-L633).

## Persistenza
- localStorage: nuova chiave input_language_default.
- settings.json (Electron): salvataggio trasparente dell’intero oggetto impostazioni; il main già scrive/legge JSON generico, quindi il campo aggiuntivo verrà gestito senza modifiche ([electron/main.js:L369-L377](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/electron/main.js#L369-L377), [L384-L401](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/electron/main.js#L384-L401)).

## UX dettagli
- Impostazioni: campo testo con suggerimenti, ma l’utente può scrivere qualsiasi lingua.
- Upload: dopo la scelta del file, mostra UploadLanguagePrompt con il default precompilato; pulsanti “Conferma”/“Annulla”.
- Validazione: non vuoto; nessuna restrizione su dizionari/codici.

## Verifica
- Caricare PDF, selezionare lingua in prompt; avviare traduzione e controllare che i prompt dei provider incorporino la lingua scelta.
- Testare ritraduzione/crop: la stessa lingua deve essere riutilizzata.
- Verificare persistenza del default in Impostazioni tra riavvii.

Se confermi, procedo a creare i nuovi file e ad applicare le modifiche puntuali indicate.