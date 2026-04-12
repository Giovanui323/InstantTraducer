/**
 * Utility per la sicurezza e la sanitizzazione del contenuto.
 */

/**
 * Sanitizza una stringa rimuovendo potenziali tag HTML pericolosi.
 * Nota: Poiché usiamo React, la maggior parte del testo è già protetta dall'XSS.
 * Questa funzione serve come ulteriore livello di protezione per input grezzi.
 */
export function sanitizeHTML(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Valida un oggetto di stile per assicurarsi che non contenga proprietà pericolose.
 */
export function validateStyles(styles: Record<string, any>): Record<string, any> {
  const safeStyles: Record<string, any> = {};
  const dangerousProperties = ['behavior', 'expression', 'moz-binding'];

  for (const [key, value] of Object.entries(styles)) {
    if (!dangerousProperties.includes(key.toLowerCase())) {
      safeStyles[key] = value;
    }
  }
  return safeStyles;
}

/**
 * Valida un range di selezione.
 */
export function validateSelectionRange(start: number, end: number, maxLength: number): boolean {
  return (
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    start >= 0 &&
    end >= start &&
    start <= maxLength &&
    end <= maxLength
  );
}
