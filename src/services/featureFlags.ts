import { AISettings } from '../types';

export enum FeatureFlag {
  QUALITY_CHECK = 'QUALITY_CHECK',
  CONSULTATION_MODE = 'CONSULTATION_MODE',
  VERBOSE_LOGS = 'VERBOSE_LOGS',
  LEGAL_CONTEXT = 'LEGAL_CONTEXT',
  FAST_MODE = 'FAST_MODE',
  PRO_VERIFICATION = 'PRO_VERIFICATION',
  SEQUENTIAL_CONTEXT = 'SEQUENTIAL_CONTEXT',
  EXPORT_PREVIEW = 'EXPORT_PREVIEW'
}

type FeatureStatus = 'enabled' | 'disabled' | 'unavailable';

interface FeatureMetadata {
  label: string;
  description: string;
  default: boolean;
  requiresProvider?: 'gemini' | 'openai' | 'claude';
}

const FEATURE_METADATA: Record<FeatureFlag, FeatureMetadata> = {
  [FeatureFlag.QUALITY_CHECK]: {
    label: 'Controllo Qualità',
    description: 'Verifica automatica della qualità della traduzione',
    default: true
  },
  [FeatureFlag.CONSULTATION_MODE]: {
    label: 'Modalità Consultazione',
    description: 'Permette di consultare il PDF senza tradurlo',
    default: false
  },
  [FeatureFlag.VERBOSE_LOGS]: {
    label: 'Log Dettagliati',
    description: 'Aumenta il livello di dettaglio dei log',
    default: true
  },
  [FeatureFlag.LEGAL_CONTEXT]: {
    label: 'Contesto Legale',
    description: 'Ottimizza la traduzione per testi legali/formali',
    default: true
  },
  [FeatureFlag.FAST_MODE]: {
    label: 'Modalità Veloce',
    description: 'Usa modelli Flash per maggiore velocità',
    default: false,
    requiresProvider: 'gemini'
  },
  [FeatureFlag.PRO_VERIFICATION]: {
    label: 'Verifica Pro',
    description: 'Usa modelli Pro per la verifica (più lento, più accurato)',
    default: false,
    requiresProvider: 'gemini'
  },
  [FeatureFlag.SEQUENTIAL_CONTEXT]: {
    label: 'Contesto Sequenziale',
    description: 'Mantiene il contesto tra le pagine',
    default: true
  },
  [FeatureFlag.EXPORT_PREVIEW]: {
    label: 'Anteprima Export',
    description: 'Mostra anteprima dopo l\'export',
    default: false
  }
};

export class FeatureManager {
  private static instance: FeatureManager;

  private constructor() {}

  public static getInstance(): FeatureManager {
    if (!FeatureManager.instance) {
      FeatureManager.instance = new FeatureManager();
    }
    return FeatureManager.instance;
  }

  public isFeatureEnabled(feature: FeatureFlag, settings: AISettings): boolean {
    const status = this.getFeatureStatus(feature, settings);
    return status === 'enabled';
  }

  public getFeatureStatus(feature: FeatureFlag, settings: AISettings): FeatureStatus {
    // Check provider requirements
    const metadata = FEATURE_METADATA[feature];
    if (metadata.requiresProvider && settings.provider !== metadata.requiresProvider) {
      return 'unavailable';
    }

    // Map feature to settings
    switch (feature) {
      case FeatureFlag.QUALITY_CHECK:
        return settings.qualityCheck?.enabled ? 'enabled' : 'disabled';
      case FeatureFlag.CONSULTATION_MODE:
        return settings.consultationMode ? 'enabled' : 'disabled';
      case FeatureFlag.VERBOSE_LOGS:
        return settings.verboseLogs ? 'enabled' : 'disabled';
      case FeatureFlag.LEGAL_CONTEXT:
        return settings.legalContext ? 'enabled' : 'disabled';
      case FeatureFlag.FAST_MODE:
        return settings.fastMode ? 'enabled' : 'disabled';
      case FeatureFlag.PRO_VERIFICATION:
        return settings.proVerification ? 'enabled' : 'disabled';
      case FeatureFlag.SEQUENTIAL_CONTEXT:
        return settings.sequentialContext ? 'enabled' : 'disabled';
      case FeatureFlag.EXPORT_PREVIEW:
        return settings.exportOptions?.previewInReader ? 'enabled' : 'disabled';
      default:
        return metadata.default ? 'enabled' : 'disabled';
    }
  }

  public getMetadata(feature: FeatureFlag): FeatureMetadata {
    return FEATURE_METADATA[feature];
  }
}

export const featureManager = FeatureManager.getInstance();
