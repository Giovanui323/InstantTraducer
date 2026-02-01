import { useState, useEffect, useCallback } from 'react';
import { AISettings } from '../types';
import { log } from '../services/logger';
import { GEMINI_TRANSLATION_MODEL, GEMINI_VERIFIER_MODEL } from '../constants';

export const useAiSettings = () => {
  const [aiSettings, setAiSettings] = useState<AISettings>({
    provider: 'gemini',
    translationConcurrency: 2,
    qualityCheck: { enabled: true, verifierModel: GEMINI_VERIFIER_MODEL, maxAutoRetries: 1 },
    gemini: { apiKey: '', model: GEMINI_TRANSLATION_MODEL },
    openai: { apiKey: '', model: 'gpt-4o-mini', reasoningEffort: 'medium', verbosity: 'medium' },
    legalContext: true,
    verboseLogs: true,
    inputLanguageDefault: 'tedesco',
    customProjectsPath: ''
  });

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

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
                gemini: { ...prev.gemini, ...(((settings as any).gemini) || {}) },
                openai: { ...prev.openai, ...(((settings as any).openai) || {}) },
                qualityCheck: (settings as any).qualityCheck
                  ? { ...prev.qualityCheck, ...(settings as any).qualityCheck }
                  : prev.qualityCheck
              };

              if (merged.provider === 'gemini') {
                merged.gemini = { ...merged.gemini, model: GEMINI_TRANSLATION_MODEL };
                merged.qualityCheck = {
                  enabled: merged.qualityCheck?.enabled ?? true,
                  verifierModel: GEMINI_VERIFIER_MODEL,
                  maxAutoRetries: merged.qualityCheck?.maxAutoRetries ?? 1
                };
              }

              return merged;
            });
          }
        }
      } catch (e) {
        log.error("Errore caricamento impostazioni", e);
      }
    };
    load();
  }, []);

  const saveSettings = useCallback(async (settings: AISettings) => {
    setAiSettings(settings);
    log.step("Salvataggio impostazioni AI...", {
      provider: settings.provider,
      geminiModel: settings.gemini.model,
      openaiModel: settings.openai.model,
      qualityCheckEnabled: Boolean(settings.qualityCheck?.enabled),
      qualityCheckModel: settings.qualityCheck?.verifierModel,
      geminiApiConfigured: Boolean(settings.gemini.apiKey?.trim()),
      openaiApiConfigured: Boolean(settings.openai.apiKey?.trim())
    });

    try {
      if (!window.electronAPI) throw new Error('Contesto Electron non rilevato');
      await window.electronAPI.saveSettings(settings);
      log.success("Impostazioni salvate correttamente.");
    } catch (e) {
      log.error("Errore salvataggio file impostazioni", e);
    }

    setIsSettingsOpen(false);
  }, []);

  const isApiConfigured = (aiSettings.provider === 'gemini' ? aiSettings.gemini.apiKey : aiSettings.openai.apiKey).trim().length > 0;

  return {
    aiSettings,
    setAiSettings,
    isSettingsOpen,
    setIsSettingsOpen,
    saveSettings,
    isApiConfigured
  };
};
