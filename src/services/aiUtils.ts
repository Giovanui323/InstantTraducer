
export const ITALIAN_COMMON_WORDS = new Set([
  'IL', 'LO', 'LA', 'I', 'GLI', 'LE', 'DI', 'A', 'DA', 'IN', 'CON', 'SU', 'PER', 'TRA', 'FRA',
  'UN', 'UNO', 'UNA', 'CHE', 'NON', 'SI', 'MA', 'ED', 'E', 'O', 'SE', 'PERCHÉ', 'QUANDO', 'DOVE',
  'QUESTO', 'QUELLO', 'MIO', 'TUO', 'SUO', 'NOSTRO', 'VOSTRO', 'LORO', 'SONO', 'EST', 'ERA', 'STATO',
  'ANCHE', 'COSÌ', 'SOLO', 'SIA', 'NON', 'NE', 'CHI', 'QUALE', 'QUANTO', 'TUTTO', 'TUTTI', 'ALTRO', 'ALTRI',
  'QUESTA', 'QUELLE', 'SULLA', 'DELLA', 'NELLA', 'ALLA', 'DALLA', 'DEI', 'DEGLI', 'DELLE'
]);

export const GERMAN_COMMON_WORDS = new Set([
  'DER', 'DIE', 'DAS', 'EIN', 'EINE', 'EINER', 'EINES', 'EINEM', 'EINEN', 'UND', 'IN', 'ZU', 'VON', 'MIT',
  'AUF', 'FÜR', 'IST', 'SIND', 'WAR', 'WIRD', 'NICHT', 'WIE', 'ABER', 'WENN', 'DASS', 'ALS', 'AN',
  'DURCH', 'BEI', 'NACH', 'VOM', 'IM', 'AM', 'UM', 'ÜBER', 'VOR', 'ZUM', 'ZUR', 'SICH', 'ICH', 'DU', 'ER',
  'SIE', 'ES', 'WIR', 'IHR', 'SIE', 'MEIN', 'DEIN', 'SEIN', 'IHR', 'UNSER', 'EUER', 'IHR',
  'AUCH', 'NOCH', 'NUR', 'ODER', 'DOCH', 'WIE', 'WAS', 'WIR'
]);

export function tokenizeForLangCheck(text: string): string[] {
  // Riconosce anche parole con accenti e apostrofi
  return text.toUpperCase().replace(/'/g, ' ').split(/[^A-ZÀ-ÖØ-öø-ÿ]+/);
}

export function wordHitScore(tokens: string[], wordSet: Set<string>): number {
  if (tokens.length === 0) return 0;
  let hits = 0;
  let count = 0;
  for (const t of tokens) {
    if (t.length < 2) continue; // Ignora lettere singole
    count++;
    if (wordSet.has(t)) hits++;
  }
  return count === 0 ? 0 : hits / count;
}

export function looksLikeItalian(text: string, sourceLang?: string): boolean {
  if (!text || text.trim().length < 10) return true; // Troppo corto per giudicare, assumiamo OK
  const tokens = tokenizeForLangCheck(text);
  
  const itScore = wordHitScore(tokens, ITALIAN_COMMON_WORDS);
  const hasItalianAccents = /[àèéìòù]/i.test(text);
  
  // Aumentiamo la soglia per testi lunghi
  const minScore = tokens.length < 20 ? 0.02 : 0.05;
  const itBias = itScore + (hasItalianAccents ? 0.02 : 0);

  if (sourceLang) {
    const s = sourceLang.toLowerCase();
    if (s.includes('tedesco') || s.includes('german')) {
      const deScore = wordHitScore(tokens, GERMAN_COMMON_WORDS);
      const hasGermanChars = /[äöüß]/i.test(text);
      const deBias = deScore + (hasGermanChars ? 0.02 : 0);
      // Se il punteggio tedesco è significativamente più alto dell'italiano, rifiutiamo
      if (deBias > 0.08 && deBias > itBias * 1.5) return false;
    }
  }
  
  return itBias >= minScore;
}

export function getArticledLanguage(lang: string): string {
  const l = lang.toLowerCase().trim();
  if (l === 'italiano') return "l'italiano";
  if (l === 'inglese') return "l'inglese";
  if (l === 'spagnolo') return "lo spagnolo";
  if (l === 'tedesco') return "il tedesco";
  if (l === 'francese') return "il francese";
  return lang;
}
