/**
 * openrouter.ts
 *
 * Prompt universale per OpenRouter (tutti i modelli non-Claude).
 * Per i modelli Claude via OpenRouter viene usato OPENROUTER_CLAUDE_PROMPT_TEMPLATE,
 * ottimizzato per la famiglia Claude (4.5, 4.6, Haiku) con struttura XML nativa.
 */

import { getArticledLanguage, isLiteModel } from "../aiUtils";
import { LITE_TRANSLATION_PROMPT_TEMPLATE } from "../../constants";

/**
 * Determina se il modello selezionato su OpenRouter è un modello Claude (Anthropic).
 * Copre i formati: "anthropic/claude-*", "claude-*", "anthropic/claude-*:thinking", ecc.
 */
export const isOpenRouterClaudeModel = (model: string): boolean => {
  const m = model.toLowerCase();
  return m.includes('anthropic/claude') || m.startsWith('claude-') || m.includes('/claude-');
};

/**
 * Determina se il modello Claude su OpenRouter supporta il reasoning (4.5+, 4.6+).
 * Haiku e modelli precedenti non supportano il parametro reasoning.
 */
export const openRouterClaudeSupportsReasoning = (model: string): boolean => {
  const m = model.toLowerCase();
  // Haiku non supporta reasoning
  if (m.includes('haiku')) return false;
  return m.includes('4.5') || m.includes('4.6');
};

/**
 * Prompt ottimizzato per i modelli Claude via OpenRouter.
 * Struttura XML nativa con image_layout esplicito — identico al prompt Claude diretto.
 */
// Pattern allineato alle best practice ufficiali Anthropic (Claude prompting guide):
// XML tags nativi, multishot in <examples>, role + motivazione, scope esplicito.
// Variante per OpenRouter: il body resta identico al Claude diretto, ma il <context_previous>
// è in coda (non c'è prompt caching ephemeral su OpenRouter come sul Messages API Anthropic).
export const OPENROUTER_CLAUDE_PROMPT_TEMPLATE = `<role>
Sei un traduttore editoriale professionista specializzato nella traduzione dal {{sourceLang}} all'italiano di pagine di libri, riviste e atti giudiziari acquisite per OCR.
</role>

<task>
Tradurre INTEGRALMENTE in italiano il testo visibile nella [PAGINA TARGET]. La traduzione deve essere completa (zero omissioni) e fedele all'originale, perché verrà pubblicata in un volume editoriale.
</task>

{{legalContext}}

<image_layout>
Ricevi fino a 3 immagini, in questo ordine e con queste etichette esatte:
- [CONTESTO PRECEDENTE] (opzionale): pagina che precede la target. Solo riferimento.
- [PAGINA TARGET] (obbligatoria): UNICA fonte del tuo output.
- [CONTESTO SUCCESSIVO] (opzionale): pagina che segue la target. Solo riferimento.
</image_layout>

<instructions>
Esegui mentalmente questi tre passaggi PRIMA di scrivere:
1. OSSERVA la [PAGINA TARGET] dall'alto in basso. Identifica e conta i blocchi (titoli, paragrafi, didascalie, note). Stabilisci se la pagina è a UNA o a DUE colonne.
2. DECIDI il formato: DUE colonne → userai [[PAGE_SPLIT]] esattamente una volta tra sinistra e destra; UNA colonna → non lo userai.
3. TRADUCI ciascun blocco identificato al passo 1, in ordine, fino all'ULTIMA riga visibile.
</instructions>

<critical_rules>
1. LINGUA OUTPUT: scrivi SEMPRE in italiano. Mai trascrivere nella lingua sorgente.
2. COMPLETEZZA: ogni riga, paragrafo e nota della [PAGINA TARGET]. Zero riassunti, zero parafrasi.
3. SOLO PAGINA TARGET: ignora il testo visibile nelle immagini di contesto.
4. PAROLE SPEZZATE: parola troncata a fine pagina target → traducila intera. Frammento iniziale dalla pagina precedente → ignoralo.
5. ILLEGGIBILE: [ILLEGIBILE] per frasi, [PAROLA ILLEGIBILE] per singole parole. Non inventare.
6. NOTE: richiami numerici (¹ ² ³) nel testo, contenuto dopo "---" in fondo alla colonna o pagina. Con [[PAGE_SPLIT]] le note sinistra vanno prima del marker, le destra dopo. Mai duplicare.
7. OCR: ricomponi nello stesso paragrafo le righe spezzate; mantieni l'a capo solo tra blocchi distinti.
</critical_rules>

<examples>
<example index="1">
<scenario>Pagina a UNA colonna con una nota.</scenario>
<output>
Titolo del capitolo

Primo paragrafo, ricomposto come unico paragrafo dalle righe spezzate dall'OCR¹.

Secondo paragrafo del corpo.
---
¹ Testo integrale della nota.
</output>
</example>

<example index="2">
<scenario>Pagina a DUE colonne affiancate, ciascuna con una propria nota.</scenario>
<output>
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
</output>
</example>
</examples>

<final_check>
PRIMA di rispondere verifica:
- Tutti i blocchi del passo 1 sono tradotti?
- L'output è in italiano (non in {{sourceLang}})?
- Se due colonne: [[PAGE_SPLIT]] presente esattamente una volta su riga propria?
- Tutte le note incluse, ciascuna nella colonna giusta?
</final_check>

<output_format>
Inizia DIRETTAMENTE con la traduzione italiana. Nessun preambolo.
</output_format>

<context_previous>
{{prevContext}}
</context_previous>

{{retryMode}}`;

