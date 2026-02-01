## Obiettivo
Migliorare la resa visiva di traduzione e note sia nell’app (lettore) sia nel PDF esportato: dimensioni coerenti, separazione chiara tra note, paragrafi e titoli più fedeli all’originale.

## Prompt di traduzione (Gemini)
- Esplicitare un markup univoco per i richiami di nota: [[parola|testo-nota]].
- Chiedere che i richiami (¹ ² ³) restino nel corpo ma che OGNI nota sia anche fornita nel markup [[...]] per consentire parsing robusto.
- Ribadire che le note vadano a capo e siano separate da spaziatura.
- Modifica prevista: aggiornare TRANSLATE_PROMPT in [geminiService.ts](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/services/geminiService.ts#L143-L182) e l’istruzione utente (effectiveInstruction) per includere il requisito del markup [[...]].

## Renderer condiviso (frontend)
- Portare in frontend le funzioni di rendering oggi usate nel main per l’export: renderInlineHtml, detectHeadingLevel, renderExportBlocksHtml.
- Nuovo modulo utils (es. src/utils/renderText.ts) con:
  - Parsing di **grassetto** e *corsivo*.
  - Parsing [[parola|nota]] con generazione numeri di richiamo e lista note.
  - Riconoscimento di titoli (H1/H2/H3) e paragrafi con rientro.
- Aggiornare renderReaderMode in [App.tsx](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/App.tsx#L2095-L2110) per usare dangerouslySetInnerHTML con l’HTML del renderer invece di mostrare il testo raw (whitespace-pre-wrap).

## Stili coerenti (app)
- Aggiungere classi CSS dedicate al lettore:
  - Base tipografica serif, dimensione uniforme (es. 15px) e line-height 1.6.
  - .footnotes con separatore e lista verticale.
  - .footnote con indentazione “hanging” (numero allineato a sinistra, testo rientrato) e dimensione fissa (es. 13px) per coerenza.
  - .footnoteRef più piccolo (superscript) ma proporzionato.
- Integrare le classi nel container del lettore; evitare che text-lg globale alteri le note.

## Stili coerenti (PDF export)
- Uniformare CSS in buildExportHtml:
  - Stabilire font-size base (12.5pt) e fissare .footnote a 10–10.5pt.
  - Applicare hanging indent alle note e spaziatura costante tra voci.
  - Inserire una label “Note” opzionale se presenti.
- Aggiornare lo stile nel main: [main.js](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/electron/main.js#L245-L351).

## UX opzionale
- Toggle “Mostra note come popover” in app: clic sul numero mostra la nota sopra, mantenendo comunque la lista a fine pagina.
- Impostazione in Settings per dimensione base del testo (es. 14–16px) che ridimensiona proporzionalmente anche .footnote e .footnoteRef.

## Verifica
- Eseguire su 2–3 pagine con note: confronto visivo prima/dopo in app e PDF.
- Validare: separazione note, dimensioni coerenti, paragrafi e titoli corretti.
- Testare che l’export non cambi impaginazione di pagina (A4, printBackground true) e che il parsing [[...]] funzioni anche con note lunghe.

## Output atteso
- Lettore: testo più vicino all’originale; note chiaramente separate e leggibili.
- PDF: layout editoriale con note uniformi e riconoscibili, senza variazioni di dimensione tra pagine.

Confermi che procedo con queste modifiche?