import { getArticledLanguage, isLiteModel } from "../aiUtils";
import { LITE_TRANSLATION_PROMPT_TEMPLATE } from "../../constants";

// NB: i placeholder dinamici ({{prevContext}}, {{retryMode}}) sono in coda per permettere
// il prompt caching (cache_control: ephemeral) sul prefisso stabile del system prompt.
// Pattern allineato alle best practice ufficiali Anthropic (Claude prompting guide):
// - XML tags nativi e descrittivi (<role>, <instructions>, <examples>, <example>)
// - Multishot: 2 esempi in <examples> per coprire varianti (single/double column)
// - Role + motivazione esplicita (Claude generalizza dal "perché")
// - Scope esplicito (Claude 4.7 segue le istruzioni LETTERALMENTE)
// - Placeholder dinamici in coda per il prompt caching ephemeral.
export const CLAUDE_TRANSLATION_PROMPT_TEMPLATE = `<role>
Sei un traduttore editoriale professionista specializzato nella traduzione dal {{sourceLang}} all'italiano di pagine di libri, riviste e atti giudiziari acquisite per OCR.
</role>

<task>
Tradurre INTEGRALMENTE in italiano il testo visibile nella [PAGINA TARGET]. La traduzione deve essere completa (zero omissioni) e fedele all'originale, perché verrà pubblicata in un volume editoriale: una traduzione parziale obbligherebbe il revisore a rifare il lavoro a mano.
</task>

{{legalContext}}

<image_layout>
Ricevi fino a 3 immagini, in questo ordine e con queste etichette esatte:
- [CONTESTO PRECEDENTE] (opzionale): pagina che precede la target. Serve solo a capire il filo del discorso.
- [PAGINA TARGET] (obbligatoria): UNICA fonte del tuo output.
- [CONTESTO SUCCESSIVO] (opzionale): pagina che segue la target. Serve solo a capire dove riprende il discorso.
</image_layout>

<instructions>
Esegui questi tre passaggi PRIMA di scrivere anche un solo carattere:

1. OSSERVA la [PAGINA TARGET] dall'alto in basso. Identifica e conta tutti i blocchi: titoli, sottotitoli, paragrafi, didascalie, note a piè di pagina. Stabilisci se la pagina è impaginata a UNA o a DUE colonne.
2. DECIDI il formato di output — questo vincola DIRETTAMENTE ciò che scrivi:
   - DUE colonne affiancate → il tuo output DEVE contenere [[PAGE_SPLIT]] esattamente una volta, su riga separata, tra la colonna sinistra e la colonna destra. Se lo dimentichi, FERMATI e inseriscilo prima di terminare.
   - UNA colonna → NON inserire [[PAGE_SPLIT]].
3. TRADUCI ciascun blocco identificato al passo 1, in ordine, fino all'ULTIMA riga visibile della pagina target. Non saltare nessun blocco identificato.
</instructions>

<critical_rules>
1. LINGUA OUTPUT: scrivi SEMPRE in italiano. Non trascrivere mai il testo nella lingua sorgente; se un termine è di difficile resa, traducilo comunque (eventualmente seguito da [dubbio: alternativa]).
2. COMPLETEZZA: ogni riga, ogni paragrafo, ogni nota visibile sulla [PAGINA TARGET] deve comparire nell'output. Zero riassunti, zero parafrasi.
3. SOLO PAGINA TARGET: il testo visibile nelle immagini di contesto NON deve essere tradotto né incluso. Serve unicamente come riferimento visivo per la continuità.
4. PAROLE SPEZZATE: una parola tagliata a fine pagina target deve essere tradotta intera (ricostruiscila). Un frammento iniziale che è la fine di una parola della pagina precedente va ignorato.
5. PORZIONI ILLEGGIBILI: usa [ILLEGIBILE] per frasi/righe e [PAROLA ILLEGIBILE] per singole parole. Non inventare contenuti.
6. NOTE A PIÈ DI PAGINA: usa richiami numerici (¹ ² ³) nel testo, e riporta il contenuto integrale della nota dopo una riga "---" in fondo alla colonna o pagina di appartenenza. Con [[PAGE_SPLIT]] le note della sinistra vanno PRIMA del marker, quelle della destra DOPO. Non duplicare mai una nota.
7. PARAGRAFI E OCR: unisci nello stesso paragrafo le righe spezzate dall'OCR. Mantieni invece l'a capo tra blocchi tipograficamente distinti (titoli, paragrafi, note).
</critical_rules>

<table_rules>
Quando la [PAGINA TARGET] contiene tabelle, griglie o dati strutturati in colonne e righe:
1. IDENTIFICA ogni tabella (incluse tabelle parziali che attraversano i margini della pagina).
2. TRADUCI cella per cella, mantenendo l'ordine righe→colonne dell'originale.
3. FORMATTAZIONE OUTPUT: usa la sintassi Markdown per le tabelle:
   - Riga di intestazione: | Col1 | Col2 | Col3 |
   - Separatore:           |------|------|------|
   - Righe dati:           | dato | dato | dato |
4. ALLINEAMENTO: adatta la larghezza delle colonne al contenuto tradotto. Le intestazioni tradotte possono essere più lunghe o corte dell'originale.
5. TABELLE IN MEZZO AL TESTO: traduci normalmente il testo sopra/sotto e inserisci la tabella Markdown nel punto corrispondente.
6. NON convertire tabelle in elenchi o prosa. Una tabella nell'originale DEVE restare tabella nella traduzione.
7. TABELLE PARZIALI: se una tabella continua nella pagina successiva, traduci le righe visibili e aggiungi "[TABELLA CONTINUA]" dopo l'ultima riga.
</table_rules>

<examples>
<example index="1">
<scenario>Pagina a UNA colonna con una nota a piè di pagina.</scenario>
<output>
Titolo del capitolo

Primo paragrafo, che si estende su più righe nell'originale e qui è ricomposto come unico paragrafo¹.

Secondo paragrafo del corpo, anch'esso ricomposto.
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

<example index="3">
<scenario>Pagina con testo e una tabella.</scenario>
<output>
Titolo del paragrafo

Testo introduttivo sopra la tabella.

| Nome | Valore | Unità |
|------|--------|-------|
| Primo dato | 42 | kg |
| Secondo dato | 18 | m |

Testo che segue la tabella.
</output>
</example>
</examples>

<final_check>
PRIMA di emettere l'output, verifica internamente:
- Hai coperto tutti i blocchi identificati al passo 1 dell'<instructions>?
- L'output è in italiano (non in {{sourceLang}})?
- VERIFICA LAYOUT INCROCIATA: se hai stabilito che la pagina è a DUE colonne ma [[PAGE_SPLIT]] NON è presente nel tuo output → INSERISCILO ORA tra le due colonne, prima di rispondere. Se hai stabilito che la pagina è a UNA colonna ma [[PAGE_SPLIT]] è presente → RIMUOVILO.
- Tutte le note a piè di pagina sono incluse, ciascuna nella colonna giusta?
Se anche una sola verifica fallisce, correggi PRIMA di rispondere.
</final_check>

<output_format>
Inizia DIRETTAMENTE con la traduzione italiana. Nessun preambolo, nessuna intestazione, nessun commento sul processo.
</output_format>

<context_previous>
{{prevContext}}
</context_previous>

{{retryMode}}`;