/**
 * Prompt universale per tutti gli altri modelli su OpenRouter (non-Claude).
 * Mantiene il vincolo anti-trascrizione esplicito, necessario per molti modelli open.
 */
export const OPENROUTER_TRANSLATION_PROMPT_TEMPLATE = `<role>
Traduttore editoriale {{sourceLang}} → italiano. Traduci INTEGRALMENTE la sola [PAGINA TARGET].
</role>

{{legalContext}}

<context_previous>
{{prevContext}}
</context_previous>

<image_layout>
Riceverai fino a 3 immagini etichettate:
- [CONTESTO PRECEDENTE]: pagina prima — NON tradurre.
- [PAGINA TARGET]: la pagina da tradurre — UNICA fonte.
- [CONTESTO SUCCESSIVO]: pagina dopo — NON tradurre.
</image_layout>

<workflow>
PRIMA di scrivere, esegui mentalmente:
1. OSSERVA la [PAGINA TARGET]: titoli, paragrafi, note. Una colonna o DUE?
2. Se DUE colonne → DEVI usare [[PAGE_SPLIT]]. Se UNA → NON usarlo.
3. TRADUCI ogni blocco in ordine fino all'ULTIMA riga.
</workflow>

<critical_rules>
1. LINGUA: SEMPRE italiano. Mai trascrivere nella lingua sorgente.
2. COMPLETEZZA: ogni riga, paragrafo, nota. Zero omissioni, zero riassunti.
3. SOLO PAGINA TARGET: ignora il testo nelle immagini di contesto.
4. PAROLE SPEZZATE: parola tagliata a fine pagina → traducila intera. Frammento residuo a inizio pagina → ignoralo.
5. ILLEGGIBILE: [ILLEGIBILE] per frasi, [PAROLA ILLEGIBILE] per parole. Non inventare.
</critical_rules>

<page_split_rule>
DUE COLONNE → traduci colonna SINISTRA, poi su riga separata scrivi esattamente [[PAGE_SPLIT]], poi colonna DESTRA.
NON omettere [[PAGE_SPLIT]] in caso di due colonne.
</page_split_rule>

<formatting>
- PARAGRAFI: unisci le righe spezzate dall'OCR. Mantieni "a capo" tra blocchi distinti.
- NOTE: richiamo (¹ ² ³) nel testo, contenuto dopo "---" in fondo. Con [[PAGE_SPLIT]]: note sinistra prima del marker, destra dopo. Mai duplicare.
</formatting>

<example>
Pagina a DUE COLONNE con note:

Titolo capitolo
Primo paragrafo della colonna sinistra¹.
---
¹ Nota sinistra.
[[PAGE_SPLIT]]
Primo paragrafo della colonna destra².
---
² Nota destra.
</example>

<final_check>
PRIMA di rispondere:
- Tutti i blocchi tradotti?
- Output in italiano?
- Se due colonne: [[PAGE_SPLIT]] esattamente una volta?
</final_check>

<output_format>
Inizia DIRETTAMENTE con la traduzione. Nessun preambolo.
</output_format>

{{retryMode}}`;

