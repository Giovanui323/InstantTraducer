import { AISettings, GeminiModel, OpenAIModel } from '../types';
import {
  GEMINI_TRANSLATION_MODEL,
  GEMINI_TRANSLATION_FAST_MODEL,
  GEMINI_TRANSLATION_FALLBACK_MODEL,
  GEMINI_TRANSLATION_FLASH_MODEL,
  GEMINI_VERIFIER_MODEL,
  GEMINI_VERIFIER_PRO_MODEL,
  GEMINI_VERIFIER_FALLBACK_MODEL,
  GEMINI_MODELS_LIST,
  CLAUDE_MODELS_LIST,
  MODAL_MODELS_LIST,
  ZAI_MODELS_LIST
} from '../constants';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  safeSettings: AISettings;
}

const VALID_GEMINI_MODELS = GEMINI_MODELS_LIST.map(m => m.id);

export const validateSettings = (settings: AISettings): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];
  let safeSettings = { ...settings };

  // 1. Provider Integrity
  if (settings.provider !== 'gemini' && settings.provider !== 'openai' && settings.provider !== 'claude' && settings.provider !== 'groq' && settings.provider !== 'modal' && settings.provider !== 'zai' && settings.provider !== 'openrouter' && settings.provider !== 'custom') {
    errors.push(`Provider non valido: ${settings.provider}. Reimpostato su 'gemini'.`);
    safeSettings.provider = 'gemini';
  }

  // 2. Gemini Model Verification
  if (settings.provider === 'gemini') {
    if (!settings.gemini.model) {
      // Only set default if model is completely missing
      warnings.push("Modello Gemini non specificato. Reimpostato su default.");
      safeSettings.gemini.model = GEMINI_TRANSLATION_MODEL;
    } else if (!VALID_GEMINI_MODELS.includes(settings.gemini.model)) {
      // Warn only — preserve the saved model. It might be a new/preview model not yet in our list.
      warnings.push(`Modello Gemini '${settings.gemini.model}' non nella lista locale, ma verrà usato come salvato.`);
      // Do NOT override: safeSettings.gemini.model stays as-is
    }
  }

  // 3. OpenAI Validation
  if (settings.provider === 'openai') {
    if (!settings.openai.model) {
        warnings.push("Modello OpenAI non specificato. Reimpostato su 'gpt-4o-mini'.");
        safeSettings.openai.model = 'gpt-4o-mini';
    }
  }

  // 3.5 Claude Validation
  if (settings.provider === 'claude') {
    if (!settings.claude?.model) {
        warnings.push(`Modello Claude non specificato. Reimpostato su '${CLAUDE_MODELS_LIST[0].id}'.`);
        if (!safeSettings.claude) safeSettings.claude = { apiKey: '', model: CLAUDE_MODELS_LIST[0].id as any };
        else safeSettings.claude.model = CLAUDE_MODELS_LIST[0].id as any;
    }
  }

  // 3.6 Groq Validation — preserve saved model, just ensure structure exists
  if (!safeSettings.groq) {
    safeSettings.groq = { apiKey: '', model: 'llama-3.3-70b-versatile' };
  } else {
    if (!safeSettings.groq.model) {
      safeSettings.groq.model = 'llama-3.3-70b-versatile';
    }
  }

  // 3.7 Modal Validation
  if (!safeSettings.modal) {
    safeSettings.modal = { apiKey: '' };
  }

  // 3.8 Z.ai Validation
  if (!safeSettings.zai) {
    safeSettings.zai = { apiKey: '', model: 'glm-4v-plus' };
  } else {
    if (!safeSettings.zai.model) {
      safeSettings.zai.model = 'glm-4v-plus';
    }
  }

  // 3.9 OpenRouter Validation
  if (!safeSettings.openrouter) {
    safeSettings.openrouter = { apiKey: '', model: 'anthropic/claude-sonnet-4.5' };
  } else {
    if (!safeSettings.openrouter.model) {
      safeSettings.openrouter.model = 'anthropic/claude-sonnet-4.5';
    }
  }

  // 3.9 Custom Providers Validation
  if (safeSettings.customProviders && Array.isArray(safeSettings.customProviders)) {
    safeSettings.customProviders = safeSettings.customProviders.filter(cp =>
      cp.id && cp.name && cp.apiFormat && cp.baseUrl && cp.model && cp.apiKey
    );
  }

  // If provider is 'custom', ensure activeCustomProviderId is valid
  if (safeSettings.provider === 'custom') {
    const activeId = safeSettings.activeCustomProviderId;
    const exists = safeSettings.customProviders?.some(cp => cp.id === activeId);
    if (!exists && safeSettings.customProviders && safeSettings.customProviders.length > 0) {
      safeSettings.activeCustomProviderId = safeSettings.customProviders[0].id;
    } else if (!exists) {
      warnings.push("Provider custom selezionato ma nessun provider custom configurato.");
      safeSettings.provider = 'gemini';
    }
  }

  // 4. Conflict Resolution & Consistency
  
  // Fast Mode Consistency
  if (settings.fastMode) {
    const currentModel = settings.gemini.model;
    const isFlashModel = currentModel.includes('flash') || currentModel.includes('lite');
    
    if (settings.provider === 'gemini' && !isFlashModel) {
      warnings.push("Fast Mode attiva ma modello non-Flash selezionato. Le prestazioni potrebbero non essere ottimali.");
      // We don't force change here to allow user override, but we warn.
    }
  }

  // Quality Check Consistency
  if (settings.qualityCheck?.enabled) {
    if (!settings.qualityCheck.verifierModel && safeSettings.qualityCheck) {
       safeSettings.qualityCheck.verifierModel = GEMINI_VERIFIER_MODEL;
    }
    if (!settings.qualityCheck.verifierProvider && safeSettings.qualityCheck) {
       safeSettings.qualityCheck.verifierProvider = 'gemini';
    }
    
    // Check if verifier model is valid
    if (settings.qualityCheck?.verifierProvider === 'gemini' && safeSettings.qualityCheck && !VALID_GEMINI_MODELS.includes(safeSettings.qualityCheck.verifierModel)) {
        // Just a warning
    }
  }

  // Metadata Extraction Consistency
  if (!safeSettings.metadataExtraction) {
      safeSettings.metadataExtraction = { enabled: true, provider: 'gemini', model: GEMINI_TRANSLATION_FLASH_MODEL };
  } else {
      if (!safeSettings.metadataExtraction.provider) safeSettings.metadataExtraction.provider = 'gemini';
      if (!safeSettings.metadataExtraction.model) safeSettings.metadataExtraction.model = GEMINI_TRANSLATION_FLASH_MODEL;
  }

  // Pro Verification Consistency
  if (settings.proVerification) {
      if (settings.qualityCheck?.verifierModel !== GEMINI_VERIFIER_PRO_MODEL) {
          // If proVerification is explicit, ensure model matches or warn
          if (settings.qualityCheck?.verifierModel && settings.qualityCheck.verifierModel !== GEMINI_VERIFIER_PRO_MODEL) {
             // warnings.push("Pro Verification attiva ma modello verifier diverso da Pro.");
             // Note: In UI, these are coupled. We'll trust the settings object for now but ensure defaults.
          }
      }
  }

  // 5. Defaults for optional fields
  if (typeof safeSettings.forceFixTranslationModel !== 'string') {
    safeSettings.forceFixTranslationModel = '';
  }
  if (!safeSettings.exportOptions) {
      safeSettings.exportOptions = {
          splitSpreadIntoTwoPages: true,
          insertBlankPages: true,
          outputFormat: 'A4',
          previewInReader: false
      };
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    safeSettings
  };
};

