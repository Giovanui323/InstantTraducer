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

export const MODAL_MODELS_LIST: ModelInfo[] = [
    { id: 'zai-org/GLM-5.1-FP8', name: 'GLM-5.1 FP8 (Modal)', category: 'pro', pricing: { input: '$0.00', output: '$0.00' }, features: 'Modal GPU inference - 1 richiesta alla volta' }
];

export const ZAI_MODELS_LIST: ModelInfo[] = [
    { id: 'glm-5.1', name: 'GLM-5.1 (Flagship)', category: 'pro', pricing: { input: '$0.10', output: '$0.10' }, features: 'Flagship agentic model - SWE-Bench Pro: 58.4' },
    { id: 'glm-4v-plus', name: 'GLM-4V Plus (Vision)', category: 'pro', pricing: { input: '$0.075', output: '$0.075' }, features: 'Vision avanzata Z.ai' },
    { id: 'glm-4v-flash', name: 'GLM-4V Flash (Vision)', category: 'flash', pricing: { input: '$0.01', output: '$0.01' }, features: 'Vision veloce ed economica' },
    { id: 'glm-4-plus', name: 'GLM-4 Plus', category: 'pro', pricing: { input: '$0.075', output: '$0.075' }, features: 'Modello top Z.ai' },
    { id: 'glm-4-flash', name: 'GLM-4 Flash', category: 'flash', pricing: { input: '$0.01', output: '$0.01' }, features: 'Veloce ed economico' },
    { id: 'glm-4-air', name: 'GLM-4 Air', category: 'standard', pricing: { input: '$0.015', output: '$0.015' }, features: 'Bilanciato' }
];

export const availableGeminiModels = GEMINI_MODELS_LIST;
export const availableClaudeModels = CLAUDE_MODELS_LIST;
export const isGroqVisionModel = (modelId: string) => {
    return modelId.includes('vision') || modelId.includes('scout') || modelId.includes('llama-4');
};

export const OPENROUTER_TRANSLATION_MODEL = 'anthropic/claude-sonnet-4.5';