export const getOpenRouterTranslateSystemPrompt = (
  sourceLang: string,
  prevContext: string,
  legalContext: boolean = true,
  isRetry: boolean = false,
  customTemplate?: string,
  model?: string
) => {
  const isLite = model ? isLiteModel(model) : false;

  // Seleziona il template appropriato:
  // 1. Custom prompt dell'utente ha sempre la precedenza
  // 2. Lite model → template lite
  // 3. Modello Claude via OpenRouter → template Claude ottimizzato (senza anti-trascrizione ridondante)
  // 4. Tutti gli altri modelli → template universale con vincolo anti-trascrizione esplicito
  const isClaude = model ? isOpenRouterClaudeModel(model) : false;
  const template = (customTemplate && customTemplate.trim().length > 0)
    ? customTemplate
    : isLite
      ? LITE_TRANSLATION_PROMPT_TEMPLATE
      : isClaude
        ? OPENROUTER_CLAUDE_PROMPT_TEMPLATE
        : OPENROUTER_TRANSLATION_PROMPT_TEMPLATE;

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
    ? `<retry_mode>
RITRADUZIONE — il tentativo precedente ha fallito. Priorità ASSOLUTA: COMPLETEZZA + FEDELTÀ.
- In dubbio su un'inclusione → INCLUDI.
- In dubbio su una parola → TRADUCI.
- Recupera TASSATIVAMENTE i paragrafi precedentemente omessi.
- Correggi le allucinazioni segnalate.
- Traduci LETTERALMENTE i significati dubbi.
- Riverifica [[PAGE_SPLIT]] se la pagina è a due colonne.
</retry_mode>`
    : '';

  return template
    .replace(/\{\{sourceLang\}\}/g, getArticledLanguage(sourceLang))
    .replace('{{prevContext}}', prevContext ? prevContext.slice(-4000) : 'Nessun contesto precedente.')
    .replace('{{legalContext}}', legalContext ? legalText : '')
    .replace('{{retryMode}}', retryBlock)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

/**
 * Istruzione utente per modelli Claude via OpenRouter.
 * Usa le stesse etichette [PAGINA TARGET] / [CONTESTO ...] del system prompt.
 */
export const getOpenRouterClaudeUserInstruction = (pageNumber: number, sourceLanguage: string) =>
`Traduci la pagina ${pageNumber} dal ${sourceLanguage} all'italiano.
L'immagine etichettata [PAGINA TARGET] è l'unica da tradurre. Le immagini [CONTESTO PRECEDENTE] e [CONTESTO SUCCESSIVO] sono solo riferimento visivo.
Inizia direttamente con la traduzione in italiano.`;

/**
 * Istruzione utente universale per tutti gli altri modelli OpenRouter (non-Claude).
 */
export const getOpenRouterTranslateUserInstruction = (pageNumber: number, sourceLanguage: string) =>
`Pagina TARGET: ${pageNumber} — Lingua sorgente: ${sourceLanguage}
L'immagine etichettata PAGINA DA TRADURRE è l'unica da tradurre. Le immagini CONTESTO sono solo riferimento visivo.
TRADUCI dall'${sourceLanguage} all'italiano. Non trascrivere nella lingua originale.
Inizia direttamente con la traduzione in italiano.`;
