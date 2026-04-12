export const buildRetryInstruction = (report: any, opts?: { preservePageSplit?: boolean }) => {
  const compact = (x: any) => String(x ?? '').replace(/\s+/g, ' ').trim();
  const clip = (s: string, maxLen: number) => (s.length > maxLen ? `${s.slice(0, Math.max(0, maxLen - 1))}…` : s);

  const summaryLine = compact(report.summary);
  const evidenceList = Array.from(
    new Set((Array.isArray(report.evidence) ? (report.evidence as any[]) : []).map(compact).filter(Boolean))
  ).slice(0, 8);
  const annotationList = Array.isArray(report.annotations)
    ? (report.annotations as any[])
      .map((a: any) => {
        const type = compact(a?.type);
        const comment = compact(a?.comment);
        const originalText = compact(a?.originalText);
        const parts = [
          type ? type.toUpperCase() : '',
          comment ? clip(comment, 220) : '',
          originalText ? `Testo: «${clip(originalText, 180)}»` : ''
        ].filter(Boolean);
        return parts.join(' — ');
      })
      .filter(Boolean)
      .slice(0, 8)
    : [];

  const issuesBlocks: string[] = [];
  if (summaryLine) issuesBlocks.push(`SINTESI:\n- ${clip(summaryLine, 260)}`);
  if (evidenceList.length > 0) issuesBlocks.push(`EVIDENZE:\n- ${evidenceList.map((e: string) => clip(e, 240)).join('\n- ')}`);
  if (annotationList.length > 0) issuesBlocks.push(`ANNOTAZIONI:\n- ${annotationList.map((e: string) => clip(e, 400)).join('\n- ')}`);
  const issuesText = issuesBlocks.length > 0 ? `\n\nPROBLEMI DA CORREGGERE (dal report di verifica):\n${issuesBlocks.join('\n')}` : '';

  const retryHint = compact(report.retryHint);
  const preservePageSplit = Boolean(opts?.preservePageSplit);
  const preservePageSplitLine = preservePageSplit
    ? '\n- Se la pagina è impaginata in due colonne, conserva il marker [[PAGE_SPLIT]] esattamente una volta, su una riga separata, tra la colonna sinistra e la colonna destra.'
    : '';
  return `${retryHint ? `${retryHint}\n\n` : ''}RITRADUCI IN MODO PIÙ ACCURATO QUESTA PAGINA, TENENDO CONTO DEI PROBLEMI SEGNALATI QUI SOTTO.
- Correggi nello specifico i problemi elencati (senza introdurre nuovi errori).
- NON OMETTERE ASSOLUTAMENTE NULLA: paragrafi centrali, testi tecnici, titoli, elenchi o note.
- Copri la pagina dall’alto verso il basso fino all’ULTIMA riga visibile (incluse intestazioni/piedipagina e note a piè di pagina).
- Se la pagina è in due colonne o ha blocchi separati, assicurati di tradurre TUTTI i blocchi in ordine (prima sinistra poi destra se necessario).
- Mantieni numerazione di sezioni e intestazioni così come nella pagina.
- Non riassumere e non comprimere: includi TUTTO il contenuto visibile.
- Se una parola/porzione è illeggibile, usa [ILLEGIBILE] invece di saltarla.
${preservePageSplitLine}
- Output SOLO in italiano, senza meta-testo.${issuesText}`.trim();
};

/**
 * Prompt per l'estrazione dei metadati PDF.
 */
export const getMetadataExtractionPrompt = (targetLanguage?: string) => `
RUOLO: Sei un bibliotecario esperto e traduttore editoriale.
OBIETTIVO: Analizza le immagini delle PRIME PAGINE di un documento (libro/paper) ed estrai i metadati principali per rinominare il file in modo professionale.

ISTRUZIONI:
- Cerca ANNO DI PUBBLICAZIONE (year). Se non presente, cerca date di copyright recenti. Es: "2023". Se non trovi nulla, usa "0000".
- Cerca AUTORE (author). Es: "Mario Rossi". Se multipli, metti il primo o "AA.VV.". Sii preciso. Se non trovi nulla, usa "Unknown".
- Cerca TITOLO (title). Es: "La Divina Commedia". 
${targetLanguage ? `- TRADUCI il titolo in ${targetLanguage} se il titolo originale è in un'altra lingua, mantenendo lo stile del libro.` : ''}
- Se il titolo è molto lungo, sintetizzalo in modo che sia significativo ma adatto a un nome file.
- Se non trovi il titolo, prova a dedurlo dal contesto delle prime pagine. Evita "Untitled" a meno che sia assolutamente impossibile trovarlo.
- Analizza TUTTE le immagini fornite per trovare queste informazioni.
- Rispondi SOLO con JSON.

SCHEMA JSON:
{
  "year": string,
  "author": string,
  "title": string
}
`;
