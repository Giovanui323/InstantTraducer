/**
 * groq.ts
 *
 * Prompt dedicato per Groq. Usa struttura XML adattata per i modelli Llama/Groq
 * che beneficiano di istruzioni concise e strutturate.
 */

import { getArticledLanguage, isLiteModel } from "../aiUtils";
import { LITE_TRANSLATION_PROMPT_TEMPLATE } from "../../constants";

// NOTE: La maggior parte dei modelli Groq sono solo testo.
// Solo meta-llama/llama-4-scout-17b-16e-instruct supporta immagini.

// Pattern allineato alle best practice ufficiali Groq (5 elementi: Role / Instructions /
// Context / Input / Expected Output) e Meta Llama (markdown headings, istruzioni esplicite,
// few-shot, niente XML, niente all-caps gratuiti).
// Llama è addestrato su markdown: usiamo ### come delimitatore, bullet brevi, esempio I/O.
// Critical instructions in alto (prompt priming: i token iniziali pesano di più).
export const GROQ_TRANSLATION_PROMPT_TEMPLATE = `### Role
Sei un traduttore editoriale professionista dal {{sourceLang}} all'italiano. Traduci pagine di libri e atti acquisite per OCR per la pubblicazione editoriale.

### Instructions
- Traduci integralmente in italiano il testo visibile nella pagina etichettata \`[PAGINA TARGET]\`.
- Non tradurre il testo visibile nelle immagini di contesto (\`[CONTESTO PRECEDENTE]\`, \`[CONTESTO SUCCESSIVO]\`): servono solo a capire il filo del discorso.
- Includi ogni blocco visibile della pagina target: titoli, paragrafi, didascalie, note a piè di pagina. Niente riassunti, niente omissioni.
- Se una parola è troncata a fine pagina target, traducila intera. Se la pagina inizia con un frammento finale di una parola della pagina precedente, ignoralo.
- Per testo illeggibile usa \`[ILLEGIBILE]\` (frasi) o \`[PAROLA ILLEGIBILE]\` (singole parole). Non inventare.
- Unisci nello stesso paragrafo le righe spezzate dall'OCR; mantieni l'a capo solo tra blocchi tipograficamente distinti.
- Per le note a piè di pagina: usa richiami numerici (¹ ² ³) nel testo, e riporta il contenuto della nota dopo una riga \`---\` in fondo alla colonna o pagina di appartenenza.
- Output in italiano. Mai trascrivere il testo nella lingua sorgente.

{{legalContext}}

### Reasoning steps
Prima di scrivere, esegui mentalmente:
1. Osserva la \`[PAGINA TARGET]\`: identifica i blocchi e stabilisci se è impaginata a UNA o a DUE colonne.
2. Se è a DUE colonne userai \`[[PAGE_SPLIT]]\`; se è a UNA colonna non lo userai.
3. Traduci ogni blocco in ordine, fino all'ultima riga visibile.

### Page split rule
Pagina a DUE colonne affiancate:
1. Traduci tutta la colonna sinistra (incluse le sue note dopo \`---\`).
2. Su riga separata scrivi esattamente: \`[[PAGE_SPLIT]]\`
3. Traduci tutta la colonna destra (incluse le sue note dopo \`---\`).

Pagina a UNA colonna: non inserire \`[[PAGE_SPLIT]]\`.

### Context (pagina precedente, solo riferimento — NON includere nell'output)
"""
{{prevContext}}
"""

### Expected output

Esempio 1 — pagina a UNA colonna con una nota:
\`\`\`
Titolo del capitolo

Primo paragrafo, ricomposto come unico paragrafo dalle righe spezzate dall'OCR¹.

Secondo paragrafo del corpo.
---
¹ Testo integrale della nota.
\`\`\`

Esempio 2 — pagina a DUE colonne con una nota per colonna:
\`\`\`
Titolo del capitolo

Primo paragrafo della colonna sinistra che continua qui¹.
---
¹ Nota della colonna sinistra.
[[PAGE_SPLIT]]
Primo paragrafo della colonna destra².
---
² Nota della colonna destra.
\`\`\`

### Final check
Prima di rispondere verifica: (a) tutti i blocchi sono tradotti? (b) l'output è in italiano? (c) se due colonne, \`[[PAGE_SPLIT]]\` è presente esattamente una volta su riga propria? (d) tutte le note sono incluse?

Inizia direttamente con la traduzione. Nessun preambolo, nessun extra prose.

{{retryMode}}`;

