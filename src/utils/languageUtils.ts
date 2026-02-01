
/**
 * Mappa i nomi delle lingue (in italiano) ai rispettivi emoji delle bandiere.
 * @param lang Il nome della lingua (es. 'inglese', 'francese')
 * @returns L'emoji della bandiera o una bandiera bianca di default
 */
export const getLanguageFlag = (lang?: string): string => {
  if (!lang) return '🏳️';
  
  const l = lang.toLowerCase().trim();
  
  const flags: Record<string, string> = {
    'inglese': '🇬🇧',
    'francese': '🇫🇷',
    'spagnolo': '🇪🇸',
    'tedesco': '🇩🇪',
    'portoghese': '🇵🇹',
    'russo': '🇷🇺',
    'cinese': '🇨🇳',
    'giapponese': '🇯🇵',
    'olandese': '🇳🇱',
    'polacco': '🇵🇱',
    'greco': '🇬🇷',
    'rumeno': '🇷🇴',
    'bulgaro': '🇧🇬',
    'ucraino': '🇺🇦',
    'arabo': '🇸🇦',
    'coreano': '🇰🇷',
    'turco': '🇹🇷',
    'ceco': '🇨🇿',
    'svedese': '🇸🇪',
    'danese': '🇩🇰',
    'finlandese': '🇫🇮',
    'norvegese': '🇳🇴',
    'ungherese': '🇭🇺',
    'latino': '🏛️',
    'italiano': '🇮🇹'
  };

  return flags[l] || '🏳️';
};
