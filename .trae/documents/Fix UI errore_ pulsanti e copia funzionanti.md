**Obiettivo**
- Rendere l’overlay di errore più chiaro, con testo selezionabile, e assicurare che entrambi i pulsanti (grande e piccolo) funzionino.

**Diagnosi Rapida**
- I pulsanti "Copia" usano navigator.clipboard.writeText; in Electron può fallire senza feedback. Riferimenti: [ReaderView.tsx:L671-L677](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/components/ReaderView.tsx#L671-L677), [ReaderView.tsx:L686-L692](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/components/ReaderView.tsx#L686-L692).
- Il banner "Riprova … pagine con errori" ha un solo onClick sul bottone principale; l’icona piccola è contenuta nello stesso bottone. Riferimento: [ReaderView.tsx:L814-L828](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/components/ReaderView.tsx#L814-L828).
- I callback di retry sono già implementati: per pagina [App.tsx:L1297-L1628](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/App.tsx#L1297-L1628) e retry-all [App.tsx:L2746-L2794](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/App.tsx#L2746-L2794).

**Modifiche Proposte**
- Copia affidabile con fallback e feedback:
  - Aggiungere in preload l’esposizione della clipboard Electron: [preload.cjs](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/electron/preload.cjs) espone electronAPI.clipboard.writeText.
  - Creare util "safeCopy" (es. src/utils/clipboard.ts) che prova in ordine: navigator.clipboard → electronAPI.clipboard → execCommand, restituendo boolean.
  - Usare safeCopy in tutti i punti "Copia" e mostrare feedback UI: cambio testo in "Copiato" per 1.5s (senza librerie esterne) e aria-live.
  - Sostituire le chiamate dirette in: [ReaderView.tsx:L650-L657](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/components/ReaderView.tsx#L650-L657), [ReaderView.tsx:L671-L677](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/components/ReaderView.tsx#L671-L677), [ReaderView.tsx:L686-L692](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/components/ReaderView.tsx#L686-L692) e nel copy da App quando presente.
- Pulsanti di retry realmente cliccabili:
  - Separare l’icona piccola in un secondo <button> con onClick=onRetryAllCritical, aria-label e focus ring.
  - Alzare z-index del banner a 200 e aggiungere pointer-events-auto per sicurezza. Modifica blocco: [ReaderView.tsx:L814-L828](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/components/ReaderView.tsx#L814-L828).
  - Stato di caricamento: disabilitare i pulsanti mentre si esegue retry-all e mostrare spinner sull’icona.
- Selezionabilità del testo:
  - È già attiva su errore e log (classi select-text) in [ReaderView.tsx:L679](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/components/ReaderView.tsx#L679) e [ReaderView.tsx:L684](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/components/ReaderView.tsx#L684); estenderla anche al contenitore titolo per coerenza.
- Pulizia grafica dell’overlay di errore:
  - Titolo compatto, blocco errore con sfondo leggero, log in pannello scrollabile, layout pulsanti in una riga. Non cambiamo i colori, solo spacing/gerarchie per leggibilità.

**Esempi di Implementazione (estratto)**

```ts
// electron/preload.cjs
const { contextBridge, ipcRenderer, clipboard } = require('electron');
contextBridge.exposeInMainWorld('electronAPI', {
  // ...esistente,
  clipboard: { writeText: (t) => clipboard.writeText(t) }
});
```

```ts
// src/utils/clipboard.ts
export async function safeCopy(text: string): Promise<boolean> {
  try { if (navigator?.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; } } catch {}
  try { const api: any = (window as any).electronAPI; if (api?.clipboard?.writeText) { api.clipboard.writeText(text); return true; } } catch {}
  try {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta);
    ta.select(); document.execCommand('copy'); document.body.removeChild(ta); return true;
  } catch {}
  return false;
}
```

```tsx
// ReaderView.tsx (uso)
const [copiedErr, setCopiedErr] = useState(false);
<button onClick={async () => { if (await safeCopy(loadingStatus?.[p] || 'Errore durante la traduzione.')) { setCopiedErr(true); setTimeout(() => setCopiedErr(false), 1500); } }}>
  <Copy size={10} /> {copiedErr ? 'Copiato' : 'Copia'}
</button>
```

```tsx
// Banner retry-all separato
<div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[200]">
  <div className="flex items-center gap-2 pointer-events-auto">
    <button onClick={onRetryAllCritical} className="px-6 py-3 bg-red-600 text-white rounded-full">Riprova {criticalErrorsCount} pagine con errori</button>
    <button onClick={onRetryAllCritical} aria-label="Riprova tutte" className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
      <RotateCw size={16} className="text-white" />
    </button>
  </div>
</div>
```

**Verifica**
- Avvio app in dev, riprodurre un errore e testare:
  - Clic su "Copia" (errore e log): testo copiato, feedback visivo.
  - Clic sul pulsante piccolo della CTA in basso: esegue onRetryAllCritical e mostra spinner.
  - Clic su "Ricarica Pagina": esegue onRetry per la pagina.
  - Selezionare con mouse l’errore e i log: il testo risulta selezionabile.

**File Interessati**
- [ReaderView.tsx](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/components/ReaderView.tsx)
- [App.tsx](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/App.tsx) (solo se servisse stato di loading per retry-all)
- [electron/preload.cjs](file:///Users/lucasicignano/Desktop/UNIVERSITA/FIVER/gemini-pdf-translator-di-libri-2/electron/preload.cjs)
- Nuovo: src/utils/clipboard.ts

Confermi che procedo con queste modifiche?