export const OPENROUTER_MODELS_LIST: ModelInfo[] = [
    { id: 'openrouter/auto', name: 'Auto Router (Ottimizzato)', category: 'pro', pricing: { input: 'Auto', output: 'Auto' }, features: 'OpenRouter instrada automaticamente al modello migliore/più efficiente' },
    { id: 'openrouter/elephant-alpha', name: 'Elephant Alpha (Free)', category: 'pro', pricing: { input: '$0', output: '$0' }, features: '100B parametri, 256K contesto, ragionamento efficiente — GRATIS' },
    { id: 'anthropic/claude-opus-4.6-fast', name: 'Claude Opus 4.6 Fast (OpenRouter)', category: 'pro', pricing: { input: '$30', output: '$150' }, features: '1M contesto, modalità veloce, massima intelligenza' },
    { id: 'anthropic/claude-opus-4.6', name: 'Claude Opus 4.6 (OpenRouter)', category: 'pro', pricing: { input: '$5', output: '$25' }, features: '1M contesto, ottima combinazione di intelligenza e costi' },
    { id: 'anthropic/claude-sonnet-4.5', name: 'Claude Sonnet 4.5 (OpenRouter)', category: 'pro', pricing: { input: '$3', output: '$15' }, features: '1M contesto, agenti avanzati, coding' },
    { id: 'anthropic/claude-haiku-4.5', name: 'Claude Haiku 4.5 (OpenRouter)', category: 'flash', pricing: { input: '$1', output: '$5' }, features: '200K contesto, veloce e intelligente' },
    { id: 'google/gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash Lite (OpenRouter)', category: 'flash', pricing: { input: '$0.25', output: '$1.50' }, features: '1M contesto, ultra-economico, traduzione forte' },
    { id: 'qwen/qwen3.6-plus', name: 'Qwen 3.6 Plus (OpenRouter)', category: 'pro', pricing: { input: '$0.325', output: '$1.95' }, features: '1M contesto, coding avanzato, ragionamento' },
    { id: 'z-ai/glm-5.1', name: 'GLM 5.1 (OpenRouter)', category: 'pro', pricing: { input: '$0.95', output: '$3.15' }, features: '203K contesto, coding lungo termine, agenti' },
    { id: 'z-ai/glm-5v-turbo', name: 'GLM 5V Turbo (OpenRouter)', category: 'pro', pricing: { input: '$1.20', output: '$4' }, features: '203K contesto, inferenza veloce, agenti, vision' },
    { id: 'x-ai/grok-4.20-multi-agent', name: 'Grok 4.20 Multi-Agent (OpenRouter)', category: 'pro', pricing: { input: '$2.00', output: '$6.00' }, features: '2M contesto, multi-agent reasoning, deep research' },
    { id: 'xiaomi/mimo-v2-flash', name: 'MiMo V2 Flash (OpenRouter)', category: 'flash', pricing: { input: '$0.09', output: '$0.29' }, features: '262K contesto, top open-source, ragionamento — economico' },
    
    // Nuovi Modelli Aggiunti
    { id: 'xiaomi/mimo-v2-omni', name: 'MiMo V2 Omni (OpenRouter)', category: 'pro', pricing: { input: '$0.40', output: '$2.00' }, features: '262K contesto, omni-modal, reasoning' },
    { id: 'xiaomi/mimo-v2-pro', name: 'MiMo V2 Pro (OpenRouter)', category: 'pro', pricing: { input: '$1.00', output: '$3.00' }, features: '1.05M contesto, ottimizzato per agenti e workflow' },
    { id: 'minimax/minimax-m2.7', name: 'MiniMax M2.7 (OpenRouter)', category: 'pro', pricing: { input: '$0.30', output: '$1.20' }, features: '197K contesto, autonomous workflows' },
    { id: 'openai/gpt-5.4-nano', name: 'GPT-5.4 Nano (OpenRouter)', category: 'mini', pricing: { input: '$0.20', output: '$1.25' }, features: '400K contesto, lightweight & low-latency' },
    { id: 'openai/gpt-5.4-mini', name: 'GPT-5.4 Mini (OpenRouter)', category: 'mini', pricing: { input: '$0.75', output: '$4.50' }, features: '400K contesto, veloce e scalabile' },
    { id: 'mistralai/mistral-small-4', name: 'Mistral Small 4 (OpenRouter)', category: 'flash', pricing: { input: '$0.15', output: '$0.60' }, features: '262K contesto, strong reasoning & multimodality' },
    { id: 'nvidia/nemotron-3-super-120b-a12b:free', name: 'NVIDIA: Nemotron 3 Super (free)', category: 'pro', pricing: { input: '$0.00', output: '$0.00' }, features: '262K contesto, MoE 120B (12B attivi), 1M window — GRATIS' },
    { id: 'nvidia/nemotron-3-super:free', name: 'Nemotron 3 Super - Free (OpenRouter)', category: 'pro', pricing: { input: '$0.00', output: '$0.00' }, features: '262K contesto, hybrid MoE architecture — GRATIS' },
    { id: 'nvidia/nemotron-3-super', name: 'Nemotron 3 Super (OpenRouter)', category: 'pro', pricing: { input: '$0.10', output: '$0.50' }, features: '262K contesto, compute efficiency e agentic coherence' },
    { id: 'bytedance-seed/seed-2.0-lite', name: 'Seed-2.0-Lite (OpenRouter)', category: 'flash', pricing: { input: '$0.25', output: '$2.00' }, features: '262K contesto, velocità e agentic capabilities' },
    { id: 'qwen/qwen3.5-9b', name: 'Qwen3.5-9B (OpenRouter)', category: 'flash', pricing: { input: '$0.05', output: '$0.15' }, features: '256K contesto, efficient reasoning' },
    { id: 'openai/gpt-5.4-pro', name: 'GPT-5.4 Pro (OpenRouter)', category: 'pro', pricing: { input: '$30.00', output: '$180.00' }, features: '1.05M contesto, problem solving estremo' },
    { id: 'openai/gpt-5.4', name: 'GPT-5.4 (OpenRouter)', category: 'pro', pricing: { input: '$2.50', output: '$15.00' }, features: '1.05M contesto, reasoning & agentic coding' }
];

export const availableOpenRouterModels = OPENROUTER_MODELS_LIST;

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
