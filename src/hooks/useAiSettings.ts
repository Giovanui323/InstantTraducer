import { useState, useEffect, useCallback } from 'react';
import { AISettings } from '../types';
import { log } from '../services/logger';
import { validateSettings } from '../services/configValidation';
import { GEMINI_TRANSLATION_MODEL, GEMINI_TRANSLATION_FAST_MODEL, GEMINI_VERIFIER_MODEL, GEMINI_VERIFIER_PRO_MODEL, CLAUDE_MODELS_LIST, GEMINI_TRANSLATION_FLASH_MODEL } from '../constants';

export const useAiSettings = () => {
  const [aiSettings, setAiSettings] = useState<AISettings>({
    provider: 'gemini',
    translationConcurrency: 2,
    sequentialContext: true,
    fastMode: false,
    proVerification: false,
    qualityCheck: { enabled: true, verifierProvider: 'gemini', verifierModel: GEMINI_VERIFIER_MODEL, maxAutoRetries: 1 },
    metadataExtraction: { enabled: true, provider: 'gemini', model: GEMINI_TRANSLATION_FLASH_MODEL },
    gemini: { apiKey: '', model: GEMINI_TRANSLATION_MODEL },
    openai: { apiKey: '', model: 'gpt-4o-mini', reasoningEffort: 'medium', verbosity: 'medium' },
    claude: { apiKey: '', model: CLAUDE_MODELS_LIST[0].id },
    groq: { apiKey: '', model: 'llama-3.3-70b-versatile' },
    legalContext: true,
    verboseLogs: true,
    customProjectsPath: '',
    customPrompt: '',
    customVerificationPrompt: '',
    customMetadataPrompt: '',
    forceFixTranslationModel: '',
    exportOptions: {
      splitSpreadIntoTwoPages: true,
      insertBlankPages: true,
      outputFormat: 'A4',
      previewInReader: false
    }
  });

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        if (window.electronAPI?.loadSettings) {
          const settings = await window.electronAPI.loadSettings();
          if (settings) {
            setAiSettings(prev => {
              const merged: AISettings = {
                ...prev,
                ...settings,
                gemini: { ...prev.gemini, ...(settings.gemini || {}) },
                openai: { ...prev.openai, ...(settings.openai || {}) },
                claude: { ...prev.claude, ...(settings.claude || {}) },
                groq: { ...prev.groq, ...(settings.groq || {}) },
                qualityCheck: settings.qualityCheck
                  ? { ...prev.qualityCheck, ...settings.qualityCheck }
                  : prev.qualityCheck,
                metadataExtraction: settings.metadataExtraction
                  ? { ...prev.metadataExtraction, ...settings.metadataExtraction }
                  : prev.metadataExtraction,
                exportOptions: settings.exportOptions
                  ? { ...prev.exportOptions, ...settings.exportOptions }
                  : prev.exportOptions
              };

              // La logica per selezionare il modello in base a fastMode/proVerification
              // è ora gestita esclusivamente dall'interfaccia utente (SettingsModal).
              // Non sovrascriviamo più i modelli salvati qui per permettere una scelta manuale/avanzata.

              const validation = validateSettings(merged);
              if (!validation.valid) {
                 log.warn("Impostazioni caricate non valide, applicati correttivi.", validation.errors);
              }
              if (validation.warnings.length > 0) {
                 log.warn("Avvisi configurazione:", validation.warnings);
              }

              return validation.safeSettings;
            });
          }
        }
      } catch (e) {
        log.error(`Errore caricamento impostazioni: ${e instanceof Error ? e.message : JSON.stringify(e)}`, e);
      } finally {
        setSettingsLoaded(true);
      }
    };
    load();
  }, []);

  useEffect(() => {
    const api: any = window.electronAPI;
    if (!api?.onLibraryRefresh) return;
    const unsubscribe = api.onLibraryRefresh((payload: any) => {
      if (payload && typeof payload === 'object' && Object.prototype.hasOwnProperty.call(payload, 'customProjectsPath')) {
        setAiSettings(prev => ({ ...prev, customProjectsPath: payload.customProjectsPath ?? '' }));
      }
    });
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  const saveSettings = useCallback(async (settings: AISettings) => {
    const validation = validateSettings(settings);
    
    if (!validation.valid) {
       log.warn("Salvataggio impostazioni: applicati correttivi per validazione.", validation.errors);
       settings = validation.safeSettings;
    }
    
    // Log explicitly if Gemini model has changed
    if (aiSettings.gemini.model !== settings.gemini.model) {
        log.info(`[CONFIG] Cambio Modello Gemini: ${aiSettings.gemini.model} -> ${settings.gemini.model}`);
    }
    if (aiSettings.fastMode !== settings.fastMode) {
        log.info(`[CONFIG] Cambio Modalità Veloce: ${aiSettings.fastMode} -> ${settings.fastMode}`);
    }
    if (aiSettings.proVerification !== settings.proVerification) {
        log.info(`[CONFIG] Cambio Modalità Verifica Pro: ${aiSettings.proVerification} -> ${settings.proVerification}`);
    }
    if (aiSettings.qualityCheck?.verifierModel !== settings.qualityCheck?.verifierModel) {
        log.info(`[CONFIG] Cambio Modello Verifier: ${aiSettings.qualityCheck?.verifierModel} -> ${settings.qualityCheck?.verifierModel}`);
    }
    if (aiSettings.groq?.model !== settings.groq?.model) {
        log.info(`[CONFIG] Cambio Modello Groq: ${aiSettings.groq?.model} -> ${settings.groq?.model}`);
    }
    if (aiSettings.provider !== settings.provider) {
        log.info(`[CONFIG] Cambio Provider: ${aiSettings.provider} -> ${settings.provider}`);
    }

    setAiSettings(settings);
    log.step("Salvataggio impostazioni AI...", {
      provider: settings.provider,
      geminiModel: settings.gemini.model,
      openaiModel: settings.openai.model,
      claudeModel: settings.claude?.model,
      groqModel: settings.groq?.model,
      qualityCheckEnabled: Boolean(settings.qualityCheck?.enabled),
      qualityCheckModel: settings.qualityCheck?.verifierModel,
      geminiApiConfigured: Boolean(settings.gemini.apiKey?.trim()),
      openaiApiConfigured: Boolean(settings.openai.apiKey?.trim()),
      claudeApiConfigured: Boolean(settings.claude?.apiKey?.trim()),
      groqApiConfigured: Boolean(settings.groq?.apiKey?.trim())
    });

    try {
      if (!window.electronAPI) throw new Error('Contesto Electron non rilevato');
      await window.electronAPI.saveSettings(settings);
      log.success("Impostazioni salvate correttamente.");
    } catch (e) {
      log.error("Errore salvataggio file impostazioni", e);
    }
  }, []);

  const isApiConfigured = (() => {
    if (aiSettings.provider === 'gemini') return aiSettings.gemini.apiKey;
    if (aiSettings.provider === 'openai') return aiSettings.openai.apiKey;
    if (aiSettings.provider === 'claude') return aiSettings.claude.apiKey;
    if (aiSettings.provider === 'groq') return aiSettings.groq?.apiKey || '';
    return '';
  })().trim().length > 0;

  return {
    aiSettings,
    setAiSettings,
    isSettingsOpen,
    setIsSettingsOpen,
    saveSettings,
    isApiConfigured,
    settingsLoaded
  };
};
