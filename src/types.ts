
export type AIProvider = 'gemini' | 'openai';

export type GeminiModel = 
  | 'gemini-3-pro-preview'
  | 'gemini-3-flash-preview'
  | 'gemini-2.0-flash' 
  | 'gemini-2.0-flash-lite-preview-02-05' 
  | 'gemini-2.0-pro-exp-02-05'
  | 'gemini-1.5-flash' 
  | 'gemini-1.5-pro' 
  | 'gemini-2.0-flash-thinking-exp-01-21'
  | string;

// Missing OpenAI related types added to fix import errors
export type OpenAIModel = string;
export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high';
export type VerbosityLevel = 'low' | 'medium' | 'high';

export interface AISettings {
  provider: AIProvider;
  translationConcurrency?: number;
  qualityCheck?: {
    enabled: boolean;
    verifierModel: GeminiModel;
    maxAutoRetries: number;
  };
  gemini: {
    apiKey: string;
    model: GeminiModel;
  };
  openai: {
    apiKey: string;
    model: OpenAIModel;
    reasoningEffort: ReasoningEffort;
    verbosity: VerbosityLevel;
  };
  legalContext?: boolean;
  inputLanguageDefault?: string;
  verboseLogs?: boolean;
  customProjectsPath?: string;
  exportOptions?: {
    splitSpreadIntoTwoPages: boolean;
    insertBlankPages: boolean;
    outputFormat: 'A4' | 'original';
    previewInReader?: boolean;
  };
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
}

export interface LogEntry {
  id: string;
  timestamp: number;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

export interface ReadingProgress {
  fileId?: string;
  fileName: string;
  originalFilePath?: string;
  lastPage: number;
  totalPages?: number;
  timestamp: number;
  inputLanguage?: string;
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
}

export interface PDFMetadata {
  name: string;
  size: number;
  totalPages: number;
  year?: string;
  author?: string;
  title?: string;
}

export interface UserHighlight {
  id: string;
  page: number;
  start: number;
  end: number;
  text: string;
  color?: string;
  createdAt: number;
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
  originalPath: string;
}
