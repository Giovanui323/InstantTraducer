import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    X, Key, Check, Activity, Loader2, BrainCircuit, Zap, Info, RotateCcw,
    Trash2, Trash, Folder, FileDown, LogOut, Settings, Save, AlertCircle,
    ChevronRight, ChevronLeft, Search, Eye, Download, FileText, Layout,
    Languages, MessageSquare, Shield, Smartphone, Monitor, Database,
    Cpu, Clock, CreditCard, ExternalLink, Brain, Users
} from 'lucide-react';
import { AISettings, AIProvider, GeminiModel, ClaudeModel, GroqModel, SettingsSection } from '../types';
import {
    GEMINI_TRANSLATION_MODEL,
    GEMINI_TRANSLATION_FAST_MODEL,
    GEMINI_VERIFIER_MODEL,
    GEMINI_VERIFIER_PRO_MODEL,
    GEMINI_VERIFIER_FALLBACK_MODEL,
    DEFAULT_CONCURRENT_TRANSLATIONS,
    MAX_ALLOWED_CONCURRENCY,
    CLAUDE_MODELS_LIST,
    GROQ_MODELS_LIST,
    MODAL_MODELS_LIST,
    ZAI_MODELS_LIST,
    GEMINI_TRANSLATION_FLASH_MODEL,
    GEMINI_MODELS_LIST,
    OPENAI_MODELS_LIST,
    availableGeminiModels,
    availableClaudeModels,
    isGroqVisionModel,
    DEFAULT_TRANSLATION_PROMPT_TEMPLATE,
    OPENROUTER_MODELS_LIST
} from '../constants';
import { CustomModelManager } from './CustomModelManager';
import { LogViewer } from './LogViewer';
import { testGeminiConnection } from '../services/geminiService';
import { testOpenAIConnection } from '../services/openaiService';
import { testClaudeConnection } from '../services/claudeService';
import { testGroqConnection } from '../services/groqService';
import { testOpenRouterConnection } from '../services/openrouterService';
import { validateSettings } from '../services/configValidation';
import * as usageTracker from '../services/usageTracker';
import { getGeminiTranslateSystemPrompt, getGeminiTranslateUserInstruction } from '../services/prompts/gemini';
import { getOpenAITranslateSystemPrompt, getOpenAITranslateUserInstruction } from '../services/prompts/openai';
import { getClaudeTranslateSystemPrompt, getClaudeTranslateUserInstruction } from '../services/prompts/claude';
import { getGroqTranslateSystemPrompt, getGroqTranslateUserInstruction } from '../services/prompts/groq';
import { getVerifyQualitySystemPrompt } from '../services/verifierPrompts';
import { getMetadataExtractionPrompt } from '../services/prompts/shared';
import { SettingsSearchResults } from './settings/SettingsSearchResults';
import { filterSettingsSearchItems } from './settings/search';
import { ApiKeysSection, apiKeysSearchItems } from './settings/sections/ApiKeysSection';
import { TranslationLogicSection, translationLogicSearchItems } from './settings/sections/TranslationLogicSection';
import { AiRolesSection, aiRolesSearchItems } from './settings/sections/AiRolesSection';
import { AiDiagnosticSection } from './settings/sections/AiDiagnosticSection';
import { PromptsSection, promptsSearchItems } from './settings/sections/PromptsSection';
import { AdminSection } from './settings/sections/AdminSection';
import { ReadOnlyModelsSection } from './settings/sections/ReadOnlyModelsSection';
import { UserPermissionsSection } from './settings/sections/UserPermissionsSection';
import { UserApiKeysSection } from './settings/sections/UserApiKeysSection';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { ToggleSwitch } from './settings/ToggleSwitch';

// Sezioni visibili solo agli admin (gate UX con password in AdminSection).
const ADMIN_ONLY_SECTIONS: readonly SettingsSection[] = [
    'aiRoles', 'apiKeys', 'testAi', 'prompts', 'translationLogic', 'costs', 'logsDiagnostic', 'userPermissions'
];
const isAdminOnlySection = (s: SettingsSection) => ADMIN_ONLY_SECTIONS.includes(s);

// Sezioni riservate esclusivamente ai super-admin (password SUPERLUCA).
const SUPER_ADMIN_ONLY_SECTIONS: readonly SettingsSection[] = ['prompts'];
const isSuperAdminOnlySection = (s: SettingsSection) => SUPER_ADMIN_ONLY_SECTIONS.includes(s);

interface SettingsModalProps {
    settings: AISettings;
    onSave: (settings: AISettings) => Promise<void>;
    onClose: () => void;
    onRedoAll?: () => void;
    onConsolidate?: () => void;
    onRetroactiveRename?: () => void;
    onRetroactiveRenameAll?: () => void;
    onRefreshLibrary?: () => void;
    isLibraryView?: boolean;
    currentBookTitle?: string;
    showConfirm?: (title: string, message: string, onConfirm: () => void, type?: 'info' | 'danger') => void;
}

const areSettingsModalPropsEqual = (prev: SettingsModalProps, next: SettingsModalProps) => {
    return prev.settings === next.settings &&
           prev.isLibraryView === next.isLibraryView &&
           prev.currentBookTitle === next.currentBookTitle;
};

const SectionHeader = ({ title, description }: { title: string; description?: string }) => (
    <div className="space-y-1">
        <div className="text-sm font-bold text-txt-primary">{title}</div>
        {description && <div className="text-[11px] text-txt-muted leading-snug">{description}</div>}
    </div>
);

const Panel = ({ children }: { children: React.ReactNode }) => (
    <div className="rounded-2xl border border-border-muted bg-surface-3/40 shadow-surface-xl">
        {children}
    </div>
);

const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
    <div className={`rounded-xl border border-border-muted bg-surface-4/50 ${className}`}>
        {children}
    </div>
);

