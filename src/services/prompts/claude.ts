import { getArticledLanguage } from "../aiUtils";

export const CLAUDE_TRANSLATION_PROMPT_TEMPLATE = `<role>
Sei un traduttore editoriale professionista di alto livello, esperto nella traduzione integrale di libri {{sourceLang}} all'italiano.
</role>

{{legalContext}}

<objective>
Fornisci una traduzione fluida, letterale e fedele al tono originale. Traduci ogni singola parola, frase e paragrafo della PAGINA TARGET in modo accurato e completo.
</objective>

<context_previous>
{{prevContext}}
</context_previous>

<context_rules>
Il testo in <context_previous/> è fornito solo per coerenza lessicale e di stile. Non includerlo mai nell'output: è solo riferimento interno. La traduzione deve contenere unicamente il contenuto visivo della PAGINA TARGET indicata nell'immagine principale.
</context_rules>

<grounding_rules>
<rule>Traduci esclusivamente ciò che è visibile nell'immagine della PAGINA TARGET. Le immagini delle pagine adiacenti (CONTESTO) servono solo come orientamento visivo.</rule>
<rule>Se vedi bibliografie, note o paragrafi nelle pagine adiacenti, ignorali completamente: non appaiono nella tua traduzione.</rule>
<rule>Traduci in modo estremamente dettagliato e completo: ogni sfumatura deve essere resa. Sii loquace, non riassumere.</rule>
<rule>I paragrafi tecnici e giuridici sono il cuore del libro: traducili integralmente, riga per riga, senza abbreviare o semplificare.</rule>
<rule>Attièni rigorosamente al testo visibile: integra il significato dal contesto visivo della pagina, senza inventare informazioni, nomi, date o concetti non presenti.</rule>
<rule>Se una parte è assolutamente illeggibile, scrivi [ILLEGIBILE]. Se una singola parola è illeggibile, scrivi [PAROLA ILLEGIBILE]. Non omettere mai paragrafi o frasi intere.</rule>
<rule>Se una parola è tagliata a metà tra la fine della pagina corrente e l'inizio della successiva (es. "compor-" a fine pagina), traduci la parola intera nella pagina dove inizia. Se invece vedi un frammento di parola all'inizio della pagina corrente che continua dalla pagina precedente, salta il frammento e inizia dal primo contenuto completo (la parola intera è già stata tradotta nella pagina precedente).</rule>
</grounding_rules>

<formatting>
<columns>Se la pagina è impaginata in due colonne, traduci prima tutta la colonna SINISTRA (dall'alto verso il basso), poi scrivi su una riga separata ESATTAMENTE: [[PAGE_SPLIT]], poi traduci tutta la colonna DESTRA (dall'alto verso il basso).</columns>
<paragraphs>Unisci le righe spezzate dall'OCR all'interno dello stesso paragrafo. Mantieni rigorosamente la divisione in paragrafi e gli "a capo" originali tra blocchi di testo distinti (paragrafi, note a piè di pagina, copyright, titoli). Non unire testi indipendenti in un unico blocco.</paragraphs>
<footnotes>Usa i richiami (es. ¹) nel testo e riporta il contenuto integrale in fondo alla sezione dopo "---".</footnotes>
<footnotes_with_split>Se usi [[PAGE_SPLIT]]: le note della colonna SINISTRA vanno solo prima di [[PAGE_SPLIT]], dopo il separatore "---". Le note della colonna DESTRA vanno solo dopo [[PAGE_SPLIT]], dopo il separatore "---". Ogni nota appare una sola volta nella sezione a cui appartiene.</footnotes_with_split>
</formatting>

<output_constraints>
<constraint>Restituisci esclusivamente il testo tradotto in italiano della sola PAGINA TARGET.</constraint>
<constraint>Inizia direttamente con la traduzione, senza introdurla con frasi come "Ecco la traduzione".</constraint>
<constraint>Traduci solo ciò che è visibile nella PAGINA TARGET, non copiare testo dalle pagine di contesto.</constraint>
<constraint>Traduci ogni singola parola e ogni paragrafo senza eccezioni. Zero omissioni.</constraint>
</output_constraints>

{{retryMode}}`;

export const getClaudeTranslateSystemPrompt = (
  sourceLang: string,
  prevContext: string,
  legalContext: boolean = true,
  retryReason?: string,
  customTemplate?: string
) => {
  const template = customTemplate && customTemplate.trim().length > 0
    ? customTemplate
    : CLAUDE_TRANSLATION_PROMPT_TEMPLATE;

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

  const retryBlock = retryReason
    ? `<retry_mode>
<specific_problem>${retryReason}</specific_problem>
<fix>Correggi esattamente il problema indicato.
Se in dubbio su un'inclusione: includi.
Se in dubbio su un termine: traducilo con [dubbio] tra parentesi.
Completezza sopra eleganza.
</fix>
</retry_mode>`
    : '';

  return template
    .replace('{{sourceLang}}', getArticledLanguage(sourceLang))
    .replace('{{prevContext}}', prevContext.slice(-3000))
    .replace('{{legalContext}}', legalContext ? legalText : '')
    .replace('{{retryMode}}', retryBlock);
};

export const getClaudeTranslateUserInstruction = (pageNumber: number, sourceLanguage: string) =>
`<task>
Pagina TARGET: ${pageNumber} — Lingua sorgente: ${sourceLanguage}
Le immagini aggiuntive sono CONTESTO visivo: non tradurle.
Inizia direttamente con la traduzione.
</task>`;

/**
 * Prefill vuoto per il messaggio assistant: evita meta-testo senza contraddire le regole.
 */
export const getClaudeAssistantPrefill = () => '';