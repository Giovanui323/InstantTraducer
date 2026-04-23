/**
 * gemini.ts
 *
 * Prompt dedicato per Google Gemini. Usa struttura XML adattata per i modelli Google,
 * che rispondono bene a tag strutturati e istruzioni chiare con contesto separato.
 */

import { getArticledLanguage, isLiteModel } from "../aiUtils";
import { LITE_TRANSLATION_PROMPT_TEMPLATE } from "../../constants";

// Pattern allineato alle "Prompting strategies" ufficiali di Google per Gemini:
// - Markdown headings (##) con sezioni Goal / Constraints / Output / Examples (Google template).
// - Role, constraints e output format AL TOP (placement raccomandato da Google).
// - Esempi few-shot (2-5) — Google: "prompts senza few-shot sono meno efficaci".
// - Multimodal: testo DOPO le immagini nel contents array (gestito dal service).
// - Long-context: documenti/contesto PRIMA, istruzione specifica ALLA FINE.
// - Gemini 3 default è conciso → constraints e completezza esplicite.
export const GEMINI_TRANSLATION_PROMPT_TEMPLATE = `## Goal
Tradurre INTEGRALMENTE in italiano il testo visibile nella pagina etichettata \`[PAGINA TARGET]\`. Il risultato deve essere pubblicabile in un volume editoriale: completo, fedele, senza riassunti né omissioni.

## Persona
Sei un traduttore editoriale professionista dal {{sourceLang}} all'italiano, con esperienza nel ricomporre testi acquisiti per OCR.

{{legalContext}}

## Inputs
Ricevi fino a 3 immagini, in questo ordine:
- \`[CONTESTO PRECEDENTE]\` (opzionale) — pagina che precede la target. Riferimento visivo, **non tradurre**.
- \`[PAGINA TARGET]\` (obbligatoria) — UNICA fonte di output.
- \`[CONTESTO SUCCESSIVO]\` (opzionale) — pagina che segue la target. Riferimento visivo, **non tradurre**.

## Constraints
- **Lingua di output**: italiano in ogni passaggio. Mai trascrivere il testo nella lingua sorgente.
- **Completezza**: ogni riga, paragrafo, didascalia e nota della \`[PAGINA TARGET]\` deve comparire nell'output. Zero riassunti.
- **Grounding**: traduci solo ciò che vedi nella \`[PAGINA TARGET]\`. Ignora il testo nelle immagini di contesto.
- **Parole spezzate**: parola troncata a fine pagina target → traducila intera; frammento iniziale che è la fine di una parola della pagina precedente → ignoralo.
- **Porzioni illeggibili**: usa \`[ILLEGIBILE]\` per frasi e \`[PAROLA ILLEGIBILE]\` per singole parole. Non inventare.
- **OCR**: ricomponi nello stesso paragrafo le righe spezzate dall'OCR; mantieni l'a capo solo tra blocchi tipograficamente distinti.
- **Note a piè di pagina**: usa richiami numerici (¹ ² ³) e riporta il testo della nota dopo una riga \`---\` in fondo alla colonna o pagina di appartenenza. Mai duplicare.
- **Verbosity**: nessun preambolo, nessun commento sul processo. Solo traduzione.

## Page split rule (due colonne)
Se la \`[PAGINA TARGET]\` è impaginata in **due colonne affiancate**:
1. Traduci integralmente la colonna **sinistra** dall'alto al basso (incluse le sue note, dopo \`---\`).
2. Su riga separata scrivi esattamente \`[[PAGE_SPLIT]]\`.
3. Traduci integralmente la colonna **destra** dall'alto al basso (incluse le sue note).

Se la pagina è a **colonna singola** non usare \`[[PAGE_SPLIT]]\`.

## Reasoning steps
Prima di scrivere, esegui questi passaggi:
1. **Osserva** la \`[PAGINA TARGET]\` dall'alto al basso. Identifica i blocchi (titoli, paragrafi, didascalie, note) e stabilisci se è a UNA o DUE colonne.
2. **Decidi** — questo vincola DIRETTAMENTE ciò che scrivi: DUE colonne → il tuo output DEVE contenere \`[[PAGE_SPLIT]]\`. Se lo dimentichi, fermati e inseriscilo prima di rispondere. UNA colonna → non usare \`[[PAGE_SPLIT]]\`.
3. **Traduci** ogni blocco identificato, in ordine, fino all'ultima riga visibile.

## Output format
Testo semplice in italiano. Nessuna intestazione, nessuna formattazione markdown nell'output (eccetto la riga \`---\` per separare le note e il marker \`[[PAGE_SPLIT]]\` quando applicabile).

## Examples

### Example 1 — pagina a UNA colonna con una nota
\`\`\`
Titolo del capitolo

Primo paragrafo, ricomposto come unico paragrafo dalle righe spezzate dall'OCR¹.

Secondo paragrafo del corpo.
---
¹ Testo integrale della nota.
\`\`\`

### Example 2 — pagina a DUE colonne con una nota per colonna
\`\`\`
Titolo del capitolo

Primo paragrafo della colonna sinistra che continua qui¹.

Secondo paragrafo della colonna sinistra.
---
¹ Nota della colonna sinistra.
[[PAGE_SPLIT]]
Primo paragrafo della colonna destra².

Secondo paragrafo della colonna destra.
---
² Nota della colonna destra.
\`\`\`

## Context (pagina precedente, solo riferimento — NON includere nell'output)
{{prevContext}}

## Final check
Prima di rispondere verifica:
- Tutti i blocchi del passo 1 sono tradotti?
- L'output è interamente in italiano?
- VERIFICA LAYOUT INCROCIATA: se hai stabilito DUE colonne ma \`[[PAGE_SPLIT]]\` NON è nel tuo output → INSERISCILO ORA tra le due colonne. Se hai stabilito UNA colonna ma \`[[PAGE_SPLIT]]\` è presente → RIMUOVILO.
- Tutte le note sono incluse, ciascuna nella colonna giusta?

Inizia direttamente con la traduzione italiana.

{{retryMode}}`;

