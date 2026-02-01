## Aggiunta Bandiere Lingua nella Home

L'obiettivo è visualizzare una piccola bandiera rappresentante la lingua d'origine accanto a ogni file nella home page (sia per la sessione attiva che per i libri recenti).

### Implementazione Tecnica:

1.  **Nuova Utility per le Lingue**:
    *   Creazione di `src/utils/languageUtils.ts` contenente una funzione `getLanguageFlag(lang?: string)` che mappa i nomi delle lingue in italiano (es. 'inglese', 'francese') ai rispettivi emoji delle bandiere (🇬🇧, 🇫🇷, ecc.).

2.  **Aggiornamento di HomeView**:
    *   Modifica di `src/components/HomeView.tsx` per accettare la prop `docInputLanguage` (lingua della sessione corrente).
    *   Utilizzo di `getLanguageFlag` nella sezione "Sessione attiva" accanto al titolo del libro.
    *   Utilizzo di `getLanguageFlag(book.inputLanguage)` nella lista dei libri "Recenti" accanto al nome del file.
    *   Stile: la bandiera sarà piccola, con un leggero margine per separarla dal testo.

3.  **Integrazione in App**:
    *   Modifica di `src/App.tsx` per passare lo stato `docInputLanguage` al componente `HomeView`.

### Mapping Lingue previsto:
*   Inglese: 🇬🇧
*   Francese: 🇫🇷
*   Spagnolo: 🇪🇸
*   Tedesco: 🇩🇪
*   Portoghese: 🇵🇹
*   Russo: 🇷🇺
*   Cinese: 🇨🇳
*   Giapponese: 🇯🇵
*   Olandese: 🇳🇱
*   Polacco: 🇵🇱
*   Greco: 🇬🇷
*   Latino: 🏛️
*   Italiano: 🇮🇹
*   Default: 🏳️

Vuoi procedere con queste modifiche?