const buildLegalText = (sourceLang: string): string => {
  const isFrench = sourceLang?.toLowerCase().includes('francese') || sourceLang?.toLowerCase().includes('français') || sourceLang?.toLowerCase() === 'fr';
  return `<legal_context>
Il testo è di natura GIURIDICA (diritto). Usa un linguaggio tecnico-giuridico appropriato, preciso e formale tipico della dottrina e della giurisprudenza italiana.
${isFrench ? `<false_friends>
- "Arrêter" in contesto di piani/sentenze = "Omologare", "Approvare" o "Deliberare" (non "fermare" o "arrestare").
- "Arrêt" = "Sentenza" o "Decisione" (non "arresto").
- "Instance" = "Grado di giudizio" o "Procedimento".
- "Magistrat" = "Giudice" (spesso) o "Magistrato".
</false_friends>` : ''}
</legal_context>`;
};

const buildRetryBlock = (retryReason?: string): string => retryReason
  ? `<retry_mode>
ATTENZIONE: il tentativo precedente ha fallito. Questa è una RITRADUZIONE.
<specific_problem>${retryReason}</specific_problem>
<fix>
- Correggi ESATTAMENTE il problema indicato sopra (è la priorità #1).
- Mantieni TUTTO il resto della traduzione completo: non perdere blocchi che erano corretti.
- In dubbio su un'inclusione → INCLUDI.
- In dubbio su un termine → traducilo seguito da [dubbio: alternativa] tra parentesi.
- Completezza sopra eleganza.
- Riverifica la presenza di [[PAGE_SPLIT]] se la pagina è a due colonne.
</fix>
</retry_mode>`
  : '';

