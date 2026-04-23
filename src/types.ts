
export type AIProvider = 'gemini' | 'openai' | 'claude' | 'groq' | 'modal' | 'zai' | 'openrouter' | 'custom';

export type ApiFormat = 'openai' | 'anthropic' | 'gemini' | 'zhipu';

export interface CustomProviderConfig {
  id: string;
  name: string;
  apiFormat: ApiFormat;
  baseUrl: string;
  model: string;
  apiKey: string;
  concurrencyLimit?: number;
}

export type GeminiModel =
  | 'gemini-3.1-pro-preview'
  | 'gemini-3.1-flash-preview'
  | 'gemini-3-flash-preview'
  | 'gemini-3.1-flash-lite-preview'
  | 'gemini-2.5-pro'
  | 'gemini-2.5-flash'
  | 'gemini-2.5-flash-lite'
  | string;

export type GroqModel =
  | 'llama-3.1-8b-instant'
  | 'llama-3.3-70b-versatile'
  | 'meta-llama/llama-4-scout-17b-16e-instruct'
  | 'openai/gpt-oss-120b'
  | 'openai/gpt-oss-20b'
  | 'qwen/qwen3-32b'
  | string;

export interface CustomModel {
  id: string;
  name: string;
  provider: AIProvider;
  category?: 'flash' | 'pro' | 'standard' | 'mini';
  pricing?: { input: number; output: number };
  features?: string;
  isCustom: boolean;
}

// Missing OpenAI related types added to fix import errors
export type OpenAIModel = string;
export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high';
export type VerbosityLevel = 'low' | 'medium' | 'high';
export type SettingsSection = 'aiRoles' | 'apiKeys' | 'testAi' | 'prompts' | 'translationLogic' | 'costs' | 'libraryTrash' | 'exportApp' | 'logsDiagnostic' | 'admin' | 'modelsInUse' | 'userPermissions' | 'userApiKeys';

/**
 * Permessi che l'admin concede agli utenti non-admin.
 * Se un provider è presente nella mappa, l'utente può usarlo inserendo la propria API key,
 * ma è limitato al singolo `model` scelto dall'admin per quel provider.
 * Se la mappa è assente o vuota, l'utente non può usare nessun provider in modalità "user".
 */
export type UserPermissions = Partial<Record<AIProvider, { model: string }>>;

export type ClaudeModel =
  | 'claude-3-7-sonnet-20250219'
  | 'claude-3-5-sonnet-20241022'
  | 'claude-3-5-sonnet-20240620'
  | 'claude-3-5-haiku-20241022'
  | 'claude-3-opus-20240229'
  | 'claude-3-haiku-20240307'
  | string;

export interface AISettings {
  provider: AIProvider; // Modello primario di traduzione (ereditato per compatibilità)
  translationConcurrency?: number;
  sequentialContext?: boolean;
  qualityCheck?: {
    enabled: boolean;
    verifierProvider: AIProvider;
    verifierModel: string;
    maxAutoRetries: number;
  };
  metadataExtraction?: {
    enabled: boolean;
    provider: AIProvider;
    model: string;
  };
  gemini: {
    apiKey: string;
    model: GeminiModel;
    thinkingLevel?: 'minimal' | 'low' | 'medium' | 'high';
  };
  fastMode?: boolean;
  proVerification?: boolean;
  forceFixTranslationModel?: string;
  openai: {
    apiKey: string;
    model: OpenAIModel;
    reasoningEffort: ReasoningEffort;
    verbosity: VerbosityLevel;
  };
  claude: {
    apiKey: string;
    model: ClaudeModel;
  };
  groq: {
    apiKey: string;
    model: GroqModel;
  };
  modal: {
    apiKey: string;
  };
  openrouter: {
    apiKey: string;
    model: string;
  };
  zai: {
    apiKey: string;
    model: string;
  };
  customProviders?: CustomProviderConfig[];
  activeCustomProviderId?: string;
  customModels?: CustomModel[];
  legalContext?: boolean;
  customPrompt?: string;
  customVerificationPrompt?: string;
  customMetadataPrompt?: string;
  disabledProviders?: AIProvider[];
  enableClaudeOpusFast?: boolean;
  verboseLogs?: boolean;
  consultationMode?: boolean;
  customProjectsPath?: string;
  exportOptions?: {
    splitSpreadIntoTwoPages: boolean;
    insertBlankPages: boolean;
    outputFormat: 'A4' | 'original';
    previewInReader?: boolean;
  };
  modelTests?: {
    lastTestAt?: number;
    results: Array<{
      role: 'primary' | 'secondary' | 'metadata';
      provider: AIProvider;
      model: string;
      status: 'success' | 'error' | 'testing';
      message?: string;
      timestamp: number;
    }>;
  };
  /**
   * Permessi concessi dall'admin agli utenti non-admin.
   * Vedi UserPermissions per la semantica (un solo modello per provider).
   */
  userPermissions?: UserPermissions;
  /** Log diagnostico traduzioni: salva immagine, prompt e risultato per ogni pagina */
  translationDiagnosticLog?: boolean;
  /** Traduzione accurata: invia immagini a risoluzione piena (no downscale), massima qualità OCR ma più token */
  fullResolutionMode?: boolean;
  /** Opzione globale per splittare le pagine a doppia colonna */
  splitDoubleColumns?: boolean;
}