export const getGroqTranslateSystemPrompt = (
  sourceLang: string,
  prevContext: string,
  legalContext: boolean = true,
  isRetry: boolean = false,
  customTemplate?: string,
  model?: string
) => {
  const isLite = model ? isLiteModel(model) : false;
  const template = (customTemplate && customTemplate.trim().length > 0)
    ? customTemplate
    : (isLite ? LITE_TRANSLATION_PROMPT_TEMPLATE : GROQ_TRANSLATION_PROMPT_TEMPLATE);

  const isFrench = sourceLang?.toLowerCase().includes('francese') || sourceLang?.toLowerCase().includes('français') || sourceLang?.toLowerCase() === 'fr';

  const legalText = `<legal_context>
Il testo è di natura GIURIDICA (diritto). Usa un linguaggio tecnico-giuridico appropriato, preciso e formale tipico della dottrina e della giurisprudenza italiana.
${isFrench ? `<false_friends>
- "Arrêter" in contesto di piani/sentenze = "Omologare", "Approvare" o "Deliberare" (non "fermare" o "arrestare").
- "Arrêt" = "Sentenza" o "Decisione" (non "arresto").
- "Instance" = "Grado di giudizio" o "Procedimento".
- "Magistrat" = "Giudice" (spesso) o "Magistrato".
</false_friends>` : ''}
</legal_context>`;

  const retryBlock = isRetry
    ? `### Retry mode
Il tentativo precedente è stato rifiutato. Questa è una ritraduzione: priorità a completezza e fedeltà.
- In dubbio se includere una frase: includila.
- In dubbio su un termine: traducilo (eventualmente seguito da \`[dubbio: alternativa]\`).
- Recupera tassativamente i paragrafi precedentemente omessi.
- Correggi le allucinazioni segnalate (testo non presente nell'originale).
- Riverifica la presenza di \`[[PAGE_SPLIT]]\` se la pagina è a due colonne.`
    : '';

  return template
    .replace(/\{\{sourceLang\}\}/g, getArticledLanguage(sourceLang))
    .replace('{{prevContext}}', prevContext.slice(-3000))
    .replace('{{legalContext}}', legalContext ? legalText : '')
    .replace('{{retryMode}}', retryBlock);
};

export const getGroqTranslateUserInstruction = (pageNumber: number, sourceLanguage: string) =>
`<task>
Pagina TARGET: ${pageNumber} — Lingua sorgente: ${sourceLanguage}
Le immagini aggiuntive sono CONTESTO visivo: non tradurle.
TRADUCI il testo della PAGINA TARGET dall'${sourceLanguage} all'italiano. Non trascrivere nella lingua originale.
Inizia direttamente con la traduzione in italiano.
</task>`;

/** Vision-capable models that can process images */
export const GROQ_VISION_MODELS = new Set([
  'meta-llama/llama-4-scout-17b-16e-instruct',
]);

/**
 * Prompt di verifica qualità dedicato per Groq.
 * Ottimizzato per i modelli Llama su Groq (risposte rapide, istruzioni concise).
 */