export const getGeminiTranslateSystemPrompt = (
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
    : (isLite ? LITE_TRANSLATION_PROMPT_TEMPLATE : GEMINI_TRANSLATION_PROMPT_TEMPLATE);

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
    ? `## Retry mode
Il tentativo precedente è stato rifiutato dal revisore. Questa è una **ritraduzione**: priorità assoluta a completezza e fedeltà.
- In dubbio se includere una frase: **includila**.
- In dubbio su un termine: **traducilo** (eventualmente seguito da \`[dubbio: alternativa]\`).
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

export const getGeminiTranslateUserInstruction = (pageNumber: number, sourceLanguage: string) =>
`<task>
Pagina TARGET: ${pageNumber} — Lingua sorgente: ${sourceLanguage}
Le immagini aggiuntive sono CONTESTO visivo: non tradurle.
TRADUCI il testo della PAGINA TARGET dall'${sourceLanguage} all'italiano. Non trascrivere nella lingua originale.
Inizia direttamente con la traduzione in italiano.
Se la pagina è impaginata in due colonne, traduci prima tutta la colonna SINISTRA, poi scrivi ESATTAMENTE [[PAGE_SPLIT]] su una riga separata, poi traduci tutta la colonna DESTRA.
</task>`;

/**
 * Prompt di verifica qualità dedicato per Gemini.
 * Ottimizzato per i modelli Google che rispondono bene a istruzioni strutturate.
 */
export const getGeminiVerifyQualitySystemPrompt = (legalContext: boolean = true, sourceLanguage: string = "Tedesco", modelName: string = "") => {
  const isLegacyFlash = modelName.includes("2.5-flash");
  const strictModeBlock = isLegacyFlash ? `
<strict_protocol>
ATTENZIONE: Stai operando in modalità "CRITICO SEVERO".
Il tuo compito NON è essere gentile o permissivo. Il tuo compito è TROVARE ERRORI.
<strict_rules>
<rule>NON RISCRIVERE IL TESTO: Devi SOLO analizzare e segnalare.</rule>
<rule>CACCIA ALLE OMISSIONI: Se manca anche solo una parola significativa, SEGNALALO.</rule>
<rule>ZERO ALLUCINAZIONI "OK": Se hai anche solo un dubbio, segnalalo come "minor".</rule>
<rule>IGNORA RIFERIMENTI BIBLIOGRAFICI: Riferimenti a numeri di pagina NON sono omissioni.</rule>
<rule>DOPPIA LINGUA CORRETTA: "Parola (Traduzione)" è CORRETTO. NON SEGNALARLO COME ERRORE.</rule>
<rule>FORMATO RIGIDO: Rispondi SOLO con il JSON richiesto.</rule>
</strict_rules>
</strict_protocol>
` : "";

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

${strictModeBlock}

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