export const getSafeDefaults = (): AISettings => {
    return {
        provider: 'gemini',
        translationConcurrency: 2,
        sequentialContext: true,
        fastMode: false,
        proVerification: false,
        forceFixTranslationModel: '',
        qualityCheck: { enabled: true, verifierProvider: 'gemini', verifierModel: GEMINI_VERIFIER_MODEL, maxAutoRetries: 1 },
        metadataExtraction: { enabled: true, provider: 'gemini', model: GEMINI_TRANSLATION_FLASH_MODEL },
        gemini: { apiKey: '', model: GEMINI_TRANSLATION_MODEL },
        openai: { apiKey: '', model: 'gpt-4o-mini', reasoningEffort: 'medium', verbosity: 'medium' },
        claude: { apiKey: '', model: CLAUDE_MODELS_LIST[0].id as any },
        groq: { apiKey: '', model: 'llama-3.3-70b-versatile' },
        modal: { apiKey: '' },
        zai: { apiKey: '', model: 'glm-4v-plus' },
        openrouter: { apiKey: '', model: 'anthropic/claude-sonnet-4.5' },
        customProviders: [],
        disabledProviders: [],
        legalContext: true,
        verboseLogs: true,
        customProjectsPath: '',
        exportOptions: {
          splitSpreadIntoTwoPages: true,
          insertBlankPages: true,
          outputFormat: 'A4',
          previewInReader: false
        }
      };
};
