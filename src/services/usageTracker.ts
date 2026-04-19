import { GEMINI_MODELS_LIST, CLAUDE_MODELS_LIST, OPENAI_MODELS_LIST, GROQ_MODELS_LIST, ZAI_MODELS_LIST, MODAL_MODELS_LIST, OPENROUTER_MODELS_LIST, ModelInfo } from "../constants";

export interface ModelUsage {
    cost: number;
    calls: number;
    inputTokens: number;
    outputTokens: number;
}

export interface ProjectUsage {
    cost: number;
    calls: number;
    name?: string;
    lastUpdated?: number;
}

export interface UsageMetrics {
    lastCall: {
        modelId: string;
        inputTokens: number;
        outputTokens: number;
        cost: number;
        timestamp: number;
    };
    models: Record<string, ModelUsage>;
    projects: Record<string, ProjectUsage>;
}

const STORAGE_KEY = 'app_usage_metrics';

const defaultMetrics: UsageMetrics = {
    lastCall: { modelId: '', inputTokens: 0, outputTokens: 0, cost: 0, timestamp: 0 },
    models: {},
    projects: {}
};

let currentMetrics: UsageMetrics = { ...defaultMetrics };

// Helper per estrarre il costo da una stringa tipo "$2.00"
const parsePrice = (price?: string): number => {
    if (!price) return 0;
    return parseFloat(price.replace('$', '').replace(',', '.'));
};

const getModelCost = (modelId: string): { input: number, output: number } | null => {
    // Cerca in tutte le liste standard
    const allLists = [
        GEMINI_MODELS_LIST,
        CLAUDE_MODELS_LIST,
        OPENAI_MODELS_LIST,
        GROQ_MODELS_LIST,
        ZAI_MODELS_LIST,
        MODAL_MODELS_LIST,
        OPENROUTER_MODELS_LIST
    ];

    for (const list of allLists) {
        const found = list.find(m => m.id === modelId);
        if (found?.pricing) {
            return {
                input: parsePrice(found.pricing.input),
                output: parsePrice(found.pricing.output)
            };
        }
    }

    // Se non trovato, cerca nei modelli custom dell'utente
    try {
        const settingsRaw = localStorage.getItem('app_settings');
        if (settingsRaw) {
            const settings = JSON.parse(settingsRaw);
            if (settings.customModels && Array.isArray(settings.customModels)) {
                const found = settings.customModels.find((m: any) => m.id === modelId);
                if (found?.pricing) {
                    return {
                        input: typeof found.pricing.input === 'number' ? found.pricing.input : parsePrice(found.pricing.input),
                        output: typeof found.pricing.output === 'number' ? found.pricing.output : parsePrice(found.pricing.output)
                    };
                }
            }
        }
    } catch {
        // ignore
    }

    return null;
};

const isGroqModelId = (modelId: string) => {
    return GROQ_MODELS_LIST.some(m => m.id === modelId);
};

let activeProjectId = 'Progetto Senza Nome';
let activeProjectName: string | undefined = undefined;

export const setActiveProject = (projectId: string, projectName?: string) => {
    activeProjectId = projectId || 'Progetto Indefinito';
    activeProjectName = projectName || activeProjectName;
};

try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
            // Sanitizzazione dei dati caricati per prevenire crash (es. cost: null)
            const sanitizedModels: Record<string, ModelUsage> = {};
            if (parsed.models) {
                Object.entries(parsed.models as Record<string, any>).forEach(([id, data]) => {
                    sanitizedModels[id] = {
                        cost: typeof data.cost === 'number' && !isNaN(data.cost) ? data.cost : 0,
                        calls: typeof data.calls === 'number' ? data.calls : 0,
                        inputTokens: typeof data.inputTokens === 'number' ? data.inputTokens : 0,
                        outputTokens: typeof data.outputTokens === 'number' ? data.outputTokens : 0
                    };
                });
            }

            const sanitizedProjects: Record<string, ProjectUsage> = {};
            if (parsed.projects) {
                Object.entries(parsed.projects as Record<string, any>).forEach(([id, data]) => {
                    sanitizedProjects[id] = {
                        cost: typeof data.cost === 'number' && !isNaN(data.cost) ? data.cost : 0,
                        calls: typeof data.calls === 'number' ? data.calls : 0,
                        name: data.name,
                        lastUpdated: data.lastUpdated
                    };
                });
            }

            currentMetrics = {
                lastCall: parsed.lastCall || defaultMetrics.lastCall,
                models: sanitizedModels,
                projects: sanitizedProjects
            };
        }
    }
} catch {
    // ignore
}

