export const PAGE_RENDER_TIMEOUT_MS = 60_000;
export const AI_TRANSLATION_TIMEOUT_MS = 240_000;
export const AI_VERIFICATION_TIMEOUT_MS = 90_000;
export const VERIFICATION_CONTEXT_TIMEOUT_MS = 100_000;
export const GEMINI_FIRST_CHUNK_WARNING_MS = 210_000;
export const GEMINI_FIRST_CHUNK_TIMEOUT_MS = 240_000;
export const GEMINI_COOLDOWN_MS = 20 * 60 * 1000; // 20 minuti
export const GEMINI_TIMEOUT_COOLDOWN_MS = 60 * 1000; // 1 minuto (timeout transitori)
export const AUTO_PREFETCH_PAGES_AHEAD = 5;
export const DEFAULT_CONCURRENT_TRANSLATIONS = 2;
export const MAX_ALLOWED_CONCURRENCY = 4;
export const ORIGINAL_THUMB_SCALE = 1.35;
export const ORIGINAL_THUMB_JPEG_QUALITY = 0.72;
export const PAGE_CACHE_JPEG_QUALITY = 0.88; // Was 0.74 - Increased to prevent "Punitive Compression" on retry
export const PAGE_CACHE_MAX_EDGE = 2500; // Was 1600 - Increased to support A4 @ 300dpi better

export const GEMINI_TRANSLATION_MODEL = 'gemini-3.1-pro-preview';
export const GEMINI_TRANSLATION_FAST_MODEL = 'gemini-3-flash-preview';
export const GEMINI_TRANSLATION_FALLBACK_MODEL = 'gemini-2.5-flash';
export const GEMINI_TRANSLATION_FLASH_MODEL = 'gemini-3.1-flash-lite-preview';
export const GEMINI_VERIFIER_PRO_MODEL = 'gemini-3.1-pro-preview';
export const GEMINI_VERIFIER_MODEL = 'gemini-3-flash-preview';
export const GEMINI_VERIFIER_FALLBACK_MODEL = 'gemini-2.5-flash-lite';

export interface ModelInfo {
    id: string;
    name: string;
    category?: 'pro' | 'flash' | 'standard' | 'mini';
    pricing?: { input: string; output: string };
    features?: string;
}