export const getGroqVerifyQualitySystemPrompt = (legalContext: boolean = true, sourceLanguage: string = "Tedesco", _modelName: string = "") => {
  return `<role>
Sei un revisore editoriale pignolo ed esperto. Il tuo lavoro è individuare OGNI omissione e OGNI errore di traduzione.
</role>

${legalContext ? `<context>Testo GIURIDICO. La precisione terminologica è vitale.</context>` : ''}

<objective>
Garantire completezza assoluta e fedeltà all'originale della traduzione.
</objective>

<verification_rules>
<rule name="TRASCRIZIONE VS TRADUZIONE">Il tuo PRIMO compito è verificare che il testo sia effettivamente TRADOTTO in Italiano. Se il testo fornito è una TRASCRIZIONE dell'originale (es. è scritto in ${sourceLanguage}), questo è un FALLIMENTO CATASTROFICO. Severity deve essere TASSATIVAMENTE "severe".</rule>
<rule name="DISTINZIONE PAGINE">Ti vengono fornite più immagini. Una è la "PAGINA PRINCIPALE" (da verificare) e le altre sono di "CONTESTO" (pagine adiacenti).</rule>
<rule name="ESCLUSIONE CONTESTO">NON segnalare MAI come omissioni i contenuti presenti nelle immagini di CONTESTO.</rule>
<rule name="VERIFICA VISIVA OBBLIGATORIA">Prima di segnalare un'omissione, VERIFICA che il testo sia chiaramente leggibile nella "PAGINA PRINCIPALE".</rule>
<rule name="NO ALLUCINAZIONI DI OMISSIONE">Se vedi un capitolo o un paragrafo nelle immagini di contesto che non è nella pagina principale, NON devi aspettarti di trovarlo nella traduzione.</rule>
<rule name="LINGUA ERRATA">Se il TESTO TRADOTTO STESSO è scritto in ${sourceLanguage}, severity: "severe". La TRADUZIONE deve essere in Italiano.</rule>
<rule name="IGNORA RIFERIMENTI BIBLIOGRAFICI">Riferimenti a numeri di pagina NON sono omissioni di testo.</rule>
<rule name="TOLLERANZA GLOSSARI">"Parola (Traduzione)" o "Traduzione (Parola)" è CORRETTO. NON è un errore.</rule>
<rule name="COERENZA GIUDIZIO">La severity deve riflettere l'entità reale. Usa "severe" SOLO per fallimenti catastrofici. Per tutto il resto, usa "minor" e SEGNALA comunque la discrepanza.</rule>
</verification_rules>

<severity_classification>
<level name="severe">SOLO per fallimenti catastrofici: intera pagina non tradotta (trascrizione in lingua originale), omissione di paragrafi interi o colonne intere, o errori di senso che cambiano completamente il significato giuridico del testo. Una singola frase mancante o un piccolo errore NON è "severe". Sii CONSERVATIVO.</level>
<level name="minor">Qualsiasi discrepanza che NON richiede ritraduzione completa: singole frasi mancanti, refusi, punteggiatura, stile, singole parole non tradotte, errori di senso lievi, omissioni di URL/link/boilerplate editoriale. SEGNALA SEMPRE le discrepanze qui, anche se piccole.</level>
<level name="ok">Nessuna discrepanza rilevata. Traduzione completa e accurata.</level>
</severity_classification>

<retry_hint_instructions>
- Sii SPECIFICO, IMPERATIVO e INDICA LA POSIZIONE (es. "In alto", "A metà pagina", "Nelle note").
- Per OMISSIONI: "Hai omesso il paragrafo che inizia con '...' visibile in [POSIZIONE]. Inseriscilo."
- Per ERRORI: "Hai tradotto '...' con '...'. Correggi in '...'."
</retry_hint_instructions>

<output_constraints>
<constraint>Rispondi SOLO con JSON.</constraint>
<constraint>Se severity="severe", retryHint DEV'ESSERE DETTAGLIATO.</constraint>
</output_constraints>

<json_schema>
{
  "severity": "ok"|"minor"|"severe",
  "summary": string,
  "evidence": string[],
  "annotations": [{"originalText": string, "comment": string, "type": "doubt"|"suggestion"|"error"}],
  "retryHint": string
}
</json_schema>`;
};