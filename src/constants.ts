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
export const AI_IMAGE_MAX_LONG_SIDE = 1568; // Max long side for images sent to AI APIs (pre-4.7 Claude limit, best token efficiency)
export const AI_IMAGE_JPEG_QUALITY = 0.85; // JPEG quality for AI-bound images (balances file size vs OCR readability)

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
];

export const CLAUDE_MODELS_LIST: ModelInfo[] = [
    { id: 'claude-opus-4-7', name: 'Claude Opus 4.7 (Flagship)', pricing: { input: '$5', output: '$25' }, features: '1M tokens, flagship Anthropic model (Apr 2026), nuovo tokenizer' },
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

export const OPENROUTER_TRANSLATION_MODEL = 'google/gemma-4-26b-a4b-it:free';

export const OPENROUTER_MODELS_LIST: ModelInfo[] = [
    { id: 'openrouter/auto', name: 'Auto Router (Ottimizzato)', category: 'pro', pricing: { input: 'Auto', output: 'Auto' }, features: 'OpenRouter instrada automaticamente al modello migliore/più efficiente' },
    { id: 'anthropic/claude-opus-4.7', name: 'Claude Opus 4.7 (OpenRouter)', category: 'pro', pricing: { input: '$5', output: '$25' }, features: '1M contesto, flagship Anthropic, nuovo tokenizer, safeguards cyber' },
    { id: 'anthropic/claude-opus-4.6-fast', name: 'Claude Opus 4.6 Fast (OpenRouter)', category: 'pro', pricing: { input: '$30', output: '$150' }, features: '1M contesto, modalità veloce, massima intelligenza' },
    { id: 'anthropic/claude-opus-4.6', name: 'Claude Opus 4.6 (OpenRouter)', category: 'pro', pricing: { input: '$5', output: '$25' }, features: '1M contesto, ottima combinazione di intelligenza e costi' },
    { id: 'anthropic/claude-sonnet-4.5', name: 'Claude Sonnet 4.5 (OpenRouter)', category: 'pro', pricing: { input: '$3', output: '$15' }, features: '1M contesto, agenti avanzati, coding' },
    { id: 'anthropic/claude-haiku-4.5', name: 'Claude Haiku 4.5 (OpenRouter)', category: 'flash', pricing: { input: '$1', output: '$5' }, features: '200K contesto, veloce e intelligente' },
    { id: 'google/gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash Lite (OpenRouter)', category: 'flash', pricing: { input: '$0.25', output: '$1.50' }, features: '1M contesto, ultra-economico, traduzione forte' },
    { id: 'qwen/qwen3.6-plus', name: 'Qwen 3.6 Plus (OpenRouter)', category: 'pro', pricing: { input: '$0.325', output: '$1.95' }, features: '1M contesto, coding avanzato, ragionamento' },
    { id: 'z-ai/glm-5.1', name: 'Z.ai: GLM 5.1', category: 'pro', pricing: { input: '$0.95', output: '$3.15' }, features: '203K contesto, coding avanzato (8h+), agentic planning, SWE-Bench Pro: 58.4' },
    { id: 'z-ai/glm-5v-turbo', name: 'GLM 5V Turbo (OpenRouter)', category: 'pro', pricing: { input: '$1.20', output: '$4' }, features: '203K contesto, inferenza veloce, agenti, vision' },
    { id: 'x-ai/grok-4.20-multi-agent', name: 'Grok 4.20 Multi-Agent (OpenRouter)', category: 'pro', pricing: { input: '$2.00', output: '$6.00' }, features: '2M contesto, multi-agent reasoning, deep research' },
    { id: 'xiaomi/mimo-v2-flash', name: 'MiMo V2 Flash (OpenRouter)', category: 'flash', pricing: { input: '$0.09', output: '$0.29' }, features: '262K contesto, top open-source, ragionamento — economico' },
    
    // --- MODELLI FREE (OPENROUTER) ---
    { id: 'z-ai/glm-4.5-air:free', name: 'Z.ai: GLM 4.5 Air 👁️ (FREE)', category: 'flash', pricing: { input: '$0.00', output: '$0.00' }, features: '131K contesto, lightweight variant, agent-centric, reasoning mode' },
    { id: 'inclusionai/ling-2.6-flash:free', name: 'InclusionAI: Ling 2.6 Flash 👁️ (FREE)', category: 'flash', pricing: { input: '$0.00', output: '$0.00' }, features: '262K contesto, 104B MoE, ultra-veloce, eccellente per agenti' },
    { id: 'nvidia/nemotron-nano-12b-2-vl:free', name: 'NVIDIA: Nemotron Nano 12B 2 VL 👁️ (FREE)', category: 'flash', pricing: { input: '$0.00', output: '$0.00' }, features: '128K contesto, Hybrid Transformer-Mamba, top OCR/documenti' },
    { id: 'google/gemma-4-31b:free', name: 'Google: Gemma 4 31B 👁️ (FREE)', category: 'pro', pricing: { input: '$0.00', output: '$0.00' }, features: '262K contesto, dense multimodal, 140+ lingue, coding/reasoning' },
    { id: 'google/gemma-4-26b-a4b:free', name: 'Google: Gemma 4 26B A4B 👁️ (FREE)', category: 'flash', pricing: { input: '$0.00', output: '$0.00' }, features: '262K contesto, MoE 25B (3.8B attivi), alta qualità/basso costo' },
    { id: 'openai/gpt-oss-20b:free', name: 'OpenAI: GPT-OSS 20B 👁️ (FREE)', category: 'standard', pricing: { input: '$0.00', output: '$0.00' }, features: '131K contesto, MoE 21B, bassa latenza, agentic capabilities' },
    { id: 'qwen/qwen3-coder-480b-a35b:free', name: 'Qwen: Qwen3 Coder 480B 👁️ (FREE)', category: 'pro', pricing: { input: '$0.00', output: '$0.00' }, features: '262K contesto, MoE 480B (35B attivi), ottimizzato coding/agenti' },
    { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B 👁️ (FREE)', category: 'pro', pricing: { input: '$0.00', output: '$0.00' }, features: '66K contesto, solido per compiti generali e traduzione' },
    { id: 'qwen/qwen3-next-80b-a3b-instruct:free', name: 'Qwen3 Next 80B 👁️ (FREE)', category: 'pro', pricing: { input: '$0.00', output: '$0.00' }, features: '262K contesto, MoE 80B (3B attivi), alta velocità e stabilità' },
    { id: 'liquid/lfm2.5-1.2b-thinking:free', name: 'LiquidAI: LFM 2.5 1.2B Thinking 👁️ (FREE)', category: 'mini', pricing: { input: '$0.00', output: '$0.00' }, features: '33K contesto, reasoning su edge, ottimo per estrazione dati' },
    { id: 'liquid/lfm2.5-1.2b-instruct:free', name: 'LiquidAI: LFM 2.5 1.2B Instruct 👁️ (FREE)', category: 'mini', pricing: { input: '$0.00', output: '$0.00' }, features: '33K contesto, compatto e velocissimo' },
    { id: 'google/gemma-3-27b:free', name: 'Google: Gemma 3 27B 👁️ (FREE)', category: 'pro', pricing: { input: '$0.00', output: '$0.00' }, features: '131K contesto, vision-language, 140+ lingue' },
    { id: 'venice/uncensored:free', name: 'Venice: Uncensored 👁️ (FREE)', category: 'standard', pricing: { input: '$0.00', output: '$0.00' }, features: '33K contesto, Mistral-24B fine-tune, senza filtri di sicurezza' },
    { id: 'nousresearch/hermes-3-405b:free', name: 'Hermes 3 405B 👁️ (FREE)', category: 'pro', pricing: { input: '$0.00', output: '$0.00' }, features: '131K contesto, flagship Llama-3.1 405B fine-tune, agentic' },
    { id: 'meta-llama/llama-3.2-3b-instruct:free', name: 'Llama 3.2 3B 👁️ (FREE)', category: 'mini', pricing: { input: '$0.00', output: '$0.00' }, features: '131K contesto, leggero e multilingua' },
    { id: 'google/gemma-3-4b:free', name: 'Google: Gemma 3 4B 👁️ (FREE)', category: 'mini', pricing: { input: '$0.00', output: '$0.00' }, features: '33K contesto, vision-language ultra-compatto' },
    { id: 'nvidia/llama-nemotron-embed-vl-1b-v2:free', name: 'Nemotron Embed VL 👁️ (FREE)', category: 'mini', pricing: { input: '$0.00', output: '$0.00' }, features: '131K contesto, ottimizzato per retrieval multimodale' },
    { id: 'openrouter/free', name: 'Auto Free 👁️ (Vision Router)', category: 'standard', pricing: { input: '$0.00', output: '$0.00' }, features: '200K contesto, ruota tra modelli free con vision, inconsistente' },
    
    // Nuovi Modelli Aggiunti
    { id: 'xiaomi/mimo-v2-omni', name: 'MiMo V2 Omni (OpenRouter)', category: 'pro', pricing: { input: '$0.40', output: '$2.00' }, features: '262K contesto, omni-modal, reasoning' },
    { id: 'xiaomi/mimo-v2-pro', name: 'MiMo V2 Pro (OpenRouter)', category: 'pro', pricing: { input: '$1.00', output: '$3.00' }, features: '1.05M contesto, ottimizzato per agenti e workflow' },
    { id: 'openai/gpt-5.4-nano', name: 'GPT-5.4 Nano (OpenRouter)', category: 'mini', pricing: { input: '$0.20', output: '$1.25' }, features: '400K contesto, lightweight & low-latency' },
    { id: 'openai/gpt-5.4-mini', name: 'GPT-5.4 Mini (OpenRouter)', category: 'mini', pricing: { input: '$0.75', output: '$4.50' }, features: '400K contesto, veloce e scalabile' },
    { id: 'mistralai/mistral-small-4', name: 'Mistral Small 4 (OpenRouter)', category: 'flash', pricing: { input: '$0.15', output: '$0.60' }, features: '262K contesto, strong reasoning & multimodality' },
    { id: 'bytedance-seed/seed-2.0-lite', name: 'Seed-2.0-Lite (OpenRouter)', category: 'flash', pricing: { input: '$0.25', output: '$2.00' }, features: '262K contesto, velocità e agentic capabilities' },
    { id: 'qwen/qwen3.5-9b', name: 'Qwen3.5-9B (OpenRouter)', category: 'flash', pricing: { input: '$0.05', output: '$0.15' }, features: '256K contesto, efficient reasoning' },
    { id: 'openai/gpt-5.4-pro', name: 'GPT-5.4 Pro (OpenRouter)', category: 'pro', pricing: { input: '$30.00', output: '$180.00' }, features: '1.05M contesto, problem solving estremo' },
    { id: 'openai/gpt-5.4', name: 'GPT-5.4 (OpenRouter)', category: 'pro', pricing: { input: '$2.50', output: '$15.00' }, features: '1.05M contesto, reasoning & agentic coding' },
    
    // Altri Modelli Richiesti
    { id: 'openai/gpt-4.1', name: 'OpenAI: GPT-4.1', category: 'pro', pricing: { input: '$2.00', output: '$8.00' }, features: '1.05M contesto, software engineering avanzato, coding (54.6% SWE-bench)' },
    { id: 'openai/gpt-4.1-mini', name: 'OpenAI: GPT-4.1 Mini', category: 'pro', pricing: { input: '$0.40', output: '$1.60' }, features: '1.05M contesto, bassa latenza, performance gpt-4o' },
    { id: 'openai/gpt-4.1-nano', name: 'OpenAI: GPT-4.1 Nano', category: 'flash', pricing: { input: '$0.10', output: '$0.40' }, features: '1.05M contesto, velocissimo ed economico, ideal per autocompletamento' },
    { id: 'google/gemma-3-12b-it', name: 'Gemma 3 12B', category: 'standard', pricing: { input: '$0.04', output: '$0.13' }, features: '128K contesto, multimodale, ragionamento migliorato' },
    { id: 'google/gemma-3-27b-it', name: 'Gemma 3 27B', category: 'pro', pricing: { input: '$0.08', output: '$0.16' }, features: '128K contesto, successore Gemma 2, top open source' },
    { id: 'google/gemma-4-26b-a4b-it', name: 'Gemma 4 26B A4B 👁️ (MoE)', category: 'flash', pricing: { input: '$0.08', output: '$0.35' }, features: '256K contesto, MoE 26B/3.8B attivi, multimodale, Apache 2.0' },

    // --- TIER 1: FRONTIER & SPECIALIZZATI ---
    { id: 'meta-llama/llama-4-maverick-17b-128e-instruct', name: 'Llama 4 Maverick MoE (OpenRouter)', category: 'flash', pricing: { input: '$0.16', output: '$0.43' }, features: '1.05M contesto, MoE 128 esperti, 17B attivi, vision' },
    { id: 'meta-llama/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout MoE (OpenRouter)', category: 'flash', pricing: { input: '$0.08', output: '$0.35' }, features: '512K contesto, MoE 16 esperti, vision' },
    { id: 'qwen/qwen-vl-max', name: 'Qwen VL Max (OpenRouter)', category: 'pro', pricing: { input: '$1.60', output: '$6.40' }, features: '131K contesto, flagship vision, document parsing/OCR' },
    { id: 'qwen/qwen2.5-vl-72b-instruct', name: 'Qwen 2.5 VL 72B (OpenRouter)', category: 'pro', pricing: { input: '$0.40', output: '$1.20' }, features: '131K contesto, vision dedicata, eccellente per documenti' },
    { id: 'qwen/qwen2.5-vl-32b-instruct', name: 'Qwen 2.5 VL 32B (OpenRouter)', category: 'flash', pricing: { input: '$0.17', output: '$0.50' }, features: '131K contesto, vision specializzata, ottimo rapporto Q/P' },
    { id: 'mistralai/pixtral-large-2411', name: 'Pixtral Large (OpenRouter)', category: 'pro', pricing: { input: '$2.00', output: '$6.00' }, features: '131K contesto, 124B parameters, vision nativa' },
    { id: 'mistralai/mistral-medium-4', name: 'Mistral Medium 4 (OpenRouter)', category: 'pro', pricing: { input: '$0.40', output: '$2.00' }, features: '262K contesto, vision nativa, successore Medium' },

    // --- TIER 2: EFFICIENZA & VALORE ---
    { id: 'microsoft/phi-5', name: 'Phi-5 (OpenRouter)', category: 'flash', pricing: { input: '$0.07', output: '$0.14' }, features: '131K contesto, 16B parameters, vision, Microsoft research' },
    { id: 'microsoft/phi-4-multimodal-instruct', name: 'Phi-4 Multimodal (OpenRouter)', category: 'flash', pricing: { input: '$0.04', output: '$0.07' }, features: '131K contesto, nativo text+image+audio, ultra-economico' },
    { id: 'bytedance-seed/seed-2.0', name: 'Seed 2.0 (OpenRouter)', category: 'pro', pricing: { input: '$1.00', output: '$4.00' }, features: '262K contesto, versione full, capabilities avanzate' },
    { id: 'cohere/cohere-r7b-vision', name: 'Cohere R7B Vision (OpenRouter)', category: 'flash', pricing: { input: '$0.04', output: '$0.04' }, features: '131K contesto, vision specializzata per documenti/RAG' },
    { id: 'amazon/nova-pro-v1', name: 'Amazon Nova Pro (OpenRouter)', category: 'pro', pricing: { input: '$0.80', output: '$3.20' }, features: '300K contesto, vision forte su documenti' },
    { id: 'amazon/nova-lite-v1', name: 'Amazon Nova Lite (OpenRouter)', category: 'flash', pricing: { input: '$0.06', output: '$0.24' }, features: '300K contesto, vision, economico' }

];

export const availableOpenRouterModels = OPENROUTER_MODELS_LIST;

export const DEFAULT_TRANSLATION_PROMPT_TEMPLATE = `RUOLO: Traduttore editoriale professionista {{sourceLang}} → italiano. Traduci INTEGRALMENTE la sola PAGINA TARGET.
{{legalContext}}

LAYOUT IMMAGINI:
- PAGINA TARGET: l'immagine da tradurre (UNICA fonte di output).
- CONTESTO (precedente/successivo): immagini delle pagine adiacenti — NON tradurle, sono solo riferimento visivo.

WORKFLOW (esegui prima di scrivere):
1. OSSERVA la PAGINA TARGET dall'alto al basso: titoli, paragrafi, didascalie, note. Una colonna o DUE?
2. DECIDI — questo vincola DIRETTAMENTE ciò che scrivi: due colonne → il tuo output DEVE contenere [[PAGE_SPLIT]]. Se lo dimentichi, FERMATI e inseriscilo. Una colonna → NON usarlo.
3. TRADUCI ogni blocco identificato, in ordine, fino all'ULTIMA riga visibile.

REGOLE CRITICHE:
1. LINGUA: SEMPRE italiano. Mai trascrivere nella lingua sorgente.
2. COMPLETEZZA: ogni riga, paragrafo, nota della PAGINA TARGET. ZERO omissioni, ZERO riassunti, ZERO sintesi.
3. SOLO PAGINA TARGET: ignora completamente il testo nelle immagini di contesto e nel <context_previous>.
4. PAROLE SPEZZATE: parola tagliata a fine pagina → traducila intera dove inizia. Frammento residuo a inizio pagina dalla precedente → ignoralo.
5. ILLEGGIBILE: [ILLEGIBILE] per frasi, [PAROLA ILLEGIBILE] per parole. Mai inventare informazioni non visibili.
6. PARAGRAFI DENSI / TECNICI / GIURIDICI: sono il CUORE del libro. Tradurli riga per riga senza abbreviare, semplificare o saltare.

REGOLA [[PAGE_SPLIT]] (CRITICA):
Se la PAGINA TARGET è impaginata in DUE COLONNE affiancate:
1. Traduci INTEGRALMENTE la colonna SINISTRA dall'alto al basso.
2. Inserisci su UNA RIGA SEPARATA esattamente: [[PAGE_SPLIT]]
3. Traduci INTEGRALMENTE la colonna DESTRA dall'alto al basso.
NON omettere [[PAGE_SPLIT]] in caso di due colonne. NON inserirlo se la pagina è a colonna singola. NON ripeterlo.

FORMATTAZIONE:
- Unisci le righe spezzate dall'OCR nello stesso paragrafo. Mantieni gli "a capo" tra blocchi distinti (paragrafi, titoli, note, copyright).
- NOTE A PIÈ DI PAGINA: richiamo numerico (¹ ² ³) nel testo, contenuto integrale dopo "---" in fondo alla colonna/pagina di appartenenza. Con [[PAGE_SPLIT]]: note della colonna sinistra prima del marker, della destra dopo. Mai duplicare una nota.

TABELLE E DATI TABULARI:
Quando la pagina contiene tabelle, griglie o dati strutturati in colonne e righe:
1. IDENTIFICA ogni tabella nella pagina (incluse tabelle parziali che attraversano i margini).
2. TRADUCI cella per cella, mantenendo l'ordine righe→colonne dell'originale.
3. FORMATTAZIONE OUTPUT: usa la sintassi Markdown per le tabelle:
   - Riga di intestazione: | Col1 | Col2 | Col3 |
   - Separatore:           |------|------|------|
   - Righe dati:           | dato | dato | dato |
4. ALLINEAMENTO: adatta la larghezza delle colonne al contenuto tradotto. Le intestazioni tradotte possono essere più lunghe o corte dell'originale.
5. TABELLE IMPIEGATE IN TESTO: se la tabella è circondata da paragrafi, traduci normalmente il testo sopra/sotto e inserisci la tabella Markdown nel punto corrispondente.
6. NON convertire tabelle in elenchi o prosa. Una tabella nell'originale DEVE restare tabella nella traduzione.
7. TABELLE PARZIALI: se una tabella continua nella pagina successiva, traduci le righe visibili e aggiungi "[TABELLA CONTINUA]" dopo l'ultima riga.

ESEMPIO (pagina a DUE COLONNE con note):
Titolo del capitolo
Primo paragrafo della colonna sinistra che continua qui¹.
Secondo paragrafo della colonna sinistra.
---
¹ Nota della colonna sinistra.
[[PAGE_SPLIT]]
Primo paragrafo della colonna destra².
Secondo paragrafo della colonna destra.
---
² Nota della colonna destra.

CONTESTO PRECEDENTE (solo riferimento per coerenza lessicale — NON tradurre, NON includere):
"""
{{prevContext}}
"""

VERIFICA FINALE prima di rispondere:
- Ho tradotto tutti i blocchi identificati nello step 1?
- L'output è in italiano (non trascritto in {{sourceLang}})?
- VERIFICA LAYOUT INCROCIATA: se ho stabilito DUE colonne ma [[PAGE_SPLIT]] NON è nel mio output → INSERISCILO ORA. Se ho stabilito UNA colonna ma [[PAGE_SPLIT]] è presente → RIMUOVILO.
- Ho incluso tutte le note?

OUTPUT: solo il testo tradotto. Nessun preambolo, nessun commento, nessun "Ecco la traduzione".

{{retryMode}}`;

export const LITE_TRANSLATION_PROMPT_TEMPLATE = `RUOLO: Traduttore editoriale {{sourceLang}} → italiano. Traduci INTEGRALMENTE la sola PAGINA TARGET.
{{legalContext}}

LAYOUT IMMAGINI: la PAGINA TARGET è l'immagine da tradurre. Eventuali immagini di CONTESTO (pagine adiacenti) sono solo riferimento visivo: NON tradurle.

WORKFLOW (esegui prima di scrivere):
1. OSSERVA la PAGINA TARGET: una colonna o DUE? Quanti paragrafi? Note?
2. DECIDI — questo vincola DIRETTAMENTE il tuo output: DUE colonne → il tuo output DEVE contenere [[PAGE_SPLIT]]. Se lo dimentichi, FERMATI e inseriscilo. UNA colonna → NON usarlo.
3. TRADUCI ogni blocco in ordine fino all'ULTIMA riga.

REGOLE CRITICHE:
1. LINGUA: SEMPRE italiano. Mai trascrivere nella lingua sorgente.
2. COMPLETEZZA: ogni riga, paragrafo, nota. ZERO omissioni, ZERO riassunti.
3. SOLO PAGINA TARGET: ignora il contesto sopra e le altre immagini.
4. ILLEGGIBILE: [ILLEGIBILE] per frasi, [PAROLA ILLEGIBILE] per parole. Mai inventare.
5. PAROLE SPEZZATE: parola tagliata a fine pagina → traducila intera. Frammento residuo a inizio pagina → ignoralo.

REGOLA [[PAGE_SPLIT]] (CRITICA):
Pagina a DUE COLONNE → traduci colonna SINISTRA, poi su riga separata scrivi esattamente [[PAGE_SPLIT]], poi colonna DESTRA.

NOTE: richiamo (¹ ² ³) nel testo, contenuto dopo "---" in fondo. Con [[PAGE_SPLIT]]: note sinistra prima del marker, destra dopo. Mai duplicare.

TABELLE: se la pagina contiene tabelle o dati tabulari, traduci cella per cella e usa formato Markdown:
| Intestazione 1 | Intestazione 2 |
|-----------------|-----------------|
| dato tradotto   | dato tradotto   |
NON convertire tabelle in elenchi o prosa. Tabella nell'originale DEVE restare tabella. Se la tabella continua nella pagina successiva, aggiungi "[TABELLA CONTINUA]".

ESEMPIO (pagina a due colonne):
Titolo capitolo
Primo paragrafo della colonna sinistra¹.
---
¹ Nota sinistra.
[[PAGE_SPLIT]]
Primo paragrafo della colonna destra².
---
² Nota destra.

CONTESTO PRECEDENTE (NON tradurre, solo riferimento):
"""
{{prevContext}}
"""

VERIFICA prima di rispondere:
- Tutti i blocchi tradotti? Output in italiano?
- VERIFICA LAYOUT INCROCIATA: se hai stabilito DUE colonne ma [[PAGE_SPLIT]] NON è nel tuo output → INSERISCILO ORA. Se hai stabilito UNA colonna ma [[PAGE_SPLIT]] è presente → RIMUOVILO.

OUTPUT: solo il testo tradotto, nessun preambolo né commento.

{{retryMode}}`;

/**
 * Modelli che utilizzano il prompt "Lite" (più semplice) per migliorare la compliance.
 */
export const LITE_PROMPT_MODELS = [
  // OpenRouter
  'qwen/qwen3.5-9b',
  'openai/gpt-5.4-nano',
  'openai/gpt-4.1-nano',
  'openai/gpt-4.1-mini',
  'openai/gpt-5.4-mini',
  'google/gemma-3-12b-it',
  'google/gemma-3-27b-it',
  'mistralai/mistral-small-4',
  'xiaomi/mimo-v2-flash',
  'bytedance-seed/seed-2.0-lite',
  'anthropic/claude-haiku-4.5',
  'google/gemini-3.1-flash-lite-preview',
  'google/gemma-4-26b-a4b-it',
  // OpenRouter Free
  'z-ai/glm-4.5-air:free',
  'inclusionai/ling-2.6-flash:free',
  'nvidia/nemotron-nano-12b-2-vl:free',
  'google/gemma-4-31b:free',
  'google/gemma-4-26b-a4b:free',
  'openai/gpt-oss-20b:free',
  'qwen/qwen3-coder-480b-a35b:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'qwen/qwen3-next-80b-a3b-instruct:free',
  'liquid/lfm2.5-1.2b-thinking:free',
  'liquid/lfm2.5-1.2b-instruct:free',
  'google/gemma-3-27b:free',
  'venice/uncensored:free',
  'nousresearch/hermes-3-405b:free',
  'meta-llama/llama-3.2-3b-instruct:free',
  'google/gemma-3-4b:free',
  'nvidia/llama-nemotron-embed-vl-1b-v2:free',
  'openrouter/free',
  // Altri Lite Tiers
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'qwen/qwen2.5-vl-32b-instruct',
  'microsoft/phi-5',
  'microsoft/phi-4-multimodal-instruct',
  'cohere/cohere-r7b-vision',
  'amazon/nova-lite-v1',
  // Gemini diretti
  'gemini-3.1-flash-lite-preview',
  'gemini-2.5-flash-lite',
  // Claude diretti
  'claude-haiku-4-5-20251001',
  // OpenAI diretti
  'gpt-4o-mini',
  // Groq
  'meta-llama/llama-4-scout-17b-16e-instruct',
  // Z.ai direct
  'glm-4v-flash'
];
export const CLAUDE_OPUS_FAST_ID = 'anthropic/claude-opus-4.6-fast';
