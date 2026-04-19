import { LITE_PROMPT_MODELS } from '../constants';

export function isLiteModel(modelId: string): boolean {
  if (!modelId) return false;
  return LITE_PROMPT_MODELS.includes(modelId);
}

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
  'AUCH', 'NOCH', 'NUR', 'ODER', 'DOCH', 'WIE', 'WAS', 'WIR', 'MAN', 'EINE', 'BIS', 'ÜBER', 'DURCH',
  'RECHT', 'GESETZ', 'KLAGE', 'FALL', 'GERICHT', 'URTEIL', 'BESTIMMUNG', 'VERFAHREN'
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
  if (!text || text.trim().length < 4) return true; // Troppo corto per giudicare (es. numeri, simboli)

  // Whitelist per meta-testi comuni (es. "Pagina vuota")
  const metaWords = ['PAGINA', 'VUOTA', 'BIANCA', 'IMMAGINE', 'FOTO', 'FIGURA', 'TABELLA'];
  const upperText = text.toUpperCase();
  if (metaWords.some(w => upperText.includes(w))) {
      return true;
  }

  const tokens = tokenizeForLangCheck(text);
  
  const itScore = wordHitScore(tokens, ITALIAN_COMMON_WORDS);
  const hasItalianAccents = /[àèéìòù]/i.test(text);
  const itBias = itScore + (hasItalianAccents ? 0.02 : 0);
  
  // Per testi molto brevi (4-25 caratteri), applichiamo il "beneficio del dubbio"
  if (text.length < 25) {
    // Se sembra già italiano (ha stopword o accenti), bene.
    if (itBias > 0) return true;

    // Se c'è una lingua sorgente, controlliamo se sembra QUELLA in modo specifico.
    if (sourceLang) {
      const s = sourceLang.toLowerCase();
      if (s.includes('tedesco') || s.includes('german')) {
        const deScore = wordHitScore(tokens, GERMAN_COMMON_WORDS);
        const hasGermanChars = /[äöüß]/i.test(text);
        const deBias = deScore + (hasGermanChars ? 0.02 : 0);
        
        // Se ha caratteristiche tedesche esplicite E nessun segnale italiano, rifiutiamo
        if (deBias > 0) return false;
      }
    }
    
    // Se non sembra né italiano né tedesco (neutro), accettiamo (beneficio del dubbio).
    // Questo salva casi come "Pagina vuota..." che non hanno stopword.
    return true;
  }

  // Soglia minima di "italianità" per testi più lunghi
  const minScore = tokens.length < 20 ? 0.01 : 0.05;
  // itBias calcolato sopra

  if (sourceLang) {
    const s = sourceLang.toLowerCase();
    if (s.includes('tedesco') || s.includes('german')) {
      const deScore = wordHitScore(tokens, GERMAN_COMMON_WORDS);
      const hasGermanChars = /[äöüß]/i.test(text);
      const deBias = deScore + (hasGermanChars ? 0.02 : 0);
      
      // Se è palesemente tedesco (>15% stopword o caratteri speciali) e l'italiano è debole, rifiutiamo.
      // Esempio: "identico parola per parola" darà deBias altissimo.
      if (deBias > 0.15 || (deBias > 0.05 && deBias > itBias * 1.2)) return false;
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

/**
 * Returns color and indicator based on model pricing.
 */
export function getModelPriceInfo(pricing?: { input: string | number; output: string | number }): { color: string; indicator: string; label: string } {
  if (!pricing) return { color: '#94a3b8', indicator: '', label: '' };
  
  let price = 0;
  if (typeof pricing.input === 'number') {
    price = pricing.input;
  } else if (typeof pricing.input === 'string') {
    const inputStr = pricing.input.replace(/[^0-9.]/g, '');
    price = parseFloat(inputStr);
  }

  if (isNaN(price) || price === 0) {
    return { color: '#22c55e', indicator: '🟢', label: 'FREE' };
  }
  
  if (price > 10) {
    return { color: '#ef4444', indicator: '🔴', label: 'PREMIUM' };
  }
  
  if (price > 2) {
    return { color: '#f59e0b', indicator: '🔸', label: 'PRO' };
  }
  
  if (price < 0.2) {
    return { color: '#3b82f6', indicator: '🔹', label: 'CHEAP' };
  }

  return { color: '#94a3b8', indicator: '', label: '' };
}