export type VerificationState = 'idle' | 'verifying' | 'verified' | 'failed';
export type VerificationSeverity = 'ok' | 'minor' | 'severe';

export interface PageVerification {
  state: VerificationState;
  severity?: VerificationSeverity;
  summary?: string;
  evidence?: string[];
  annotations?: Array<Pick<PageAnnotation, 'originalText' | 'comment' | 'type'>>;
  retryHint?: string;
  changed?: boolean;
  checkedAt?: number;
  autoRetryActive?: boolean;
  postRetryFailed?: boolean;
  runId?: number;
  startedAt?: number;
  progress?: string;
}

export interface PageAnnotation {
  id: string;
  originalText: string;
  comment: string;
  type: 'error' | 'doubt' | 'suggestion';
}

export interface PageStatus {
  loading?: string;
  processing?: string;
  error?: boolean | string;
}

export interface PageReplacement {
  filePath: string;
  sourcePage: number;
  fileName?: string;
  updatedAt: number;
}

export interface TranslationResult {
  text: string;
  annotations: PageAnnotation[];
  modelUsed?: string;
  diagnosticPrompt?: string;
  diagnosticUserInstruction?: string;
}

export interface LogEntry {
  id: string;
  timestamp: number;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

export interface Group {
  id: string;
  name: string;
}

export interface ReadingProgress {
  fileId?: string;
  fileName: string;
  originalFilePath?: string;
  lastPage: number;
  totalPages?: number;
  timestamp: number;
  inputLanguage?: string;
  projectMetrics?: { totalCost: number; translatedPages: number; verifiedPages: number; totalCalls?: number; lastUpdated?: number };
  translations?: Record<number, string>;
  annotations?: Record<number, PageAnnotation[]>;
  verifications?: Record<number, PageVerification>;
  pageReplacements?: Record<number, PageReplacement>;
  rotations?: Record<number, number>;
  pageDims?: Record<number, { width: number; height: number }>;
  pageImages?: {
    sources?: Record<number, string>;
    crops?: Record<number, string>;
  };
  translationsMeta?: Record<number, { model: string; savedAt: number }>;
  verificationsMeta?: Record<number, { model: string; savedAt: number }>;
  userHighlights?: Record<number, UserHighlight[]>;
  userNotes?: Record<number, UserNote[]>;
  hasSafePdf?: boolean;
  thumbnail?: string;
  groups?: string[];
  fingerprint?: string;
  hasCustomCover?: boolean;
  coverSource?: 'isbn' | 'custom' | 'generated' | 'firstpage';
  isbn?: string;
}

export interface PDFMetadata {
  name: string;
  size: number;
  totalPages: number;
  year?: string;
  author?: string;
  title?: string;
  isbn?: string;
}

export interface UserHighlight {
  id: string;
  page: number;
  start: number;
  end: number;
  text: string;
  quoteExact?: string;
  quotePrefix?: string;
  quoteSuffix?: string;
  color?: string;
  createdAt: number;
  // Coordinate PDF per zoom-indipendenza (Adobe-like)
  pdfRect?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface UserNote {
  id: string;
  page: number;
  start: number;
  end: number;
  text: string;
  content: string;
  createdAt: number;
}

export interface UserAnnotationsState {
  userHighlights?: Record<number, UserHighlight[]>;
  userNotes?: Record<number, UserNote[]>;
}

export interface TrashItem {
  trashId: string;
  fileId: string;
  fileName: string;
  deletedAt: number;
  daysLeft?: number;
  originalPath: string;
}
