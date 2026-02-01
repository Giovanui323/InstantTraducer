# Risoluzione dello spostamento delle parole durante la ricerca

## Problema Riscontrato
Le parole nel reader si spostano durante la ricerca perché l'evidenziatore aggiunge del padding orizzontale (`px-[2px]`) ai termini trovati. In un testo giustificato, questo altera la larghezza delle parole e costringe il browser a ricalcolare l'intera riga, causando spostamenti fastidiosi.

## Interventi Proposti

### 1. Modifica del componente MarkdownText
*   **File**: `src/components/MarkdownText.tsx`
*   **Azione**: Rimuovere `px-[2px]` e `rounded` dalle classi del tag `<mark>` nella funzione `renderPart`.
*   **Risultato**: L'evidenziazione sarà puramente cromatica (sfondo giallo) senza aggiungere larghezza extra alle parole.

### 2. Rafforzamento della logica di matching
*   **Azione**: Sostituire `re.test(c)` con una verifica più sicura basata sull'indice del frammento (poiché usiamo i gruppi di cattura in `split`, i match sono sempre agli indici dispari) o un confronto testuale case-insensitive. Questo evita bug legati allo stato interno della regex globale.

## Verifica
*   Il testo non dovrebbe subire alcun micro-spostamento o ricalcolo del layout quando si digita nella barra di ricerca.
*   L'evidenziazione rimarrà visibile e chiara ma perfettamente allineata al testo originale.

Desideri che proceda con l'implementazione di queste modifiche?