export const SettingsModal = React.memo(({
    settings,
    onSave,
    onClose,
    onRedoAll,
    onConsolidate,
    onRetroactiveRename,
    onRetroactiveRenameAll,
    onRefreshLibrary,
    isLibraryView,
    currentBookTitle,
    showConfirm
}: SettingsModalProps) => {
    // --- Admin gate ---
    const adminAuth = useAdminAuth();
    const { isAdmin, isSuperAdmin } = adminAuth;

    // --- Draft State ---
    const [draftSettings, setDraftSettings] = useState<AISettings>(settings);
    const [activeSection, setActiveSection] = useState<SettingsSection>(() => (isAdmin ? 'aiRoles' : 'modelsInUse'));
    const [isSaving, setIsSaving] = useState(false);
    const [settingsSearch, setSettingsSearch] = useState('');

    // Se l'utente perde l'accesso admin (o super-admin) mentre è dentro una sezione protetta, rimanda a una vista consentita.
    useEffect(() => {
        if (!isAdmin && isAdminOnlySection(activeSection)) {
            setActiveSection('modelsInUse');
        } else if (!isSuperAdmin && isSuperAdminOnlySection(activeSection)) {
            setActiveSection('aiRoles');
        }
    }, [isAdmin, isSuperAdmin, activeSection]);
    const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
    const [testMessage, setTestMessage] = useState('');
    const [showLogViewer, setShowLogViewer] = useState(false);

    // Health report state
    const [healthReport, setHealthReport] = useState<any>(null);
    const [isCheckingHealth, setIsCheckingHealth] = useState(false);

    // Derived states from draft
    const {
        provider,
        gemini,
        openai,
        claude,
        groq,
        qualityCheck,
        metadataExtraction,
        translationConcurrency,
        sequentialContext,
        legalContext,
        verboseLogs,
        customProjectsPath,
        customPrompt,
        exportOptions,
        modelTests,
        customModels
    } = draftSettings;

    const geminiKey = gemini?.apiKey || '';
    const geminiModel = gemini?.model || GEMINI_TRANSLATION_MODEL;
    const geminiThinkingLevel = gemini?.thinkingLevel || 'medium';

    const openAIKey = openai?.apiKey || '';
    const openAIModel = openai?.model || 'gpt-4o';
    const openAIReasoningEffort = openai?.reasoningEffort || 'medium';

    const claudeKey = claude?.apiKey || '';
    const claudeModel = claude?.model || 'claude-3-5-sonnet-20241022';

    const groqKey = groq?.apiKey || '';
    const groqModel = groq?.model || 'llama-3.3-70b-versatile';

    const openrouterKey = draftSettings.openrouter?.apiKey || '';
    const openrouterModel = draftSettings.openrouter?.model || 'anthropic/claude-sonnet-4.5';

    const qualityEnabled = qualityCheck?.enabled ?? true;
    const verifierProvider = qualityCheck?.verifierProvider || 'gemini';
    const qualityModel = qualityCheck?.verifierModel || GEMINI_VERIFIER_MODEL;
    const qualityMaxRetries = qualityCheck?.maxAutoRetries ?? 1;
    const proVerification = draftSettings.proVerification ?? false;

    const metadataEnabled = metadataExtraction?.enabled ?? true;
    const metadataProvider = metadataExtraction?.provider || 'gemini';
    const metadataModel = metadataExtraction?.model || GEMINI_TRANSLATION_FLASH_MODEL;

    const exportSplitSpread = exportOptions?.splitSpreadIntoTwoPages ?? true;
    const exportInsertBlank = exportOptions?.insertBlankPages ?? true;
    const exportFormat = exportOptions?.outputFormat || 'A4';
    const previewInReader = exportOptions?.previewInReader ?? true;

    // Remove separate states as they are part of draftSettings
    const fastMode = draftSettings.fastMode ?? false;
    const verboseEnabled = draftSettings.verboseLogs ?? true;

    // Helpers to update draft
    const updateDraft = useCallback((updates: Partial<AISettings>) => {
        setDraftSettings(prev => ({ ...prev, ...updates }));
    }, []);

    const setProvider = (p: AIProvider) => updateDraft({ provider: p });
    const setGeminiModel = (m: GeminiModel) => updateDraft({ gemini: { ...gemini, model: m, apiKey: geminiKey } });
    const setGeminiThinkingLevel = (l: 'minimal' | 'low' | 'medium' | 'high') => updateDraft({ gemini: { ...gemini, thinkingLevel: l, apiKey: geminiKey, model: geminiModel } });

    const setOpenAIModel = (m: string) => updateDraft({ openai: { ...openai, model: m, apiKey: openAIKey } });
    const setOpenAIReasoningEffort = (e: 'none' | 'low' | 'medium' | 'high') => updateDraft({ openai: { ...openai, reasoningEffort: e, apiKey: openAIKey, model: openAIModel } });

    const setClaudeModel = (m: string) => updateDraft({ claude: { ...claude, model: m as any, apiKey: claudeKey } });

    const setGroqModel = (m: GroqModel) => updateDraft({ groq: { ...groq, model: m, apiKey: groqKey } });

    const setQualityEnabled = (e: boolean) => updateDraft({ qualityCheck: { ...qualityCheck, enabled: e, verifierModel: qualityModel, verifierProvider, maxAutoRetries: qualityMaxRetries } });
    const setVerifierProvider = (p: AIProvider) => updateDraft({ qualityCheck: { ...qualityCheck, verifierProvider: p, enabled: qualityEnabled, verifierModel: qualityModel, maxAutoRetries: qualityMaxRetries } });
    const setQualityModel = (m: string) => updateDraft({ qualityCheck: { ...qualityCheck, verifierModel: m, enabled: qualityEnabled, verifierProvider, maxAutoRetries: qualityMaxRetries } });
    const setQualityMaxRetries = (r: number) => updateDraft({ qualityCheck: { ...qualityCheck, maxAutoRetries: r, enabled: qualityEnabled, verifierProvider, verifierModel: qualityModel } });
    const setProVerification = (v: boolean) => updateDraft({ proVerification: v });
    const setForceFixTranslationModel = (m: string) => updateDraft({ forceFixTranslationModel: m });

    const setMetadataEnabled = (e: boolean) => updateDraft({ metadataExtraction: { ...metadataExtraction, enabled: e, provider: metadataProvider, model: metadataModel } });
    const setMetadataProvider = (p: AIProvider) => updateDraft({ metadataExtraction: { ...metadataExtraction, provider: p, enabled: metadataEnabled, model: metadataModel } });
    const setMetadataModel = (m: string) => updateDraft({ metadataExtraction: { ...metadataExtraction, model: m, enabled: metadataEnabled, provider: metadataProvider } });

    const setTranslationConcurrency = (c: number) => updateDraft({ translationConcurrency: c });
    const setSequentialContext = (s: boolean) => updateDraft({ sequentialContext: s });
    const setLegalContext = (l: boolean) => updateDraft({ legalContext: l });
    const setVerboseEnabled = (v: boolean) => updateDraft({ verboseLogs: v });
    const [diagnosticLogCount, setDiagnosticLogCount] = useState(0);
    const diagnosticLogEnabled = draftSettings.translationDiagnosticLog ?? false;
    const setDiagnosticLogEnabled = (v: boolean) => {
        updateDraft({ translationDiagnosticLog: v });
        import('../services/translation/TranslationDiagnosticLogger').then(({ setDiagnosticLogEnabled: setServiceEnabled }) => {
            setServiceEnabled(v);
        });
        if (!v) setDiagnosticLogCount(0);
    };
    useEffect(() => {
        if (!diagnosticLogEnabled || activeSection !== 'logsDiagnostic') return;
        let cancelled = false;
        import('../services/translation/TranslationDiagnosticLogger').then(({ getDiagnosticEntriesCount }) => {
            if (cancelled) return;
            setDiagnosticLogCount(getDiagnosticEntriesCount());
            const interval = setInterval(() => setDiagnosticLogCount(getDiagnosticEntriesCount()), 2000);
            return () => clearInterval(interval);
        });
        return () => { cancelled = true; };
    }, [diagnosticLogEnabled, activeSection]);
    const setCustomProjectsPath = (p: string) => updateDraft({ customProjectsPath: p });
    const setCustomPrompt = (p: string) => updateDraft({ customPrompt: p });
    const setCustomVerificationPrompt = (p: string) => updateDraft({ customVerificationPrompt: p });
    const setCustomMetadataPrompt = (p: string) => updateDraft({ customMetadataPrompt: p });
    const setFastMode = (f: boolean) => updateDraft({ fastMode: f });
    const setCustomModels = (m: any[]) => updateDraft({ customModels: m });

    const setExportSplitSpread = (s: boolean) => updateDraft({ exportOptions: { ...exportOptions, splitSpreadIntoTwoPages: s, insertBlankPages: exportInsertBlank, outputFormat: exportFormat, previewInReader } });
    const setExportInsertBlank = (i: boolean) => updateDraft({ exportOptions: { ...exportOptions, insertBlankPages: i, splitSpreadIntoTwoPages: exportSplitSpread, outputFormat: exportFormat, previewInReader } });
    const setExportFormat = (f: 'A4' | 'original') => updateDraft({ exportOptions: { ...exportOptions, outputFormat: f, splitSpreadIntoTwoPages: exportSplitSpread, insertBlankPages: exportInsertBlank, previewInReader } });
    const setPreviewInReader = (p: boolean) => updateDraft({ exportOptions: { ...exportOptions, previewInReader: p, splitSpreadIntoTwoPages: exportSplitSpread, insertBlankPages: exportInsertBlank, outputFormat: exportFormat } });

    // --- Actions ---
    const handleTestConnection = async () => {
        if (testStatus === 'testing') return;
        setTestStatus('testing');
        setTestMessage('');

        try {
            let result: { success: boolean; message: string };
            const model = provider === 'gemini' ? geminiModel
                : provider === 'openai' ? openAIModel
                : provider === 'claude' ? claudeModel
                : provider === 'openrouter' ? openrouterModel
                : groqModel;

            if (provider === 'gemini') {
                result = await testGeminiConnection(geminiKey, model as GeminiModel);
            } else if (provider === 'openai') {
                result = await testOpenAIConnection(openAIKey, model);
            } else if (provider === 'claude') {
                result = await testClaudeConnection(claudeKey, model);
            } else if (provider === 'openrouter') {
                result = await testOpenRouterConnection(openrouterKey, model);
            } else {
                result = await testGroqConnection(groqKey, model as GroqModel);
            }

            setTestStatus(result.success ? 'success' : 'error');
            setTestMessage(result.message);
        } catch (e: any) {
            setTestStatus('error');
            setTestMessage(e.message || 'Errore imprevisto durante il test.');
        }
    };

    const [isTestingAll, setIsTestingAll] = useState(false);
    const handleTestAllModels = async () => {
        if (isTestingAll) return;
        setIsTestingAll(true);

        // Imposta il progetto attivo come "Test Diagnostico" per il tracking
        if (typeof window !== 'undefined') {
            try {
                usageTracker.setActiveProject('Test Diagnostico');
            } catch (e) {
                console.warn('Could not set active project for test:', e);
            }
        }

        const roles: Array<{ role: 'primary' | 'secondary' | 'metadata', provider: AIProvider, model: string }> = [
            { role: 'primary', provider, model: provider === 'gemini' ? geminiModel : provider === 'openai' ? openAIModel : provider === 'claude' ? claudeModel : provider === 'openrouter' ? openrouterModel : groqModel },
            { role: 'secondary', provider: verifierProvider, model: qualityModel },
            { role: 'metadata', provider: metadataProvider, model: metadataModel }
        ];

        const newResults: AISettings['modelTests'] = {
            lastTestAt: Date.now(),
            results: roles.map(r => ({ ...r, status: 'testing', timestamp: Date.now() }))
        };
        updateDraft({ modelTests: newResults });

        const results = [...newResults.results];
        for (let i = 0; i < roles.length; i++) {
            const r = roles[i];
            const key = r.provider === 'gemini' ? geminiKey : r.provider === 'openai' ? openAIKey : r.provider === 'claude' ? claudeKey : r.provider === 'openrouter' ? openrouterKey : groqKey;

            let res;
            try {
                if (r.provider === 'gemini') res = await testGeminiConnection(key, r.model as any);
                else if (r.provider === 'openai') res = await testOpenAIConnection(key, r.model);
                else if (r.provider === 'claude') res = await testClaudeConnection(key, r.model);
                else if (r.provider === 'openrouter') res = await testOpenRouterConnection(key, r.model);
                else res = await testGroqConnection(key, r.model as any);

                results[i] = { ...r, status: res.success ? 'success' : 'error', message: res.message, timestamp: Date.now() };
            } catch (e: any) {
                results[i] = { ...r, status: 'error', message: e.message, timestamp: Date.now() };
            }
            updateDraft({ modelTests: { ...newResults, results: [...results] } });
        }
        setIsTestingAll(false);
    };

    const handleChangeProjectsBaseDir = async () => {
        try {
            if (!window.electronAPI) return;
            const newPath = await window.electronAPI.selectDirectoryDialog();
            if (newPath) setCustomProjectsPath(newPath);
        } catch (e) {
            console.error('Errore selezione cartella:', e);
        }
    };

    const handleResetProjectsBaseDirToDefault = () => setCustomProjectsPath('');

    const [trashItems, setTrashItems] = useState<any[]>([]);
    const [isLoadingTrash, setIsLoadingTrash] = useState(false);
    const [isActionRunning, setIsActionRunning] = useState(false);

    const loadTrash = useCallback(async () => {
        setIsLoadingTrash(true);
        try {
            if (window.electronAPI) {
                const items = await window.electronAPI.getTrashContents();
                setTrashItems(items || []);
            }
        } catch (e) {
            console.error('Errore caricamento cestino:', e);
        } finally {
            setIsLoadingTrash(false);
        }
    }, []);

    useEffect(() => {
        if (activeSection === 'libraryTrash') loadTrash();
    }, [activeSection, loadTrash]);

    const handleRestore = async (trashId: string) => {
        setIsActionRunning(true);
        try {
            await window.electronAPI.restoreTrashItem(trashId);
            await loadTrash();
            if (onRefreshLibrary) onRefreshLibrary();
        } finally {
            setIsActionRunning(false);
        }
    };

    const handleDeletePermanently = async (trashId: string) => {
        if (!confirm('Eliminare definitivamente questo progetto? L\'operazione non è annullabile.')) return;
        setIsActionRunning(true);
        try {
            await window.electronAPI.deleteTrashItemPermanently(trashId);
            await loadTrash();
        } finally {
            setIsActionRunning(false);
        }
    };

    const handleEmptyTrash = async () => {
        if (!confirm('Svuotare interamente il cestino?')) return;
        setIsActionRunning(true);
        try {
            await window.electronAPI.emptyTrash();
            await loadTrash();
        } finally {
            setIsActionRunning(false);
        }
    };

    const handleRestoreAll = async () => {
        setIsActionRunning(true);
        try {
            await window.electronAPI.restoreAllTrashItems();
            await loadTrash();
            if (onRefreshLibrary) onRefreshLibrary();
        } finally {
            setIsActionRunning(false);
        }
    };

    const loadHealthReport = async () => {
        setIsCheckingHealth(true);
        try {
            if (window.electronAPI) {
                const [sys, lib] = await Promise.all([
                    window.electronAPI.getSystemHealth?.(),
                    window.electronAPI.getLibraryHealth()
                ]);

                const processPrivateMB = typeof sys?.processMemory?.private === 'number' ? (sys.processMemory.private / 1024) : null;
                const processResidentMB = typeof sys?.processMemory?.residentSet === 'number' ? (sys.processMemory.residentSet / 1024) : null;
                const memText = [
                    processPrivateMB != null ? `private=${processPrivateMB.toFixed(1)}MB` : null,
                    processResidentMB != null ? `rss=${processResidentMB.toFixed(1)}MB` : null
                ].filter(Boolean).join(' • ') || 'N/A';

                setHealthReport({
                    appVersion: sys?.appVersion || (await window.electronAPI.getAppVersion?.()),
                    platform: sys?.platform || window.electronAPI.platform,
                    arch: sys?.arch || 'unknown',
                    isPackaged: Boolean(sys?.isPackaged),
                    dbStatus: 'ok',
                    dbPath: sys?.translationsPath || 'N/A',
                    memory: memText,
                    details: JSON.stringify({ system: sys, library: lib }, null, 2)
                });
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsCheckingHealth(false);
        }
    };

    useEffect(() => {
        if (activeSection === 'logsDiagnostic') loadHealthReport();
    }, [activeSection]);

    const [metrics, setMetrics] = useState<any>(null);
    const [modelCostSort, setModelCostSort] = useState<'total' | 'avg' | 'estimated'>('total');
    const [modelCostSortDir, setModelCostSortDir] = useState<'asc' | 'desc'>('desc');
    useEffect(() => {
        if (activeSection === 'costs') {
            const m = usageTracker.getUsageMetrics();
            setMetrics(m);
        }
    }, [activeSection]);

    const clearUsageSession = () => {
        if (confirm("Sei sicuro di voler azzerare le statistiche di costo di questa sessione?")) {
            usageTracker.clearUsageSession();
            setMetrics(usageTracker.getUsageMetrics());
        }
    };

    const [isConsolidateRunning, setIsConsolidateRunning] = useState(false);
    const [isRenameLegacyRunning, setIsRenameLegacyRunning] = useState(false);
    const [isRenameAllRunning, setIsRenameAllRunning] = useState(false);

    // Validation
    const validationResult = useMemo(() => validateSettings(draftSettings), [draftSettings]);
    const isDirty = useMemo(() => JSON.stringify(draftSettings) !== JSON.stringify(settings), [draftSettings, settings]);
    const providerKeyPresent = !!(
        (provider === 'gemini' && geminiKey.trim()) ||
        (provider === 'openai' && openAIKey.trim()) ||
        (provider === 'claude' && claudeKey.trim()) ||
        (provider === 'groq' && groqKey.trim()) ||
        (provider === 'modal' && (draftSettings.modal?.apiKey || '').trim()) ||
        (provider === 'zai' && (draftSettings.zai?.apiKey || '').trim()) ||
        (provider === 'openrouter' && (draftSettings.openrouter?.apiKey || '').trim()) ||
        (provider === 'custom' && draftSettings.customProviders?.find(cp => cp.id === draftSettings.activeCustomProviderId)?.apiKey?.trim())
    );
    const canSave = providerKeyPresent && validationResult.valid && testStatus !== 'testing' && !isSaving;

    const saveDraftSettings = async () => {
        if (isSaving) return;
        setIsSaving(true);
        try {
            await onSave(draftSettings);
        } catch (e) {
            console.error(e);
        } finally {
            setIsSaving(false);
        }
    };

    const sectionsList = useMemo(() => {
        const full: Array<{ id: SettingsSection; label: string; icon: React.ReactNode }> = [
            { id: 'aiRoles', label: 'Modelli & Ruoli', icon: <BrainCircuit size={14} /> },
            { id: 'apiKeys', label: 'API Keys', icon: <Key size={14} /> },
            { id: 'testAi', label: 'Test AI & Connessione', icon: <Activity size={14} /> },
            { id: 'prompts', label: 'Gestione Prompt', icon: <MessageSquare size={14} /> },
            { id: 'translationLogic', label: 'Traduzione & Logica', icon: <Zap size={14} /> },
            { id: 'costs', label: 'Info & Costi Modelli', icon: <Info size={14} /> },
            { id: 'userPermissions', label: 'Permessi Utente', icon: <Users size={14} /> },
            { id: 'libraryTrash', label: 'Libreria & Cestino', icon: <Folder size={14} /> },
            { id: 'exportApp', label: 'Export & App', icon: <FileDown size={14} /> },
            { id: 'logsDiagnostic', label: 'Log & Diagnostica', icon: <Settings size={14} /> },
            { id: 'admin', label: 'Admin', icon: <Shield size={14} /> },
        ];
        if (isAdmin) {
            // Admin: tutte le sezioni operative + la sezione Admin per poter bloccare.
            // "Gestione Prompt" è riservata ai super-admin.
            return full.filter(s => s.id !== 'prompts' || isSuperAdmin);
        }
        // Non-admin: vista read-only dei modelli, le proprie API keys (se autorizzate), libreria/cestino, export e area admin per lo sblocco.
        const visible: SettingsSection[] = ['modelsInUse', 'userApiKeys', 'libraryTrash', 'exportApp', 'admin'];
        const extras: Array<{ id: SettingsSection; label: string; icon: React.ReactNode }> = [
            { id: 'modelsInUse', label: 'Modelli in uso', icon: <BrainCircuit size={14} /> },
            { id: 'userApiKeys', label: 'Le tue API Keys', icon: <Key size={14} /> },
        ];
        return [...extras, ...full].filter(s => visible.includes(s.id));
    }, [isAdmin, isSuperAdmin]);

    const filteredSectionsList = sectionsList;

    const settingsSearchItems = useMemo(() => ([
        ...aiRolesSearchItems,
        ...apiKeysSearchItems,
        ...(isSuperAdmin ? promptsSearchItems : []),
        ...translationLogicSearchItems
    ]), [isSuperAdmin]);

    const settingsSearchResults = useMemo(() => {
        return filterSettingsSearchItems(settingsSearchItems, settingsSearch);
    }, [settingsSearchItems, settingsSearch]);

    const navigateToSearchItem = useCallback((item: any) => {
        setActiveSection(item.sectionId as SettingsSection);
        setTimeout(() => {
            const el = document.getElementById(`setting-${item.anchorId}`);
            if (el) {
                el.scrollIntoView({ block: 'center', behavior: 'smooth' });
                el.classList.add('ring-2', 'ring-accent/40');
                setTimeout(() => {
                    el.classList.remove('ring-2', 'ring-accent/40');
                }, 1200);
            }
        }, 50);
    }, []);

    const requestClose = () => {
        if (!isDirty) {
            onClose();
            return;
        }

        const proceed = () => onClose();

        if (showConfirm) {
            showConfirm(
                'Modifiche non salvate',
                'Hai modifiche non salvate. Vuoi uscire senza salvare?',
                proceed,
                'info'
            );
            return;
        }

        if (confirm('Hai modifiche non salvate. Vuoi uscire senza salvare?')) {
            proceed();
        }
    };

    const closeAndThen = (fn: () => void) => {
        const proceed = () => {
            onClose();
            fn();
        };

        if (!isDirty) {
            proceed();
            return;
        }

        if (showConfirm) {
            showConfirm(
                'Modifiche non salvate',
                'Hai modifiche non salvate. Vuoi continuare senza salvare?',
                proceed,
                'info'
            );
            return;
        }

        if (confirm('Hai modifiche non salvate. Vuoi continuare senza salvare?')) {
            proceed();
        }
    };

    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-surface-0/50 backdrop-blur-sm p-4 animate-fade-in">
            <div className="w-full max-w-5xl max-h-[calc(100vh-2rem)] overflow-hidden animate-fade-in-scale flex flex-col rounded-2xl border border-border-muted bg-surface-1 shadow-surface-2xl">
                <div className="px-6 py-5 border-b border-border-muted flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-surface-4/50 flex items-center justify-center text-txt-primary border border-border-muted">
                            <Key size={20} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-lg font-bold text-txt-primary">Impostazioni</h2>
                                {isDirty && (
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-warning/10 text-warning border border-warning/20">
                                        Modifiche non salvate
                                    </span>
                                )}
                            </div>
                            <p className="text-[11px] text-txt-muted">Configura AI, traduzione, libreria, export e diagnostica</p>
                        </div>
                    </div>
                    {isAdmin && (
                        <div className="hidden md:block w-[380px] px-3">
                            <div className="relative">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-faint" />
                                <input
                                    value={settingsSearch}
                                    onChange={(e) => setSettingsSearch(e.target.value)}
                                    placeholder="Cerca nelle impostazioni…"
                                    className="w-full rounded-xl border border-border-muted bg-surface-4/50 pl-9 pr-3 py-2 text-[12px] text-txt-primary placeholder:text-txt-faint outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
                                />
                                <div className="absolute top-full left-0 right-0 z-[400]">
                                    <SettingsSearchResults
                                        query={settingsSearch}
                                        results={settingsSearchResults}
                                        onSelect={navigateToSearchItem}
                                        onClear={() => setSettingsSearch('')}
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                    <div className="flex items-center gap-2">
                        {isDirty && (
                            <button
                                onClick={saveDraftSettings}
                                disabled={!canSave}
                                className="px-3 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl transition-all duration-200 flex items-center gap-2"
                            >
                                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                                {isSaving ? 'Salvo...' : 'Salva'}
                            </button>
                        )}
                        <button onClick={requestClose} className="p-2 hover:bg-surface-4/50 rounded-xl text-txt-muted hover:text-txt-primary transition-colors duration-200 border border-transparent hover:border-border-muted">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
                    <div className="hidden md:block w-72 border-r border-border-muted p-4 shrink-0 bg-surface-2/50">
                        <div className="text-[10px] font-bold text-txt-muted uppercase tracking-wider mb-3">Sezioni</div>
                        <nav className="space-y-1">
                            {filteredSectionsList.map((s) => (
                                <button
                                    key={s.id}
                                    onClick={() => setActiveSection(s.id)}
                                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-left text-xs font-bold transition-all duration-200 border ${activeSection === s.id
                                        ? 'bg-surface-4/50 text-txt-primary border-border shadow-surface-lg'
                                        : 'bg-transparent text-txt-muted border-transparent hover:border-border-muted hover:bg-surface-4/50 hover:text-txt-primary'
                                        }`}
                                >
                                    <span className={`${activeSection === s.id ? 'text-txt-primary' : 'text-txt-faint'}`}>{s.icon}</span>
                                    <span className="truncate">{s.label}</span>
                                </button>
                            ))}
                        </nav>
                    </div>

                    <div className="flex-1 min-h-0 overflow-y-auto p-6 pr-4 custom-scrollbar">
                        <div className="md:hidden mb-4">
                            {isAdmin && (
                                <div className="mb-3">
                                    <div className="relative">
                                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-faint" />
                                        <input
                                            value={settingsSearch}
                                            onChange={(e) => setSettingsSearch(e.target.value)}
                                            placeholder="Cerca nelle impostazioni…"
                                            className="w-full rounded-xl border border-border-muted bg-surface-4/50 pl-9 pr-3 py-2.5 text-[12px] text-txt-primary placeholder:text-txt-faint outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
                                        />
                                        <div className="absolute top-full left-0 right-0 z-[400]">
                                            <SettingsSearchResults
                                                query={settingsSearch}
                                                results={settingsSearchResults}
                                                onSelect={navigateToSearchItem}
                                                onClear={() => setSettingsSearch('')}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}
                            <label className="text-[10px] font-bold text-txt-muted uppercase tracking-wider">Sezione</label>
                            <select
                                value={activeSection}
                                onChange={(e) => setActiveSection(e.target.value as SettingsSection)}
                                className="mt-2 w-full bg-surface-4/50 border border-border-muted rounded-xl py-3 px-3 text-xs text-txt-primary focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-all duration-200"
                            >
                                {sectionsList.map(s => (
                                    <option key={s.id} value={s.id}>{s.label}</option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-6">
                            {activeSection === 'admin' && (
                                <AdminSection auth={adminAuth} />
                            )}

                            {activeSection === 'modelsInUse' && !isAdmin && (
                                <ReadOnlyModelsSection settings={draftSettings} />
                            )}

                            {activeSection === 'userApiKeys' && !isAdmin && (
                                <UserApiKeysSection draftSettings={draftSettings} updateDraft={updateDraft} />
                            )}

                            {activeSection === 'userPermissions' && isAdmin && (
                                <UserPermissionsSection draftSettings={draftSettings} updateDraft={updateDraft} />
                            )}

                            {activeSection === 'apiKeys' && isAdmin && (
                                <ApiKeysSection draftSettings={draftSettings} updateDraft={updateDraft} />
                            )}

                            {activeSection === 'testAi' && isAdmin && (
                                <AiDiagnosticSection draftSettings={draftSettings} updateDraft={updateDraft} />
                            )}

                            {activeSection === 'prompts' && isSuperAdmin && (
                                <PromptsSection draftSettings={draftSettings} updateDraft={updateDraft} />
                            )}

                            {activeSection === 'aiRoles' && isAdmin && (
                                <AiRolesSection draftSettings={draftSettings} updateDraft={updateDraft} />
                            )}

                            {activeSection === 'costs' && isAdmin && (
                                <div className="space-y-8 animate-fade-in">

                                    {/* --- 1. CONFIGURAZIONE ATTIVA --- */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="bg-success/10 border border-success/20 rounded-xl p-4 relative overflow-hidden">
                                            <div className="text-[10px] uppercase font-bold tracking-widest text-success/80 mb-2">Traduzione Primaria</div>
                                            <div className="text-sm font-bold text-success">
                                                {provider === 'gemini' ? 'Google Gemini' : provider === 'claude' ? 'Anthropic Claude' : provider === 'groq' ? 'Groq' : provider === 'modal' ? 'Modal (GLM-5.1)' : provider === 'zai' ? 'Z.ai (Zhipu AI)' : provider === 'openrouter' ? 'OpenRouter' : provider === 'custom' ? (draftSettings.customProviders?.find(cp => cp.id === draftSettings.activeCustomProviderId)?.name || 'Custom') : 'OpenAI'}
                                            </div>
                                            <div className="text-xs text-txt-muted mt-1">
                                                Modello: {provider === 'gemini' ? geminiModel : provider === 'claude' ? claudeModel : provider === 'groq' ? groqModel : provider === 'modal' ? 'zai-org/GLM-5.1-FP8' : provider === 'zai' ? draftSettings.zai?.model || 'glm-4v-plus' : provider === 'openrouter' ? openrouterModel : provider === 'custom' ? (draftSettings.customProviders?.find(cp => cp.id === draftSettings.activeCustomProviderId)?.model || '-') : openAIModel}
                                            </div>
                                            <div className="absolute -right-4 -bottom-4 text-success/10 rotate-12">
                                                <BrainCircuit size={60} />
                                            </div>
                                        </div>
                                        <div className="bg-accent/10 border border-accent/20 rounded-xl p-4 relative overflow-hidden">
                                            <div className="text-[10px] uppercase font-bold tracking-widest text-accent/80 mb-2">Supervisore (Controllo Qualita)</div>
                                            <div className="text-sm font-bold text-accent">{qualityEnabled ? 'Attivo' : 'Disattivato'}</div>
                                            {qualityEnabled && (
                                                <div className="text-xs text-txt-muted mt-1">
                                                    Modello: {qualityModel || (verifierProvider === 'gemini' ? GEMINI_VERIFIER_MODEL : verifierProvider === 'claude' ? claudeModel : verifierProvider === 'groq' ? groqModel : verifierProvider === 'openrouter' ? openrouterModel : openAIModel)}
                                                </div>
                                            )}
                                            <div className="absolute -right-4 -bottom-4 text-accent/10 rotate-12">
                                                <Check size={60} />
                                            </div>
                                        </div>
                                    </div>

                                    {/* --- 2. SPESE PER MODELLO --- */}
                                    <div className="space-y-4">
                                        <h3 className="text-sm font-bold text-warning flex items-center gap-2 border-b border-warning/20 pb-2">
                                            <Activity size={16} /> Spesa per Modello
                                        </h3>
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="text-[10px] text-txt-muted">
                                                Stima costo/pagina: 2600 token input + 2600 token output. Groq e considerato $0.
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <select
                                                    value={modelCostSort}
                                                    onChange={(e) => setModelCostSort(e.target.value as any)}
                                                    className="bg-surface-4/50 border border-border-muted rounded-xl py-1.5 px-2 text-[10px] text-txt-primary"
                                                >
                                                    <option value="total">Ordina: Totale</option>
                                                    <option value="avg">Ordina: Medio</option>
                                                    <option value="estimated">Ordina: Stima/pagina</option>
                                                </select>
                                                <select
                                                    value={modelCostSortDir}
                                                    onChange={(e) => setModelCostSortDir(e.target.value as any)}
                                                    className="bg-surface-4/50 border border-border-muted rounded-xl py-1.5 px-2 text-[10px] text-txt-primary"
                                                >
                                                    <option value="desc">?</option>
                                                    <option value="asc">?</option>
                                                </select>
                                            </div>
                                        </div>
                                        {Object.keys(metrics?.models || {}).length === 0 ? (
                                            <div className="text-xs text-txt-muted">Nessun costo registrato per i modelli in questa finestra.</div>
                                        ) : (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                {(() => {
                                                    const entries = Object.entries(metrics!.models) as Array<[string, any]>;
                                                    const dir = modelCostSortDir === 'asc' ? 1 : -1;
                                                    entries.sort((a, b) => {
                                                        const [aId, aData] = a;
                                                        const [bId, bData] = b;
                                                        const aAvg = aData.calls > 0 ? (aData.cost / aData.calls) : 0;
                                                        const bAvg = bData.calls > 0 ? (bData.cost / bData.calls) : 0;
                                                        const aEst = usageTracker.estimateModelCostPerPageUSD(aId);
                                                        const bEst = usageTracker.estimateModelCostPerPageUSD(bId);
                                                        const aVal = modelCostSort === 'total' ? aData.cost : modelCostSort === 'avg' ? aAvg : aEst;
                                                        const bVal = modelCostSort === 'total' ? bData.cost : modelCostSort === 'avg' ? bAvg : bEst;
                                                        return (aVal - bVal) * dir;
                                                    });
                                                    return entries;
                                                })().map(([modelId, mData]: [string, any]) => {
                                                    const avg = (mData.calls > 0 ? (mData.cost / mData.calls) : 0);
                                                    const est = usageTracker.estimateModelCostPerPageUSD(modelId);
                                                    return (
                                                    <div key={modelId} className="bg-surface-4/50 border border-border-muted rounded-xl p-4 flex flex-col justify-between">
                                                        <div className="flex justify-between items-start mb-2">
                                                            <div className="text-xs font-bold text-txt-primary truncate max-w-[200px]">{modelId}</div>
                                                            <div className="text-lg font-mono font-bold text-warning">${(mData.cost || 0).toFixed(5)}</div>
                                                        </div>
                                                        <div className="grid grid-cols-3 gap-2 mt-2">
                                                            <div className="text-[10px] text-txt-muted">
                                                                <span className="block font-bold uppercase text-txt-muted">Chiamate</span>
                                                                <span className="text-txt-secondary font-mono">{mData.calls || 0} page{(mData.calls || 0) !== 1 && 's'}</span>
                                                            </div>
                                                            <div className="text-[10px] text-txt-muted">
                                                                <span className="block font-bold uppercase text-txt-muted">Costo Medio</span>
                                                                <span className="text-txt-secondary font-mono">${(avg || 0).toFixed(5)}</span>
                                                            </div>
                                                            <div className="text-[10px] text-txt-muted">
                                                                <span className="block font-bold uppercase text-txt-muted">Stima/Pagina</span>
                                                                <span className="text-txt-secondary font-mono">${(est || 0).toFixed(5)}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>

                                    {/* --- 3. SPESE PER PROGETTO --- */}
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center border-b border-border-muted pb-2">
                                            <h3 className="text-sm font-bold text-txt-secondary flex items-center gap-2">
                                                <Folder size={16} /> Costi per Progetto
                                            </h3>
                                            <button
                                                onClick={clearUsageSession}
                                                className="text-[10px] text-danger hover:text-danger bg-danger/10 hover:bg-danger/20 px-3 py-1 rounded transition-colors duration-200"
                                            >
                                                Azzera Statistiche
                                            </button>
                                        </div>
                                        {Object.keys(metrics?.projects || {}).length === 0 ? (
                                            <div className="text-xs text-txt-muted">Nessun progetto tracciato finora.</div>
                                        ) : (
                                            <div className="overflow-x-auto rounded-xl border border-border-muted">
                                                <table className="w-full text-left text-xs bg-surface-0/50">
                                                    <thead className="bg-surface-4/50 text-txt-muted uppercase text-[10px] tracking-wider">
                                                        <tr>
                                                            <th className="px-4 py-3 font-semibold">Nome Progetto</th>
                                                            <th className="px-4 py-3 font-semibold text-right">Chiamate</th>
                                                            <th className="px-4 py-3 font-semibold text-right">Media / Chiamata</th>
                                                            <th className="px-4 py-3 font-semibold text-right text-success">Costo Totale</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-border-muted">
                                                        {Object.entries(metrics!.projects).map(([prodId, pData]: [string, any]) => (
                                                            <tr key={prodId} className="hover:bg-surface-4/50 transition-colors duration-200">
                                                                <td className="px-4 py-3 font-medium text-txt-secondary max-w-[260px]">
                                                                    <div className="truncate">{pData.name || prodId}</div>
                                                                    <div className="text-[9px] text-txt-muted font-mono truncate">{prodId}</div>
                                                                </td>
                                                                <td className="px-4 py-3 text-right font-mono text-txt-muted">{pData.calls}</td>
                                                                <td className="px-4 py-3 text-right font-mono text-txt-muted">${(pData.calls > 0 ? (pData.cost / pData.calls) : 0).toFixed(5)}</td>
                                                                <td className="px-4 py-3 text-right font-mono font-bold text-success">${(pData.cost || 0).toFixed(5)}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>

                                    {/* --- 4. LISTINO PREZZI MODELLI --- */}
                                    <div className="space-y-4 pt-6 border-t border-border-muted">
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                            <h3 className="text-sm font-bold text-txt-secondary flex items-center gap-2">
                                                <CreditCard size={16} /> Listino Prezzi Modelli (Riferimento)
                                            </h3>
                                            {/* Legenda Colori */}
                                            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-surface-4/40 border border-border-muted rounded-xl px-3 py-2">
                                                <div className="flex items-center gap-1.5 text-[10px] text-txt-muted">
                                                    <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" /> <span>Gratis</span>
                                                </div>
                                                <div className="flex items-center gap-1.5 text-[10px] text-txt-muted">
                                                    <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" /> <span>Economico</span>
                                                </div>
                                                <div className="flex items-center gap-1.5 text-[10px] text-txt-muted">
                                                    <span className="w-2 h-2 rounded-full bg-orange-500 shrink-0" /> <span>Standard/Pro</span>
                                                </div>
                                                <div className="flex items-center gap-1.5 text-[10px] text-txt-muted">
                                                    <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" /> <span>Premium/Caro</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {[
                                                { name: 'OpenRouter (Omni)', list: OPENROUTER_MODELS_LIST, color: 'text-indigo-400' },
                                                { name: 'Google Gemini', list: GEMINI_MODELS_LIST, color: 'text-accent' },
                                                { name: 'OpenAI (ChatGPT)', list: OPENAI_MODELS_LIST, color: 'text-purple-400' },
                                                { name: 'Anthropic Claude', list: CLAUDE_MODELS_LIST, color: 'text-orange-400' },
                                                { name: 'Groq (Llama/Qwen)', list: GROQ_MODELS_LIST, color: 'text-success' },
                                                { name: 'Modal (GLM-5.1)', list: MODAL_MODELS_LIST, color: 'text-purple-300' },
                                                { name: 'Z.ai (Zhipu AI)', list: ZAI_MODELS_LIST, color: 'text-blue-400' }
                                            ].map(providerInfo => (
                                                <div key={providerInfo.name} className="bg-surface-3/50 border border-border-muted rounded-xl p-3">
                                                    <div className={`text-[10px] font-bold uppercase mb-2 ${providerInfo.color}`}>{providerInfo.name}</div>
                                                    <div className="space-y-1">
                                                        {[...providerInfo.list]
                                                            .sort((a, b) => usageTracker.estimateModelCostPerPageUSD(a.id) - usageTracker.estimateModelCostPerPageUSD(b.id))
                                                            .map(m => {
                                                                const est = usageTracker.estimateModelCostPerPageUSD(m.id);
                                                                return (
                                                            <div key={m.id} className="flex justify-between items-center text-[10px] py-1 border-b border-border-muted last:border-0">
                                                                <div className="flex flex-col">
                                                                    <span className="text-txt-secondary font-medium">{m.name}</span>
                                                                    <span className="text-[9px] text-txt-muted font-mono">{m.id}</span>
                                                                </div>
                                                                <div className="text-right">
                                                                    <div className="text-txt-secondary font-mono">In: {m.pricing?.input} • Out: {m.pricing?.output}</div>
                                                                    <div className="text-[9px] text-txt-muted font-mono">Stima/pagina: ${(est || 0).toFixed(5)}</div>
                                                                    <div className="text-[8px] text-txt-muted italic">per 1M tokens</div>
                                                                </div>
                                                            </div>
                                                                );
                                                            })}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="bg-accent/10 border border-accent/20 p-4 rounded-xl flex gap-3 text-accent-hover">
                                        <Info size={16} className="shrink-0 mt-0.5 text-accent" />
                                        <div className="text-[11px] leading-relaxed">
                                            <strong>Memo Token:</strong> Un libro di grandi dimensioni pesa solitamente tra gli 80.000 e i 200.000 token di Input (immagini o PDF inviati all'IA) e produce circa altrettanti token di Output (testo tradotto restituito). Il costo si riferisce alla somma cumulativa esatta estratta dai contatori di Google, Anthropic e OpenAI.
                                        </div>
                                    </div>
                                </div>
                            )}


                            {activeSection === 'translationLogic' && isAdmin && (
                                <TranslationLogicSection draftSettings={draftSettings} updateDraft={updateDraft} onNavigateToSection={(id) => setActiveSection(id as SettingsSection)} />
                            )}


                            {activeSection === 'libraryTrash' && (
                                <div className="space-y-6 animate-fade-in">
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-txt-muted uppercase tracking-wider">Percorso Dati</label>
                                        <div className="bg-surface-4/50 border border-border-muted rounded-xl p-3 space-y-3">
                                            <div className="space-y-2">
                                                <div className="text-[10px] font-bold text-txt-muted uppercase tracking-wider">Cartella Progetti</div>
                                                <div className="flex flex-col gap-2">
                                                    <div className="bg-surface-4/50 border border-border-muted rounded-lg py-2 px-3 text-[10px] text-txt-secondary truncate font-mono">
                                                        {customProjectsPath || 'Default (Cartella Dati App)'}
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={handleChangeProjectsBaseDir}
                                                            className="flex items-center gap-2 px-3 py-2 bg-surface-4/50 hover:bg-surface-5 text-txt-secondary hover:text-txt-primary rounded-lg transition-colors duration-200 text-[10px] font-bold"
                                                            title="Cambia cartella"
                                                        >
                                                            <Folder size={14} />
                                                            Cambia Cartella
                                                        </button>
                                                        <button
                                                            onClick={handleResetProjectsBaseDirToDefault}
                                                            disabled={!customProjectsPath}
                                                            className="px-3 py-2 bg-danger/10 hover:bg-danger/20 disabled:opacity-50 disabled:cursor-not-allowed text-danger rounded-lg transition-colors duration-200 text-[10px] font-bold"
                                                            title="Ripristina default"
                                                        >
                                                            Ripristina Default
                                                        </button>
                                                    </div>
                                                </div>
                                                <p className="text-[10px] text-txt-muted leading-relaxed">La cartella dove vengono salvati i file JSON delle traduzioni e gli asset (PDF originali, immagini).</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <label className="text-xs font-bold text-txt-muted uppercase tracking-wider flex items-center gap-2">
                                                <Trash2 size={14} />
                                                Cestino (Auto-eliminazione 7gg)
                                            </label>
                                            {trashItems.length > 0 && (
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={handleRestoreAll}
                                                        disabled={isActionRunning}
                                                        className="text-[10px] font-bold text-accent hover:text-accent-hover transition-colors duration-200 flex items-center gap-1 bg-accent/10 px-2 py-1 rounded-xl"
                                                    >
                                                        <RotateCcw size={10} />
                                                        Ripristina Tutto
                                                    </button>
                                                    <button
                                                        onClick={handleEmptyTrash}
                                                        disabled={isActionRunning}
                                                        className="text-[10px] font-bold text-danger hover:text-danger transition-colors duration-200 flex items-center gap-1 bg-danger/10 px-2 py-1 rounded-xl"
                                                    >
                                                        <Trash size={10} />
                                                        Svuota
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                        <div className="bg-surface-4/50 border border-border-muted rounded-xl overflow-hidden">
                                            {isLoadingTrash ? (
                                                <div className="p-4 text-center text-xs text-txt-muted">Caricamento cestino...</div>
                                            ) : trashItems.length === 0 ? (
                                                <div className="p-4 text-center text-xs text-txt-muted italic">Il cestino e vuoto</div>
                                            ) : (
                                                <div className="divide-y divide-border-muted max-h-[300px] overflow-y-auto custom-scrollbar">
                                                    {trashItems.map((item) => {
                                                        const daysLeft = item.daysLeft !== undefined
                                                            ? item.daysLeft
                                                            : Math.max(0, 7 - Math.floor((Date.now() - item.deletedAt) / (1000 * 60 * 60 * 24)));
                                                        return (
                                                            <div key={item.trashId} className="p-3 flex items-center justify-between gap-3 hover:bg-surface-3/50 transition-colors duration-200">
                                                                <div className="min-w-0 flex-1">
                                                                    <div className="text-xs font-bold text-txt-primary truncate">{item.fileName}</div>
                                                                    <div className="text-[10px] text-txt-muted mt-0.5">Eliminato il {new Date(item.deletedAt).toLocaleDateString()} • {daysLeft} giorni rimasti</div>
                                                                </div>
                                                                <div className="flex items-center gap-1 shrink-0">
                                                                    <button
                                                                        onClick={() => handleRestore(item.trashId)}
                                                                        disabled={isActionRunning}
                                                                        className="flex items-center gap-1 px-2 py-1.5 text-[10px] font-bold text-accent hover:bg-accent/10 rounded-lg transition-colors duration-200 border border-accent/20"
                                                                        title="Ripristina progetto"
                                                                    >
                                                                        <RotateCcw size={12} />
                                                                        Ripristina
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleDeletePermanently(item.trashId)}
                                                                        disabled={isActionRunning}
                                                                        className="p-1.5 text-danger/60 hover:text-danger hover:bg-danger/10 rounded-lg transition-colors duration-200"
                                                                        title="Elimina definitivamente"
                                                                    >
                                                                        <Trash size={14} />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeSection === 'exportApp' && (
                                <div className="space-y-6 animate-fade-in">
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-txt-muted uppercase tracking-wider">Export PDF</label>
                                        <div className="bg-surface-4/50 border border-border-muted rounded-xl p-3 space-y-3">
                                            <label className="flex items-center justify-between gap-3 text-sm text-txt-primary">
                                                <span className="text-xs font-semibold text-txt-primary">Mantieni spread in due pagine</span>
                                                <ToggleSwitch checked={exportSplitSpread} onChange={setExportSplitSpread} />
                                            </label>
                                            <label className="flex items-center justify-between gap-3 text-sm text-txt-primary">
                                                <span className="text-xs font-semibold text-txt-primary">Inserisci pagine bianche se meta vuota</span>
                                                <ToggleSwitch checked={exportInsertBlank} onChange={setExportInsertBlank} />
                                            </label>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="space-y-1">
                                                    <div className="text-[10px] font-bold text-txt-muted uppercase tracking-wider">Formato output</div>
                                                    <select
                                                        value={exportFormat}
                                                        onChange={(e) => setExportFormat(e.target.value as 'A4' | 'original')}
                                                        className="w-full bg-surface-4/50 border border-border-muted rounded-xl py-2 px-2 text-xs text-txt-primary focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-all duration-200"
                                                    >
                                                        <option value="A4">A4</option>
                                                        <option value="original">Originale (rapporto)</option>
                                                    </select>
                                                </div>
                                                <div className="space-y-1">
                                                    <div className="text-[10px] font-bold text-txt-muted uppercase tracking-wider">Anteprima export nel reader</div>
                                                    <label className="flex items-center justify-between gap-3 text-sm text-txt-primary">
                                                        <span className="text-xs font-semibold text-txt-primary">Abilita</span>
                                                        <ToggleSwitch checked={previewInReader} onChange={setPreviewInReader} />
                                                    </label>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeSection === 'logsDiagnostic' && isAdmin && (
                                <div className="space-y-6 animate-fade-in">
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-txt-muted uppercase tracking-wider">Log di Sistema</label>
                                        <div className="bg-surface-4/50 border border-border-muted rounded-xl p-3 space-y-3">
                                        <label className="flex items-center justify-between gap-3 text-sm text-txt-primary">
                                            <span className="text-xs font-semibold text-txt-primary">Log di Debug (Avanzato)</span>
                                            <ToggleSwitch checked={verboseEnabled} onChange={setVerboseEnabled} />
                                        </label>
                                        <div className="text-[10px] text-txt-muted leading-relaxed">Abilita messaggi dettagliati in console e file di log separati (debug-*.log).</div>

                                        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border-muted">
                                            <button onClick={() => setShowLogViewer(true)} className="text-[10px] uppercase font-bold px-2 py-1 rounded bg-surface-4/50 text-txt-muted hover:text-txt-primary hover:bg-surface-5 transition-colors duration-200">Visualizza Log</button>
                                            <button
                                                onClick={async () => {
                                                    try {
                                                        if (!window.electronAPI) return;
                                                        await window.electronAPI.openLogsDir();
                                                    } catch { }
                                                }}
                                                className="text-[10px] uppercase font-bold px-2 py-1 rounded bg-surface-4/50 text-txt-muted hover:text-txt-primary hover:bg-surface-5 transition-colors duration-200"
                                            >
                                                Apri Cartella
                                            </button>
                                            <button
                                                onClick={async () => {
                                                    try {
                                                        if (!window.electronAPI) return;
                                                        const btn = document.activeElement as HTMLButtonElement;
                                                        const originalText = btn.innerText;
                                                        btn.innerText = 'Pulizia...';
                                                        btn.disabled = true;

                                                        const res = await window.electronAPI.cleanupOldLogs(7);
                                                        const deletedCount = typeof res === 'number' ? res : res.deletedCount;
                                                        const totalFound = typeof res === 'object' ? res.totalFound : 0;

                                                        if (deletedCount > 0) {
                                                            alert(`Pulizia completata! ${deletedCount} file di log vecchi sono stati eliminati.`);
                                                        } else if (totalFound > 0) {
                                                            alert(`Trovati ${totalFound} file di log, ma sono tutti recenti (meno di 7 giorni) e non sono stati eliminati.`);
                                                        } else {
                                                            alert('Nessun file di log trovato.');
                                                        }

                                                        btn.innerText = originalText;
                                                        btn.disabled = false;
                                                    } catch (e) {
                                                        alert(`Errore durante la pulizia: ${e}`);
                                                    }
                                                }}
                                                className="text-[10px] uppercase font-bold px-2 py-1 rounded bg-warning/20 text-warning hover:text-warning hover:bg-warning/30 transition-colors duration-200"
                                                title="Elimina i file di log più vecchi di 7 giorni"
                                            >
                                                Pulisci Vecchi
                                            </button>
                                            <button
                                                onClick={async () => {
                                                    if (!confirm('ATTENZIONE: Sei sicuro di voler eliminare TUTTI i file di log?\nQuesta operazione non può essere annullata.')) return;
                                                    try {
                                                        if (!window.electronAPI) return;
                                                        const btn = document.activeElement as HTMLButtonElement;
                                                        const originalText = btn.innerText;
                                                        btn.innerText = 'Eliminazione...';
                                                        btn.disabled = true;

                                                        const res = await window.electronAPI.cleanupOldLogs(-1);
                                                        const deletedCount = typeof res === 'number' ? res : res.deletedCount;
                                                        alert(`Operazione completata! Eliminati ${deletedCount} file di log.`);

                                                        btn.innerText = originalText;
                                                        btn.disabled = false;
                                                    } catch (e) {
                                                        alert(`Errore durante l'eliminazione: ${e}`);
                                                    }
                                                }}
                                                className="text-[10px] uppercase font-bold px-2 py-1 rounded bg-danger/20 text-danger hover:text-danger hover:bg-danger/30 transition-all duration-200 group"
                                            >
                                                Elimina Tutto
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Sezione: Log Diagnostico Traduzioni */}
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-txt-muted uppercase tracking-wider">Diagnostica Traduzioni</label>
                                    <div className="bg-surface-4/50 border border-border-muted rounded-xl p-3 space-y-3">
                                        <label className="flex items-center justify-between gap-3 text-sm text-txt-primary">
                                            <div>
                                                <span className="text-xs font-semibold text-txt-primary">Log Traduzioni (Prompt + Risultato)</span>
                                                <div className="text-[10px] text-txt-muted leading-relaxed mt-0.5">Salva immagine, prompt e risultato di ogni traduzione. Esporta il report per analisi con AI esterna.</div>
                                            </div>
                                            <ToggleSwitch checked={diagnosticLogEnabled} onChange={setDiagnosticLogEnabled} />
                                        </label>

                                        {diagnosticLogEnabled && (
                                            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border-muted">
                                                <span className="text-[10px] text-txt-muted">{diagnosticLogCount} pagine registrate</span>
                                                <button
                                                    onClick={() => {
                                                        import('../services/translation/TranslationDiagnosticLogger').then(({ exportDiagnosticLog }) => {
                                                            const content = exportDiagnosticLog();
                                                            if (!content) { alert('Nessun dato registrato. Traduci almeno una pagina prima di esportare.'); return; }
                                                            const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
                                                            const url = URL.createObjectURL(blob);
                                                            const a = document.createElement('a');
                                                            a.href = url;
                                                            a.download = 'translation-diagnostic-' + new Date().toISOString().replace(/[:.]/g, '-') + '.txt';
                                                            a.click();
                                                            URL.revokeObjectURL(url);
                                                        });
                                                    }}
                                                    className="text-[10px] uppercase font-bold px-2 py-1 rounded bg-accent/15 text-accent hover:bg-accent/25 transition-colors duration-200"
                                                >
                                                    Esporta TXT
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        import('../services/translation/TranslationDiagnosticLogger').then(({ exportDiagnosticMarkdown }) => {
                                                            const md = exportDiagnosticMarkdown();
                                                            if (!md) { alert('Nessun dato registrato. Traduci almeno una pagina prima di esportare.'); return; }
                                                            const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
                                                            const url = URL.createObjectURL(blob);
                                                            const a = document.createElement('a');
                                                            a.href = url;
                                                            a.download = 'translation-diagnostic-' + new Date().toISOString().replace(/[:.]/g, '-') + '.md';
                                                            a.click();
                                                            URL.revokeObjectURL(url);
                                                        });
                                                    }}
                                                    className="text-[10px] uppercase font-bold px-2 py-1 rounded bg-accent/15 text-accent hover:bg-accent/25 transition-colors duration-200"
                                                >
                                                    Esporta Markdown
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        import('../services/translation/TranslationDiagnosticLogger').then(({ clearDiagnosticEntries }) => {
                                                            clearDiagnosticEntries();
                                                            setDiagnosticLogCount(0);
                                                        });
                                                    }}
                                                    className="text-[10px] uppercase font-bold px-2 py-1 rounded bg-danger/15 text-danger hover:bg-danger/25 transition-colors duration-200"
                                                >
                                                    Pulisci
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Sezione: Diagnostica e Reset */}
                                <div className="space-y-3 pt-6 border-t border-border-muted">
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs font-bold text-txt-muted uppercase tracking-wider">Report di Sistema</label>
                                        <button
                                            onClick={loadHealthReport}
                                            disabled={isCheckingHealth}
                                            className="text-[10px] text-accent hover:text-accent-hover flex items-center gap-1 transition-colors duration-200 disabled:opacity-50"
                                        >
                                            <RotateCcw size={10} className={isCheckingHealth ? 'animate-spin' : ''} />
                                            Ricarica
                                        </button>
                                    </div>

                                    <div className="bg-surface-4/50 border border-border-muted rounded-xl p-4">
                                        {isCheckingHealth ? (
                                            <div className="flex flex-col items-center justify-center py-6 gap-3">
                                                <Loader2 className="animate-spin text-accent" size={24} />
                                                <span className="text-xs text-txt-muted">Verifica sistema in corso...</span>
                                            </div>
                                        ) : healthReport ? (
                                            <div className="space-y-4">
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="bg-surface-4/50 rounded-lg p-3">
                                                        <div className="text-[10px] text-txt-muted mb-1 tracking-wide uppercase">App Version</div>
                                                        <div className="text-sm font-bold text-txt-primary">{healthReport.appVersion}</div>
                                                    </div>
                                                    <div className="bg-surface-4/50 rounded-lg p-3">
                                                        <div className="text-[10px] text-txt-muted mb-1 tracking-wide uppercase">OS</div>
                                                        <div className="text-sm font-bold text-txt-primary">{healthReport.platform} ({healthReport.arch})</div>
                                                    </div>
                                                </div>

                                                <div className="bg-surface-4/50 rounded-lg p-3">
                                                    <div className="text-[10px] text-txt-muted mb-2 tracking-wide uppercase">Database (Archivio)</div>
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <div className={`h-2 w-2 rounded-full ${healthReport.dbStatus === 'ok' ? 'bg-success' : 'bg-danger'}`} />
                                                        <span className="text-sm font-mono text-txt-primary">{healthReport.dbStatus === 'ok' ? 'Connesso' : 'Errore'}</span>
                                                    </div>
                                                    <div className="text-[10px] text-txt-muted">{healthReport.dbPath}</div>
                                                </div>

                                                <div className="space-y-2">
                                                    <div className="text-[10px] text-txt-muted tracking-wide uppercase">Dettagli Storage</div>
                                                    <div className="text-xs font-mono text-txt-secondary whitespace-pre-wrap bg-surface-0/50 p-3 rounded-lg border border-border-muted overflow-x-auto">
                                                        {healthReport.details}
                                                    </div>
                                                </div>

                                                <button
                                                    onClick={() => {
                                                        const reportText = [
                                                            `App Version: ${healthReport.appVersion}`,
                                                            `Platform: ${healthReport.platform} (${healthReport.arch})`,
                                                            `DB Status: ${healthReport.dbStatus}`,
                                                            `DB Path: ${healthReport.dbPath}`,
                                                            `Memory: ${healthReport.memory}`,
                                                            `Mode: ${healthReport.isPackaged ? 'Packaged' : 'Dev'}`,
                                                            `\nDetails:`,
                                                            healthReport.details
                                                        ].join('\n');
                                                        if (navigator.clipboard) {
                                                            navigator.clipboard.writeText(reportText);
                                                            alert('Report copiato negli appunti!');
                                                        }
                                                    }}
                                                    className="w-full text-xs py-2 rounded-lg bg-surface-4/50 hover:bg-surface-5 text-txt-secondary font-bold transition-colors duration-200"
                                                >
                                                    Copia Report
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="text-center text-xs text-txt-muted py-6">
                                                Report non disponibile.
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <label className="text-xs font-bold text-txt-muted uppercase tracking-wider">Ripristino Completo</label>
                                    <div className="space-y-2 border border-danger/10 rounded-xl p-3 bg-danger/5">
                                        <button
                                            onClick={() => closeAndThen(async () => {
                                                if (!confirm("AZIONE ESTREMA: Ripristinare ai dati di fabbrica?\n\nPerderai libreria, impostazioni e dati locali.")) return;
                                                const typed = prompt("Per confermare, scrivi ESATTAMENTE: RESET");
                                                if (typed !== 'RESET') return;
                                                await window.electronAPI.factoryReset();
                                            })}
                                            className="w-full text-left p-4 rounded-xl border border-danger/20 bg-danger/5 hover:bg-danger/10 hover:border-danger/30 transition-all duration-200 group"
                                        >
                                            <div className="text-xs font-bold text-danger group-hover:text-danger">
                                                Factory Reset (Dati di Fabbrica)
                                            </div>
                                            <div className="text-[10px] text-txt-muted mt-1 leading-relaxed">
                                                Cancella configurazioni, archivio e progetti locali dall'applicazione, tornando al pulito.
                                            </div>
                                        </button>
                                    </div>
                                </div>

                            </div>
                            )}

                            {/* Sezione: Azioni Pericolose */}
                            {activeSection === 'logsDiagnostic' && isAdmin && ((!isLibraryView && onRedoAll) || onConsolidate) && (
                                <div className="space-y-3">
                                    <label className="text-xs font-bold text-danger/70 uppercase tracking-wider">Zona Pericolosa</label>
                                    <div className="space-y-2 border border-danger/10 rounded-xl p-3 bg-danger/5">
                                        {!isLibraryView && onRedoAll && (
                                            <button
                                                onClick={() => closeAndThen(onRedoAll)}
                                                className="w-full text-left p-4 rounded-xl border border-danger/20 bg-danger/5 hover:bg-danger/10 hover:border-danger/30 transition-all duration-200 group"
                                            >
                                                <div className="text-xs font-bold text-danger group-hover:text-danger">
                                                    Reset e Ritraduci Tutto {currentBookTitle ? `(${currentBookTitle})` : ''}
                                                </div>
                                                <div className="text-[10px] text-txt-muted mt-1 leading-relaxed">
                                                    Cancella tutte le traduzioni e le annotazioni di {currentBookTitle ? `"${currentBookTitle}"` : 'questo libro'} e ricomincia da capo.
                                                </div>
                                            </button>
                                        )}

                                        {onConsolidate && (
                                            <button
                                                onClick={async () => {
                                                    if (isConsolidateRunning) return;
                                                    const proceed = async () => {
                                                        setIsConsolidateRunning(true);
                                                        try {
                                                            const res: any = await window.electronAPI.consolidateLibrary();
                                                            if (res.success) {
                                                                alert(`Pulizia completata!\n\n- Progetti uniti: ${res.mergedCount}\n- PDF recuperati: ${res.fixedCount}\n\nI duplicati sono stati spostati nel cestino temporaneo.`);
                                                                if (onRefreshLibrary) onRefreshLibrary();
                                                            } else {
                                                                alert(`Errore durante la pulizia: ${res.error}`);
                                                            }
                                                        } finally {
                                                            setIsConsolidateRunning(false);
                                                        }
                                                    };
                                                    if (showConfirm) {
                                                        showConfirm(
                                                            "Emergenza: Unione Duplicati",
                                                            "Questa operazione scansionerà la libreria, unirà i progetti duplicati e sposterà i file ridondanti nel cestino temporaneo. Procedere?",
                                                            proceed,
                                                            'info'
                                                        );
                                                    } else if (confirm("Scansionerà la libreria, unirà duplicati e sposterà file ridondanti nel cestino. Procedere?")) {
                                                        proceed();
                                                    }
                                                }}
                                                disabled={isConsolidateRunning}
                                                className={`w-full text-left p-4 rounded-xl border transition-all duration-200 group ${!isConsolidateRunning
                                                    ? 'bg-warning/5 border-warning/15 hover:bg-warning/10 hover:border-warning/25'
                                                    : 'bg-surface-4/50 border-border-muted opacity-60 cursor-not-allowed'
                                                    }`}
                                            >
                                                <div className={`text-xs font-bold ${!isConsolidateRunning ? 'text-warning' : 'text-txt-muted'}`}>
                                                    Emergenza: Pulisci e Unisci Duplicati
                                                </div>
                                                <div className={`text-[10px] mt-1 leading-relaxed ${!isConsolidateRunning ? 'text-txt-muted' : 'text-txt-faint'}`}>
                                                    {isConsolidateRunning ? 'Operazione in corso…' : 'Rileva automaticamente progetti duplicati e li unisce in un unico progetto Master.'}
                                                </div>
                                            </button>
                                        )}

                                        {onRetroactiveRename && (
                                            <button
                                                onClick={async () => {
                                                    if (isRenameLegacyRunning || isRenameAllRunning) return;
                                                    setIsRenameLegacyRunning(true);
                                                    try { await onRetroactiveRename(); } finally { setIsRenameLegacyRunning(false); }
                                                }}
                                                disabled={isRenameLegacyRunning || isRenameAllRunning}
                                                className={`w-full text-left p-4 rounded-xl border transition-all duration-200 group ${!isRenameLegacyRunning && !isRenameAllRunning
                                                    ? 'bg-accent/5 border-accent/15 hover:bg-accent/10 hover:border-accent/25'
                                                    : 'bg-surface-4/50 border-border-muted opacity-60 cursor-not-allowed'
                                                    }`}
                                            >
                                                <div className={`text-xs font-bold ${!isRenameLegacyRunning && !isRenameAllRunning ? 'text-accent' : 'text-txt-muted'}`}>
                                                    Aggiorna Nomi File (Retroattivo)
                                                </div>
                                                <div className={`text-[10px] mt-1 leading-relaxed ${!isRenameLegacyRunning && !isRenameAllRunning ? 'text-txt-muted' : 'text-txt-faint'}`}>
                                                    {isRenameLegacyRunning ? 'Operazione in corso…' : 'Cerca libri con nomi vecchi e rinomina in formato Anno_Autore_Titolo.'}
                                                </div>
                                                {!isLibraryView && (
                                                    <div className="text-[10px] text-warning/70 mt-1.5">Agisce sulla libreria globale.</div>
                                                )}
                                            </button>
                                        )}

                                        {onRetroactiveRenameAll && (
                                            <button
                                                onClick={async () => {
                                                    if (isRenameLegacyRunning || isRenameAllRunning) return;
                                                    setIsRenameAllRunning(true);
                                                    try { await onRetroactiveRenameAll(); } finally { setIsRenameAllRunning(false); }
                                                }}
                                                disabled={isRenameLegacyRunning || isRenameAllRunning}
                                                className={`w-full text-left p-4 rounded-xl border transition-all duration-200 group ${!isRenameLegacyRunning && !isRenameAllRunning
                                                    ? 'bg-accent/5 border-accent/15 hover:bg-accent/10 hover:border-accent/25'
                                                    : 'bg-surface-4/50 border-border-muted opacity-60 cursor-not-allowed'
                                                    }`}
                                            >
                                                <div className={`text-xs font-bold ${!isRenameLegacyRunning && !isRenameAllRunning ? 'text-accent' : 'text-txt-muted'}`}>
                                                    Aggiorna Nomi File (Tutti)
                                                </div>
                                                <div className={`text-[10px] mt-1 leading-relaxed ${!isRenameLegacyRunning && !isRenameAllRunning ? 'text-txt-muted' : 'text-txt-faint'}`}>
                                                    {isRenameAllRunning ? 'Operazione in corso…' : 'Scansiona tutti i file e rinomina quando Anno/Autore/Titolo sono disponibili.'}
                                                </div>
                                                {!isLibraryView && (
                                                    <div className="text-[10px] text-warning/70 mt-1.5">Agisce sulla libreria globale.</div>
                                                )}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* FIXED FOOTER WITH VALIDATION ERRORS AND ACTION BUTTONS */}
                <div className="bg-surface-2/50 border-t border-border-muted shrink-0 flex flex-col">
                    {validationResult && (!validationResult.valid || validationResult.warnings.length > 0) && (
                        <div className="p-4 flex flex-col gap-2 border-b border-border-muted max-h-32 overflow-y-auto custom-scrollbar">
                            <div className={`text-[10px] p-2 rounded-lg border flex flex-col gap-1 ${!validationResult.valid ? 'bg-danger/10 border-danger/20 text-danger' : 'bg-warning/10 border-warning/20 text-warning'}`}>
                                {!validationResult.valid && (
                                    <div className="font-bold">Errori Configurazione:</div>
                                )}
                                {validationResult.errors.map((err, i) => (
                                    <div key={`err-${i}`} className="flex items-center gap-1 leading-tight">
                                        <X size={10} className="shrink-0" /> <span>{err}</span>
                                    </div>
                                ))}
                                {validationResult.warnings.length > 0 && (
                                    <div className={`font-bold ${!validationResult.valid ? 'mt-1' : ''}`}>Avvisi:</div>
                                )}
                                {validationResult.warnings.map((warn, i) => (
                                    <div key={`warn-${i}`} className="flex items-center gap-1 leading-tight">
                                        <Info size={10} className="shrink-0" /> <span>{warn}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="p-4 flex items-center justify-end gap-3">
                        <button onClick={requestClose} className="px-4 py-2 text-xs font-bold text-txt-muted hover:text-txt-primary hover:bg-surface-4/50 rounded-lg transition-colors duration-200">
                            Annulla
                        </button>

                        <button
                            onClick={saveDraftSettings}
                            disabled={!canSave}
                            className="px-6 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-lg transition-all duration-200 shadow-surface-lg flex items-center gap-2"
                        >
                            {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                            {isSaving ? 'Salvataggio...' : 'Salva Configurazione'}
                        </button>
                    </div>
                </div>

                {/* Log Viewer Modal */}
                {showLogViewer && (
                    <LogViewer onClose={() => setShowLogViewer(false)} />
                )}
            </div>
        </div>
    );
}, areSettingsModalPropsEqual);