export const GEMINI_MODELS_LIST: ModelInfo[] = [
    { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro (Preview)', category: 'pro', pricing: { input: '$2.00', output: '$12.00' }, features: 'Massima intelligenza e ragionamento' },
    { id: 'gemini-3.1-flash-preview', name: 'Gemini 3.1 Flash (Preview)', category: 'flash', pricing: { input: '$0.50', output: '$3.00' }, features: 'Veloce e intelligente' },
    { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash (Preview)', category: 'flash', pricing: { input: '$0.50', output: '$3.00' }, features: 'Bilanciato e veloce' },
    { id: 'gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash-Lite (Preview)', category: 'flash', pricing: { input: '$0.25', output: '$1.50' }, features: 'Ultra veloce ed economico' },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', category: 'pro', pricing: { input: '$2.00', output: '$12.00' }, features: 'Intelligenza avanzata, stabile' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', category: 'flash', pricing: { input: '$0.15', output: '$0.60' }, features: 'Veloce, bilanciato' },
    { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite', category: 'flash', pricing: { input: '$0.075', output: '$0.30' }, features: 'Ultra veloce, super economico' }
];

export const OPENAI_MODELS_LIST: ModelInfo[] = [
    { id: 'gpt-4o', name: 'GPT-4o', category: 'pro', pricing: { input: '$5', output: '$15' }, features: 'Modello standard' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', category: 'mini', pricing: { input: '$0.15', output: '$0.60' }, features: 'Modello veloce ed economico' },
    { id: 'o1-preview', name: 'o1 Preview (Reasoning)', category: 'pro', pricing: { input: '$15', output: '$60' }, features: 'Modello ragionamento avanzato' },
    { id: 'o1-mini', name: 'o1 Mini (Reasoning)', category: 'mini', pricing: { input: '$3', output: '$12' }, features: 'Modello ragionamento veloce' },
    { id: 'o3-mini', name: 'o3 Mini', category: 'mini', pricing: { input: '$2', output: '$10' }, features: 'Modello più recente' }
];

export const CLAUDE_MODELS_LIST: ModelInfo[] = [
    { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6 (Latest)', pricing: { input: '$3', output: '$15' }, features: '1M tokens, the best combination of speed and intelligence' },
    { id: 'claude-opus-4-6', name: 'Claude Opus 4.6 (Latest)', pricing: { input: '$5', output: '$25' }, features: '1M tokens, most intelligent broadly available' },
    { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', pricing: { input: '$1', output: '$5' }, features: '200k tokens, fastest model with near-frontier intelligence' },
    { id: 'claude-opus-4-5-20251101', name: 'Claude Opus 4.5', pricing: { input: '$5', output: '$25' }, features: 'Intelligenza estrema' },
    { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5', pricing: { input: '$3', output: '$15' }, features: 'Bilanciato' }
];

export const GROQ_MODELS_LIST: ModelInfo[] = [
    { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant', category: 'flash', pricing: { input: '$0.05', output: '$0.08' }, features: 'Ultra-veloce' },
    { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B (Versatile)', category: 'pro', pricing: { input: '$0.59', output: '$0.79' }, features: 'Ottimo per verifica qualità' },
    { id: 'meta-llama/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout 17B 👁️ (Vision)', category: 'pro', pricing: { input: '$0.11', output: '$0.34' }, features: 'Supporta immagini - ideale per traduzione' },
    { id: 'qwen/qwen3-32b', name: 'Qwen3 32B (via Groq)', category: 'pro', pricing: { input: '$0.15', output: '$0.30' }, features: 'Nuovo modello Qwen3' },
    { id: 'deepseek-r1-distill-llama-70b', name: 'DeepSeek R1 Distill Llama 70B', category: 'pro', pricing: { input: '$0.59', output: '$0.79' }, features: 'Modello reasoning avanzato' }
];

export const availableGeminiModels = GEMINI_MODELS_LIST;
export const availableClaudeModels = CLAUDE_MODELS_LIST;
export const isGroqVisionModel = (modelId: string) => {
    return modelId.includes('vision') || modelId.includes('scout') || modelId.includes('llama-4');
};

export const DEFAULT_TRANSLATION_PROMPT_TEMPLATE = `RUOLO: Sei un traduttore editoriale professionista di alto livello, esperto nella traduzione integrale di libri {{sourceLang}} all'ITALIANO.
{{legalContext}}
OBIETTIVO: Fornire una traduzione fluida, letterale e fedele al tono originale, garantendo che OGNI SINGOLA PAROLA, OGNI FRASE e OGNI PARAGRAFO della PAGINA TARGET siano resi accuratamente.

CONTESTO PRECEDENTE (solo per coerenza lessicale e di stile — NON tradurre):
"""
{{prevContext}}
"""
⚠️ REGOLA CRITICA SUL CONTESTO: Il testo sopra è SOLO di riferimento per mantenere la continuità. NON includerlo, NON aggiungerlo e NON copiarlo nel tuo output. La traduzione deve contenere UNICAMENTE il contenuto VISIVO della PAGINA TARGET indicata nell'immagine principale.

REGOLE DI GROUNDING E ACCURATEZZA:
- Sei un assistente rigorosamente ancorato (strictly grounded assistant) limitato esclusivamente alle informazioni VISIBILI nell'immagine della PAGINA TARGET.
- Tratta solo le immagini contrassegnate come PAGINA TARGET come la fonte da tradurre. Le immagini delle pagine adiacenti (CONTESTO) sono SOLO per orientamento visivo.
- GROUNDING STRETTO: Non aggiungere MAI testo proveniente dalle immagini di contesto nella tua traduzione. Se vedi bibliografie, note, paragrafi nelle pagine adiacenti, IGNORALI completamente.
- In quanto traduttore editoriale, devi essere estremamente loquace e dettagliato: NON riassumere mai e non cercare l'efficienza a scapito della completezza. Ogni sfumatura deve essere tradotta.
- ATTENZIONE AI PARAGRAFI TECNICI E GIURIDICI: Le descrizioni di procedure, concetti giuridici complessi, spiegazioni pratiche o storiche sono il CUORE del libro. È TASSATIVAMENTE VIETATO saltarle, abbreviarle o semplificarle. Ogni passaggio logico deve essere reso integralmente. Se vedi un paragrafo denso di testo, traducilo con estrema attenzione per non perdere nemmeno una riga.
- NON introdurre o inventare mai informazioni, nomi, date o concetti non presenti NEL TESTO VISIBILE DELLA PAGINA TARGET. NON completare frasi tronche basandoti sulla tua conoscenza del mondo.
- Se una parte è assolutamente illeggibile, scrivi [ILLEGIBILE], ma non omettere mai paragrafi interi.
- Se una parola è assolutamente illeggibile, scrivi [PAROLA ILLEGIBILE], ma non omettere mai parole o frasi.
- Basati rigorosamente sulla logica e sul testo visibile per le tue deduzioni linguistiche.

STRUTTURA E FORMATTAZIONE:
- Rispetta l'ordine e la struttura della pagina originale (paragrafi, titoli, note).
- Se la pagina è impaginata in DUE COLONNE, traduci prima tutta la colonna SINISTRA (dall'alto verso il basso), poi scrivi su una riga separata ESATTAMENTE: [[PAGE_SPLIT]] e poi traduci tutta la colonna DESTRA (dall'alto verso il basso). Non ripetere il marker e non invertirne l'ordine.
- Unisci le righe spezzate dall'OCR ALL'INTERNO dello stesso paragrafo, ma MANTIENI RIGOROSAMENTE la divisione in paragrafi e gli "a capo" (newlines) originali tra blocchi di test distinti (es. paragrafi, note a piè di pagina, testi di copyright, titoli). NON unire testi indipendenti in un unico grande blocco.
- NOTE: Usa i richiami (es. ¹) nel testo e riporta il contenuto integrale in fondo alla sezione dopo "---".
- NOTE CON [[PAGE_SPLIT]]: Se la pagina contiene due colonne/due pagine affiancate e quindi usi [[PAGE_SPLIT]], segui queste regole RIGIDE:
  1. Le note della colonna SINISTRA vanno SOLO prima di [[PAGE_SPLIT]], dopo il separatore "---" della colonna sinistra.
  2. Le note della colonna DESTRA vanno SOLO dopo [[PAGE_SPLIT]], dopo il separatore "---" della colonna destra.
  3. ⚠️ NON DUPLICARE MAI le note: ogni nota deve apparire UNA SOLA VOLTA, nella sezione (sinistra o destra) a cui appartiene. Se una nota è già stata scritta nella colonna sinistra, NON ripeterla nella colonna destra.

VINCOLI FINALI:
- Restituisci esclusivamente il testo tradotto in italiano DELLA SOLA PAGINA TARGET.
- NON includerle meta-testo (es. "Ecco la traduzione").
- NON COPIARE testo proveniente dalle immagini di contesto (pagine adiacenti): traduci SOLO ciò che è visibile nella PAGINA TARGET.
- È FONDAMENTALE TRADURRE OGNI SINGOLA PAROLA E OGNI PARAGRAFO SENZA ECCEZIONI.

{{retryMode}}`;