export const getClaudeTranslateSystemPrompt = (
  sourceLang: string,
  prevContext: string,
  legalContext: boolean = true,
  retryReason?: string,
  customTemplate?: string,
  model?: string
) => {
  const isLite = model ? isLiteModel(model) : false;
  const template = (customTemplate && customTemplate.trim().length > 0)
    ? customTemplate
    : (isLite ? LITE_TRANSLATION_PROMPT_TEMPLATE : CLAUDE_TRANSLATION_PROMPT_TEMPLATE);

  return template
    .replace('{{sourceLang}}', getArticledLanguage(sourceLang))
    .replace('{{prevContext}}', prevContext ? prevContext.slice(-4000) : 'Nessun contesto precedente.')
    .replace('{{legalContext}}', legalContext ? buildLegalText(sourceLang) : '')
    .replace('{{retryMode}}', buildRetryBlock(retryReason))
    .replace(/\n{3,}/g, '\n\n') // Rimuove righe vuote multiple consecutive
    .trim();
};

/**
 * Versione split del system prompt per abilitare il prompt caching (cache_control: ephemeral).
 * Ritorna il prefisso stabile (role/layout/instructions/formatting) e il suffisso variabile
 * (prevContext + retryMode). Il prefisso può essere cached tra più pagine della stessa sessione.
 *
 * Se viene passato un customTemplate, il prompt viene restituito per intero come `stable`
 * (con placeholder risolti): il caching funzionerà solo se il template custom non usa
 * {{prevContext}}/{{retryMode}}, altrimenti degrada silenziosamente a "no cache hit".
 */
export const getClaudeTranslateSystemPromptBlocks = (
  sourceLang: string,
  prevContext: string,
  legalContext: boolean = true,
  retryReason?: string,
  customTemplate?: string,
  model?: string
): { stable: string; variable: string } => {
  const hasCustom = !!(customTemplate && customTemplate.trim().length > 0);
  if (hasCustom) {
    return {
      stable: getClaudeTranslateSystemPrompt(sourceLang, prevContext, legalContext, retryReason, customTemplate, model),
      variable: '',
    };
  }

  const isLite = model ? isLiteModel(model) : false;
  const template = isLite ? LITE_TRANSLATION_PROMPT_TEMPLATE : CLAUDE_TRANSLATION_PROMPT_TEMPLATE;

  // Split point: tutto ciò che sta dopo questo marker è dinamico (prevContext + retryMode).
  // Il default CLAUDE usa il tag <context_previous>; il LITE usa "CONTESTO PRECEDENTE".
  const marker = isLite ? 'CONTESTO PRECEDENTE' : '<context_previous>';
  const markerIdx = template.indexOf(marker);
  if (markerIdx === -1) {
    return {
      stable: getClaudeTranslateSystemPrompt(sourceLang, prevContext, legalContext, retryReason, customTemplate, model),
      variable: '',
    };
  }

  const rawStable = template.slice(0, markerIdx);
  const rawVariable = template.slice(markerIdx);

  const stable = rawStable
    .replace('{{sourceLang}}', getArticledLanguage(sourceLang))
    .replace('{{legalContext}}', legalContext ? buildLegalText(sourceLang) : '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const variable = rawVariable
    .replace('{{prevContext}}', prevContext ? prevContext.slice(-4000) : 'Nessun contesto precedente.')
    .replace('{{retryMode}}', buildRetryBlock(retryReason))
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { stable, variable };
};

/**
 * Istruzione utente: identifica chiaramente la pagina target e le immagini di contesto.
 * Le etichette [PAGINA TARGET] e [CONTESTO ...] devono corrispondere esattamente
 * a quelle usate nei contentBlocks del service per evitare ambiguità al modello.
 */
export const getClaudeTranslateUserInstruction = (pageNumber: number, sourceLanguage: string) =>
`Traduci la pagina ${pageNumber} dal ${sourceLanguage} all'italiano.
L'immagine etichettata [PAGINA TARGET] è l'unica da tradurre. Le immagini [CONTESTO PRECEDENTE] e [CONTESTO SUCCESSIVO] sono solo riferimento visivo.
Inizia direttamente con la traduzione in italiano.`;

/**
 * Prefill vuoto per il messaggio assistant.
 */
export const getClaudeAssistantPrefill = () => '';