export const estimateModelCostPerPageUSD = (
    modelId: string,
    options?: { inputTokens?: number; outputTokens?: number; groqFree?: boolean; pricingOverride?: { input: string; output: string } }
) => {
    const inputTokens = options?.inputTokens ?? 2600;
    const outputTokens = options?.outputTokens ?? 2600;
    const groqFree = options?.groqFree ?? true;

    if (groqFree && isGroqModelId(modelId)) return 0;

    let pricing = getModelCost(modelId);
    if (!pricing && options?.pricingOverride) {
        pricing = {
            input: parsePrice(options.pricingOverride.input),
            output: parsePrice(options.pricingOverride.output)
        };
    }
    if (!pricing) return 0;

    const costIn = (inputTokens / 1_000_000) * pricing.input;
    const costOut = (outputTokens / 1_000_000) * pricing.output;
    return costIn + costOut;
};

/**
 * Traccia l'utilizzo dei token e calcola i costi.
 * Se pricingOverride è fornito (es. per modelli custom), usa quello invece di cercarlo nelle liste.
 */
export const trackUsage = (modelId: string, inputTokens: number, outputTokens: number, pricingOverride?: { input: string, output: string }) => {
    const projectId = activeProjectId;
    
    let pricing = getModelCost(modelId);
    if (!pricing && pricingOverride) {
        pricing = {
            input: parsePrice(pricingOverride.input),
            output: parsePrice(pricingOverride.output)
        };
    }

    let callCost = 0;
    if (pricing && !isGroqModelId(modelId)) {
        // Il prezzo è espresso per 1 Milione di Token
        const costIn = (inputTokens / 1_000_000) * pricing.input;
        const costOut = (outputTokens / 1_000_000) * pricing.output;
        callCost = costIn + costOut;
    }

    currentMetrics.lastCall = {
        modelId,
        inputTokens,
        outputTokens,
        cost: callCost,
        timestamp: Date.now()
    };

    if (!currentMetrics.models[modelId]) {
        currentMetrics.models[modelId] = { cost: 0, calls: 0, inputTokens: 0, outputTokens: 0 };
    }
    currentMetrics.models[modelId].cost += callCost;
    currentMetrics.models[modelId].calls += 1;
    currentMetrics.models[modelId].inputTokens += inputTokens;
    currentMetrics.models[modelId].outputTokens += outputTokens;

    if (!currentMetrics.projects[projectId]) {
        currentMetrics.projects[projectId] = { cost: 0, calls: 0 };
    }
    currentMetrics.projects[projectId].cost += callCost;
    currentMetrics.projects[projectId].calls += 1;
    currentMetrics.projects[projectId].name = activeProjectName || currentMetrics.projects[projectId].name;
    currentMetrics.projects[projectId].lastUpdated = Date.now();

    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(currentMetrics));
    } catch (e) {
        // ignore
    }
    
    // Dispatch custom event per aggiornare i componenti React
    window.dispatchEvent(new CustomEvent('usage-metrics-updated'));
};

export const getUsageMetrics = (): UsageMetrics => currentMetrics;
export const clearUsageSession = () => {
    currentMetrics = { ...defaultMetrics };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(currentMetrics));
    window.dispatchEvent(new CustomEvent('usage-metrics-updated'));
};
