
import React, { useState, useEffect } from 'react';
import { X, Check, Key, Zap, BrainCircuit, Activity, Folder, Trash2, RotateCcw, Trash } from 'lucide-react';
import { AISettings, GeminiModel, ReasoningEffort, VerbosityLevel, OpenAIModel, TrashItem } from '../types';
import { testGeminiConnection } from '../services/geminiService';
import { testOpenAIConnection } from '../services/openaiService';
import { InputLanguageSelector } from './InputLanguageSelector';
import { GEMINI_TRANSLATION_MODEL, GEMINI_VERIFIER_MODEL } from '../constants';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (settings: AISettings) => void;
    currentSettings: AISettings;
    onRedoAll?: () => void;
    onRetroactiveRename?: () => void;
    onRetroactiveRenameAll?: () => Promise<void>;
    onRefreshLibrary?: () => void;
    isLibraryView?: boolean;
    showConfirm?: (title: string, message: string, onConfirm: () => void, type?: 'danger' | 'info' | 'alert') => void;
}

const areSettingsEqual = (a: AISettings, b: AISettings) => {
    const aQuality = a.qualityCheck;
    const bQuality = b.qualityCheck;
    const aExport = a.exportOptions;
    const bExport = b.exportOptions;

    return a.provider === b.provider &&
        Number(a.translationConcurrency ?? 2) === Number(b.translationConcurrency ?? 2) &&
        a.gemini?.apiKey === b.gemini?.apiKey &&
        a.gemini?.model === b.gemini?.model &&
        a.openai?.apiKey === b.openai?.apiKey &&
        a.openai?.model === b.openai?.model &&
        a.openai?.reasoningEffort === b.openai?.reasoningEffort &&
        a.openai?.verbosity === b.openai?.verbosity &&
        Boolean(aQuality?.enabled ?? true) === Boolean(bQuality?.enabled ?? true) &&
        (aQuality?.verifierModel ?? GEMINI_VERIFIER_MODEL) === (bQuality?.verifierModel ?? GEMINI_VERIFIER_MODEL) &&
        Number(aQuality?.maxAutoRetries ?? 1) === Number(bQuality?.maxAutoRetries ?? 1) &&
        (a.inputLanguageDefault ?? 'tedesco') === (b.inputLanguageDefault ?? 'tedesco') &&
        Boolean(aExport?.splitSpreadIntoTwoPages ?? true) === Boolean(bExport?.splitSpreadIntoTwoPages ?? true) &&
        Boolean(aExport?.insertBlankPages ?? true) === Boolean(bExport?.insertBlankPages ?? true) &&
        (aExport?.outputFormat ?? 'A4') === (bExport?.outputFormat ?? 'A4') &&
        Boolean(aExport?.previewInReader ?? false) === Boolean(bExport?.previewInReader ?? false) &&
        Boolean(a.legalContext ?? true) === Boolean(b.legalContext ?? true) &&
        Boolean(a.verboseLogs ?? true) === Boolean(b.verboseLogs ?? true) &&
        (a.customProjectsPath ?? '') === (b.customProjectsPath ?? '');
};

const areSettingsModalPropsEqual = (prev: SettingsModalProps, next: SettingsModalProps) => {
    return prev.isOpen === next.isOpen &&
        prev.isLibraryView === next.isLibraryView &&
        Boolean(prev.onRedoAll) === Boolean(next.onRedoAll) &&
        Boolean(prev.onRetroactiveRename) === Boolean(next.onRetroactiveRename) &&
        Boolean(prev.onRetroactiveRenameAll) === Boolean(next.onRetroactiveRenameAll) &&
        Boolean(prev.showConfirm) === Boolean(next.showConfirm) &&
        areSettingsEqual(prev.currentSettings, next.currentSettings);
};

export const SettingsModal = React.memo(({
    isOpen,
    onClose,
    currentSettings,
    onSave,
    onRedoAll,
    onRetroactiveRename,
    onRetroactiveRenameAll,
    onRefreshLibrary,
    isLibraryView = false,
    showConfirm
}: SettingsModalProps) => {
    const [provider, setProvider] = useState<AISettings['provider']>(currentSettings.provider);

    const [geminiKey, setGeminiKey] = useState(currentSettings.gemini.apiKey);
    const [geminiModel, setGeminiModel] = useState<GeminiModel>(currentSettings.gemini.model);
    const [isEditingGeminiKey, setIsEditingGeminiKey] = useState(false);
    const [tempGeminiKey, setTempGeminiKey] = useState('');

    const [openAIKey, setOpenAIKey] = useState(currentSettings.openai.apiKey);
    const [openAIModel, setOpenAIModel] = useState(currentSettings.openai.model);
    const [openAIReasoningEffort, setOpenAIReasoningEffort] = useState<ReasoningEffort>(currentSettings.openai.reasoningEffort);
    const [openAIVerbosity, setOpenAIVerbosity] = useState<VerbosityLevel>(currentSettings.openai.verbosity);
    const [isEditingOpenAIKey, setIsEditingOpenAIKey] = useState(false);
    const [tempOpenAIKey, setTempOpenAIKey] = useState('');

    const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
    const [testMessage, setTestMessage] = useState<string | null>(null);

    const [qualityEnabled, setQualityEnabled] = useState(Boolean(currentSettings.qualityCheck?.enabled ?? true));
    const [qualityModel, setQualityModel] = useState<GeminiModel>(currentSettings.qualityCheck?.verifierModel ?? GEMINI_VERIFIER_MODEL);
    const [qualityMaxRetries, setQualityMaxRetries] = useState<number>(currentSettings.qualityCheck?.maxAutoRetries ?? 1);
    const [translationConcurrency, setTranslationConcurrency] = useState<number>(
        Math.max(1, Math.min(4, Number(currentSettings.translationConcurrency ?? 2) || 2))
    );
    const [defaultInputLang, setDefaultInputLang] = useState<string>(currentSettings.inputLanguageDefault ?? 'tedesco');
    const [exportSplitSpread, setExportSplitSpread] = useState<boolean>(currentSettings.exportOptions?.splitSpreadIntoTwoPages ?? true);
    const [exportInsertBlank, setExportInsertBlank] = useState<boolean>(currentSettings.exportOptions?.insertBlankPages ?? true);
    const [exportFormat, setExportFormat] = useState<'A4' | 'original'>(currentSettings.exportOptions?.outputFormat ?? 'A4');
    const [previewInReader, setPreviewInReader] = useState<boolean>(currentSettings.exportOptions?.previewInReader ?? false);
    const [legalContext, setLegalContext] = useState<boolean>(currentSettings.legalContext ?? true);
    const [verboseEnabled, setVerboseEnabled] = useState<boolean>(currentSettings.verboseLogs ?? true);
    const [customProjectsPath, setCustomProjectsPath] = useState<string>(currentSettings.customProjectsPath ?? '');

    const [isRenameLegacyRunning, setIsRenameLegacyRunning] = useState(false);
    const [isRenameAllRunning, setIsRenameAllRunning] = useState(false);

    const [trashItems, setTrashItems] = useState<TrashItem[]>([]);
    const [isLoadingTrash, setIsLoadingTrash] = useState(false);
    const [isActionRunning, setIsActionRunning] = useState(false);

    const loadTrash = async () => {
        if (!window.electronAPI?.getTrashContents) return;
        setIsLoadingTrash(true);
        try {
            const items = await window.electronAPI.getTrashContents();
            setTrashItems(items || []);
        } catch (e) {
            console.error('Failed to load trash:', e);
        } finally {
            setIsLoadingTrash(false);
        }
    };

    const handleRestore = async (trashId: string) => {
        if (!window.electronAPI?.restoreTrashItem || isActionRunning) return;
        setIsActionRunning(true);
        try {
            const res = await window.electronAPI.restoreTrashItem(trashId);
            if (res.success) {
                await loadTrash();
                if (onRefreshLibrary) onRefreshLibrary();
            } else {
                alert(`Errore nel ripristino: ${res.error}`);
            }
        } catch (e) {
            alert(`Errore imprevisto nel ripristino: ${e}`);
        } finally {
            setIsActionRunning(false);
        }
    };

    const handleRestoreAll = async () => {
        if (!window.electronAPI?.restoreAllTrashItems || isActionRunning || trashItems.length === 0) return;
        
        const proceed = async () => {
            setIsActionRunning(true);
            try {
                const res = await window.electronAPI.restoreAllTrashItems();
                if (res.success) {
                    await loadTrash();
                    if (onRefreshLibrary) onRefreshLibrary();
                    alert(`Ripristinati ${res.count} progetti.`);
                } else {
                    alert(`Errore nel ripristino massivo: ${res.error}`);
                }
            } catch (e) {
                alert(`Errore imprevisto: ${e}`);
            } finally {
                setIsActionRunning(false);
            }
        };

        if (showConfirm) {
            showConfirm(
                "Ripristina Tutto",
                `Vuoi ripristinare tutti i ${trashItems.length} progetti nel cestino?`,
                proceed
            );
        } else if (confirm(`Vuoi ripristinare tutti i ${trashItems.length} progetti nel cestino?`)) {
            proceed();
        }
    };

    const handleEmptyTrash = async () => {
        if (!window.electronAPI?.emptyTrash || isActionRunning || trashItems.length === 0) return;

        const proceed = async () => {
            setIsActionRunning(true);
            try {
                const res = await window.electronAPI.emptyTrash();
                if (res.success) {
                    await loadTrash();
                } else {
                    alert(`Errore nello svuotamento: ${res.error}`);
                }
            } catch (e) {
                alert(`Errore imprevisto: ${e}`);
            } finally {
                setIsActionRunning(false);
            }
        };

        if (showConfirm) {
            showConfirm(
                "Svuota Cestino",
                "Sei sicuro di voler eliminare definitivamente TUTTI i progetti nel cestino? L'azione non può essere annullata.",
                proceed,
                'danger'
            );
        } else if (confirm("Sei sicuro di voler eliminare definitivamente TUTTI i progetti nel cestino?")) {
            proceed();
        }
    };

    const handleDeletePermanently = async (trashId: string) => {
        if (!window.electronAPI?.deleteTrashItemPermanently || isActionRunning) return;
        
        const proceed = async () => {
            setIsActionRunning(true);
            try {
                const res = await window.electronAPI.deleteTrashItemPermanently(trashId);
                if (res.success) {
                    await loadTrash();
                } else {
                    alert(`Errore nell'eliminazione definitiva: ${res.error}`);
                }
            } catch (e) {
                alert(`Errore imprevisto nell'eliminazione: ${e}`);
            } finally {
                setIsActionRunning(false);
            }
        };

        if (showConfirm) {
            showConfirm(
                "Elimina Definitivamente",
                "Sei sicuro di voler eliminare definitivamente questo progetto? L'azione non può essere annullata.",
                proceed,
                'danger'
            );
        } else if (confirm("Sei sicuro di voler eliminare definitivamente questo progetto? L'azione non può essere annullata.")) {
            proceed();
        }
    };

    useEffect(() => {
        if (isOpen) {
            loadTrash();
        }
    }, [isOpen]);

    useEffect(() => {
        setProvider(currentSettings.provider);
        setGeminiKey(currentSettings.gemini.apiKey);
        setGeminiModel(currentSettings.gemini.model);
        setOpenAIKey(currentSettings.openai.apiKey);
        setOpenAIModel(currentSettings.openai.model);
        setOpenAIReasoningEffort(currentSettings.openai.reasoningEffort);
        setOpenAIVerbosity(currentSettings.openai.verbosity);
        setQualityEnabled(Boolean(currentSettings.qualityCheck?.enabled ?? true));
        setQualityModel(currentSettings.qualityCheck?.verifierModel ?? GEMINI_VERIFIER_MODEL);
        setQualityMaxRetries(currentSettings.qualityCheck?.maxAutoRetries ?? 1);
        setTranslationConcurrency(Math.max(1, Math.min(4, Number(currentSettings.translationConcurrency ?? 2) || 2)));
        setDefaultInputLang(currentSettings.inputLanguageDefault ?? 'tedesco');
        setExportSplitSpread(currentSettings.exportOptions?.splitSpreadIntoTwoPages ?? true);
        setExportInsertBlank(currentSettings.exportOptions?.insertBlankPages ?? true);
        setExportFormat(currentSettings.exportOptions?.outputFormat ?? 'A4');
        setPreviewInReader(currentSettings.exportOptions?.previewInReader ?? false);
        setLegalContext(currentSettings.legalContext ?? true);
        setVerboseEnabled(currentSettings.verboseLogs ?? true);
        setCustomProjectsPath(currentSettings.customProjectsPath ?? '');
        setTestStatus('idle');
        setTestMessage(null);
        setIsEditingGeminiKey(false);
        setIsEditingOpenAIKey(false);
        setTempGeminiKey('');
        setTempOpenAIKey('');
    }, [currentSettings, isOpen]);

    useEffect(() => {
        if (provider === 'gemini') {
            setGeminiModel(GEMINI_TRANSLATION_MODEL);
            setQualityModel(GEMINI_VERIFIER_MODEL);
        }
    }, [provider]);

    const handleTestConnection = async () => {
        const key = provider === 'gemini' ? geminiKey : openAIKey;
        const model = provider === 'gemini' ? GEMINI_TRANSLATION_MODEL : openAIModel;
        
        if (!key.trim()) {
            setTestStatus('error');
            setTestMessage('Inserisci una API key prima di eseguire il test.');
            setTimeout(() => {
                setTestStatus('idle');
                setTestMessage(null);
            }, 3000);
            return;
        }
        setTestStatus('testing');
        setTestMessage(null);
        try {
            const success = provider === 'gemini' 
                ? await testGeminiConnection(key, model as GeminiModel)
                : await testOpenAIConnection(key, model as OpenAIModel);
            setTestStatus(success ? 'success' : 'error');
            setTestMessage(success ? null : 'Test fallito: verifica chiave, modello e connessione.');
            setTimeout(() => setTestStatus('idle'), 3000);
        } catch (e) {
            setTestStatus('error');
            setTestMessage('Test fallito: verifica chiave, modello e connessione.');
            setTimeout(() => setTestStatus('idle'), 3000);
        }
    };

    const handleSelectDirectory = async () => {
        try {
            if (!window.electronAPI?.selectDirectoryDialog) return;
            const path = await window.electronAPI.selectDirectoryDialog();
            if (path) {
                setCustomProjectsPath(path);
            }
        } catch (e) {
            console.error('Failed to select directory:', e);
        }
    };

    if (!isOpen) return null;

    const canSave = provider === 'gemini'
        ? ((isEditingGeminiKey ? tempGeminiKey.trim().length > 0 : false) || geminiKey.trim().length > 0)
        : ((isEditingOpenAIKey ? tempOpenAIKey.trim().length > 0 : false) || openAIKey.trim().length > 0);

    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-[#1a1a1a] w-full max-w-md max-h-[calc(100vh-2rem)] rounded-2xl border border-white/10 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col">
                <div className="p-6 border-b border-white/5 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                            <Key size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white">Configurazione API</h2>
                            <p className="text-xs text-gray-400">Seleziona provider e configura le chiavi</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 space-y-6 flex-1 min-h-0 overflow-y-auto pr-2 custom-scrollbar">
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Provider AI</label>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => setProvider('gemini')}
                                className={`relative p-3 rounded-xl border flex flex-col items-center gap-2 transition-all ${provider === 'gemini' ? 'bg-blue-500/10 border-blue-500 text-blue-400' : 'bg-black/30 border-white/10 text-gray-400 hover:border-white/20'}`}
                            >
                                <Zap size={20} />
                                <div className="text-center">
                                    <div className="text-xs font-bold">Gemini</div>
                                    <div className="text-[9px] opacity-70">Streaming & Veloce</div>
                                </div>
                            </button>
                            <button
                                onClick={() => setProvider('openai')}
                                className={`relative p-3 rounded-xl border flex flex-col items-center gap-2 transition-all ${provider === 'openai' ? 'bg-purple-500/10 border-purple-500 text-purple-400' : 'bg-black/30 border-white/10 text-gray-400 hover:border-white/20'}`}
                            >
                                <BrainCircuit size={20} />
                                <div className="text-center">
                                    <div className="text-xs font-bold">ChatGPT</div>
                                    <div className="text-[9px] opacity-70">OpenAI API</div>
                                </div>
                            </button>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <InputLanguageSelector
                            value={defaultInputLang}
                            onChange={setDefaultInputLang}
                            label="Lingua di input (default)"
                        />
                        <p className="text-[10px] text-gray-500 leading-relaxed">
                            Questa lingua sarà proposta quando carichi un PDF. Puoi modificarla al volo.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Opzioni Traduzione</label>
                        <div className="bg-black/30 border border-white/10 rounded-xl p-3 space-y-3">
                            <label className="flex items-center justify-between gap-3 text-sm text-white/80">
                                <div className="space-y-0.5">
                                    <span className="text-xs font-semibold text-white/80">Contesto Giuridico/Legale</span>
                                    <p className="text-[10px] text-gray-500 leading-tight">
                                        Ottimizza la terminologia per testi di diritto e giurisprudenza.
                                    </p>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={legalContext}
                                    onChange={(e) => setLegalContext(e.target.checked)}
                                    className="h-4 w-4 accent-blue-500 shrink-0"
                                />
                            </label>

                            <div className="flex items-center justify-between gap-3 text-sm text-white/80">
                                <div className="space-y-0.5">
                                    <span className="text-xs font-semibold text-white/80">Traduzioni in parallelo</span>
                                    <p className="text-[10px] text-gray-500 leading-tight">
                                        Aumenta la velocità ma può ridurre la continuità tra pagine.
                                    </p>
                                </div>
                                <select
                                    value={String(translationConcurrency)}
                                    onChange={(e) => setTranslationConcurrency(Math.max(1, Math.min(4, Number(e.target.value) || 2)))}
                                    className="bg-black/30 border border-white/10 rounded-lg py-2 px-2 text-xs text-white focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all"
                                >
                                    <option value="1">1</option>
                                    <option value="2">2</option>
                                    <option value="3">3</option>
                                    <option value="4">4</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {provider === 'gemini' && (
                        <>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Modello AI</label>
                                <div className="grid grid-cols-1 gap-3">
                                    <div className="relative p-3 rounded-xl border flex flex-col items-center gap-2 bg-blue-500/10 border-blue-500 text-blue-400">
                                        <BrainCircuit size={20} />
                                        <div className="text-center">
                                            <div className="text-xs font-bold">Gemini 3 Pro (preview)</div>
                                            <div className="text-[9px] opacity-70">{GEMINI_TRANSLATION_MODEL}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Verifica qualità (post-traduzione)</label>
                                <div className="bg-black/30 border border-white/10 rounded-xl p-3 space-y-3">
                                    <label className="flex items-center justify-between gap-3 text-sm text-white/80">
                                        <span className="text-xs font-semibold text-white/80">Abilita verifica</span>
                                        <input
                                            type="checkbox"
                                            checked={qualityEnabled}
                                            onChange={(e) => setQualityEnabled(e.target.checked)}
                                            className="h-4 w-4 accent-blue-500"
                                        />
                                    </label>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1">
                                            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Modello verifica</div>
                                            <select
                                                value={qualityModel}
                                                onChange={(e) => setQualityModel(e.target.value as GeminiModel)}
                                                disabled={!qualityEnabled}
                                                className="w-full bg-black/30 border border-white/10 rounded-lg py-2 px-2 text-xs text-white focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all disabled:opacity-50"
                                            >
                                                <option value={GEMINI_VERIFIER_MODEL}>Gemini 3 Flash (preview)</option>
                                            </select>
                                        </div>
                                        <div className="space-y-1">
                                            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Auto-ritraduzioni</div>
                                            <select
                                                value={String(qualityMaxRetries)}
                                                onChange={(e) => setQualityMaxRetries(Math.max(0, Math.min(2, Number(e.target.value) || 0)))}
                                                disabled={!qualityEnabled}
                                                className="w-full bg-black/30 border border-white/10 rounded-lg py-2 px-2 text-xs text-white focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all disabled:opacity-50"
                                            >
                                                <option value="0">0</option>
                                                <option value="1">1</option>
                                                <option value="2">2</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div className="text-[10px] text-gray-500 leading-relaxed">
                                        Mostra subito la traduzione e poi controlla omissioni gravi. Se necessario, può ritradurre automaticamente e registra evidenze nel log pagina.
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Gemini API Key</label>
                                    <button
                                        onClick={handleTestConnection}
                                        disabled={testStatus === 'testing'}
                                        className={`text-[10px] uppercase font-bold px-2 py-1 rounded transition-colors flex items-center gap-1.5 ${testStatus === 'success' ? 'bg-green-500/10 text-green-400' :
                                            testStatus === 'error' ? 'bg-red-500/10 text-red-400' :
                                                testStatus === 'testing' ? 'bg-blue-500/10 text-blue-400' :
                                                    'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
                                            }`}
                                    >
                                        <Activity size={12} className={testStatus === 'testing' ? 'animate-spin' : ''} />
                                        {testStatus === 'idle' ? 'Test Funzionamento' :
                                            testStatus === 'testing' ? 'Test in corso...' :
                                                testStatus === 'success' ? 'Funzionamento OK' : 'Errore Test'}
                                    </button>
                                </div>
                                {testMessage && (
                                    <div className={`text-[10px] font-semibold ${testStatus === 'success' ? 'text-green-400' : testStatus === 'error' ? 'text-red-400' : 'text-gray-400'}`}>
                                        {testMessage}
                                    </div>
                                )}
                                <div className="relative group">
                                    <input
                                        type="password"
                                        value={isEditingGeminiKey ? tempGeminiKey : (geminiKey ? `${geminiKey.slice(0, 3)}••••••••••••` : '')}
                                        onChange={isEditingGeminiKey ? (e) => setTempGeminiKey(e.target.value) : undefined}
                                        readOnly={!isEditingGeminiKey}
                                        placeholder="AIzaSy..."
                                        className="w-full bg-black/30 border border-white/10 rounded-xl py-3 pl-4 pr-20 text-sm text-white focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all font-mono"
                                    />
                                    <button
                                        onClick={() => {
                                            setIsEditingGeminiKey((v) => {
                                                const next = !v;
                                                if (next) setTempGeminiKey('');
                                                return next;
                                            });
                                        }}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 px-2 py-1 text-[10px] font-bold rounded-lg bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                                    >
                                        {isEditingGeminiKey ? 'Annulla' : 'Modifica'}
                                    </button>
                                </div>
                                <p className="text-[10px] text-gray-500 leading-relaxed">
                                    La chiave verrà salvata esclusivamente nella memoria locale del tuo dispositivo.
                                    Nessun dato viene inviato a server esterni oltre a Google per la traduzione.
                                </p>
                            </div>
                        </>
                    )}

                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Archiviazione Progetti</label>
                        <div className="bg-black/30 border border-white/10 rounded-xl p-3 space-y-3">
                            <div className="space-y-2">
                                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Cartella Progetti</div>
                                <div className="flex gap-2">
                                    <div className="flex-1 bg-black/30 border border-white/10 rounded-lg py-2 px-3 text-[10px] text-gray-300 truncate font-mono">
                                        {customProjectsPath || 'Default (Cartella Dati App)'}
                                    </div>
                                    <button
                                        onClick={handleSelectDirectory}
                                        className="px-3 py-2 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white rounded-lg transition-colors"
                                        title="Cambia cartella"
                                    >
                                        <Folder size={14} />
                                    </button>
                                    {customProjectsPath && (
                                        <button
                                            onClick={() => setCustomProjectsPath('')}
                                            className="px-3 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors text-[10px] font-bold"
                                            title="Ripristina default"
                                        >
                                            Ripristina
                                        </button>
                                    )}
                                </div>
                                <p className="text-[10px] text-gray-500 leading-relaxed">
                                    La cartella dove vengono salvati i file JSON delle traduzioni e gli asset (PDF originali, immagini).
                                    {customProjectsPath && (
                                        <span className="text-amber-500/80 block mt-1">
                                            Nota: Cambiando questa cartella dovrai spostare manualmente i tuoi progetti esistenti se vuoi continuare a vederli.
                                        </span>
                                    )}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                                <Trash2 size={14} />
                                Cestino (Auto-eliminazione 30gg)
                            </label>
                            {trashItems.length > 0 && (
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleRestoreAll}
                                        disabled={isActionRunning}
                                        className="text-[10px] font-bold text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1 bg-blue-500/10 px-2 py-1 rounded-md"
                                    >
                                        <RotateCcw size={10} />
                                        Ripristina Tutto
                                    </button>
                                    <button
                                        onClick={handleEmptyTrash}
                                        disabled={isActionRunning}
                                        className="text-[10px] font-bold text-red-400 hover:text-red-300 transition-colors flex items-center gap-1 bg-red-500/10 px-2 py-1 rounded-md"
                                    >
                                        <Trash size={10} />
                                        Svuota
                                    </button>
                                </div>
                            )}
                        </div>
                        <div className="bg-black/30 border border-white/10 rounded-xl overflow-hidden">
                            {isLoadingTrash ? (
                                <div className="p-4 text-center text-xs text-gray-500">Caricamento cestino...</div>
                            ) : trashItems.length === 0 ? (
                                <div className="p-4 text-center text-xs text-gray-500 italic">Il cestino è vuoto</div>
                            ) : (
                                <div className="divide-y divide-white/5 max-h-[300px] overflow-y-auto custom-scrollbar">
                                    {trashItems.map((item) => {
                                        const daysLeft = Math.max(0, 30 - Math.floor((Date.now() - item.deletedAt) / (1000 * 60 * 60 * 24)));
                                        return (
                                            <div key={item.trashId} className="p-3 flex items-center justify-between gap-3 hover:bg-white/[0.02] transition-colors">
                                                <div className="min-w-0 flex-1">
                                                    <div className="text-xs font-bold text-white truncate">{item.fileName}</div>
                                                    <div className="text-[10px] text-gray-500 mt-0.5">
                                                        Eliminato il {new Date(item.deletedAt).toLocaleDateString()} • {daysLeft} giorni rimasti
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1 shrink-0">
                                                    <button
                                                        onClick={() => handleRestore(item.trashId)}
                                                        disabled={isActionRunning}
                                                        className="flex items-center gap-1 px-2 py-1.5 text-[10px] font-bold text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors border border-blue-500/20"
                                                        title="Ripristina progetto"
                                                    >
                                                        <RotateCcw size={12} />
                                                        Ripristina
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeletePermanently(item.trashId)}
                                                        disabled={isActionRunning}
                                                        className="p-1.5 text-red-400/60 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
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

                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Export PDF</label>
                        <div className="bg-black/30 border border-white/10 rounded-xl p-3 space-y-3">
                            <label className="flex items-center justify-between gap-3 text-sm text-white/80">
                                <span className="text-xs font-semibold text-white/80">Mantieni spread in due pagine</span>
                                <input
                                    type="checkbox"
                                    checked={exportSplitSpread}
                                    onChange={(e) => setExportSplitSpread(e.target.checked)}
                                    className="h-4 w-4 accent-blue-500"
                                />
                            </label>
                            <label className="flex items-center justify-between gap-3 text-sm text-white/80">
                                <span className="text-xs font-semibold text-white/80">Inserisci pagine bianche se metà vuota</span>
                                <input
                                    type="checkbox"
                                    checked={exportInsertBlank}
                                    onChange={(e) => setExportInsertBlank(e.target.checked)}
                                    className="h-4 w-4 accent-blue-500"
                                />
                            </label>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Formato output</div>
                                    <select
                                        value={exportFormat}
                                        onChange={(e) => setExportFormat(e.target.value as 'A4' | 'original')}
                                        className="w-full bg-black/30 border border-white/10 rounded-lg py-2 px-2 text-xs text-white focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all"
                                    >
                                        <option value="A4">A4</option>
                                        <option value="original">Originale (rapporto)</option>
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Anteprima export nel reader</div>
                                    <label className="flex items-center justify-between gap-3 text-sm text-white/80">
                                        <span className="text-xs font-semibold text-white/80">Abilita</span>
                                        <input
                                            type="checkbox"
                                            checked={previewInReader}
                                            onChange={(e) => setPreviewInReader(e.target.checked)}
                                            className="h-4 w-4 accent-blue-500"
                                        />
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Diagnostica</label>
                        <div className="bg-black/30 border border-white/10 rounded-xl p-3 space-y-3">
                            <label className="flex items-center justify-between gap-3 text-sm text-white/80">
                                <span className="text-xs font-semibold text-white/80">Log di Debug (Avanzato)</span>
                                <input
                                    type="checkbox"
                                    checked={verboseEnabled}
                                    onChange={(e) => setVerboseEnabled(e.target.checked)}
                                    className="h-4 w-4 accent-blue-500"
                                />
                            </label>
                            <div className="text-[10px] text-gray-500 leading-relaxed">
                                Abilita messaggi dettagliati in console e log file. Utile per capire il flusso completo.
                            </div>
                            <button
                                onClick={async () => {
                                    try {
                                        if (!window.electronAPI) return;
                                        await window.electronAPI.openLogsDir();
                                    } catch { }
                                }}
                                className="text-[10px] uppercase font-bold px-2 py-1 rounded bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                            >
                                Apri cartella log
                            </button>
                            <button
                                onClick={async () => {
                                    try {
                                        if (!window.electronAPI) return;
                                        const btn = document.activeElement as HTMLButtonElement;
                                        const originalText = btn.innerText;
                                        btn.innerText = 'Verifica in corso...';
                                        btn.disabled = true;

                                        const res = await window.electronAPI.loggerSelfcheck();

                                        if (res && res.success) {
                                            alert(`Test completato con successo!\n\nI log di test sono stati scritti in:\n${res.path}`);
                                        } else {
                                            alert(`Errore durante il test:\n${res?.error || 'Errore sconosciuto'}`);
                                        }

                                        btn.innerText = originalText;
                                        btn.disabled = false;
                                    } catch (e) {
                                        alert(`Errore imprevisto: ${e}`);
                                    }
                                }}
                                className="text-[10px] uppercase font-bold px-2 py-1 rounded bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-wait"
                                title="Verifica che il sistema di log funzioni correttamente"
                            >
                                Test Diagnostico
                            </button>
                        </div>
                    </div>

                    {provider === 'openai' && (
                        <>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Modello OpenAI</label>
                                <input
                                    value={openAIModel}
                                    onChange={(e) => setOpenAIModel(e.target.value)}
                                    placeholder="gpt-4o-mini"
                                    className="w-full bg-black/30 border border-white/10 rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all font-mono"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Ragionamento</label>
                                    <select
                                        value={openAIReasoningEffort}
                                        onChange={(e) => setOpenAIReasoningEffort(e.target.value as ReasoningEffort)}
                                        className="w-full bg-black/30 border border-white/10 rounded-xl py-3 px-3 text-sm text-white focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all"
                                    >
                                        <option value="none">nessuno</option>
                                        <option value="low">basso</option>
                                        <option value="medium">medio</option>
                                        <option value="high">alto</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Dettaglio</label>
                                    <select
                                        value={openAIVerbosity}
                                        onChange={(e) => setOpenAIVerbosity(e.target.value as VerbosityLevel)}
                                        className="w-full bg-black/30 border border-white/10 rounded-xl py-3 px-3 text-sm text-white focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all"
                                    >
                                        <option value="low">basso</option>
                                        <option value="medium">medio</option>
                                        <option value="high">alto</option>
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">OpenAI API Key</label>
                                    <button
                                        onClick={handleTestConnection}
                                        disabled={testStatus === 'testing'}
                                        className={`text-[10px] uppercase font-bold px-2 py-1 rounded transition-colors flex items-center gap-1.5 ${testStatus === 'success' ? 'bg-green-500/10 text-green-400' :
                                            testStatus === 'error' ? 'bg-red-500/10 text-red-400' :
                                                testStatus === 'testing' ? 'bg-blue-500/10 text-blue-400' :
                                                    'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
                                            }`}
                                    >
                                        <Activity size={12} className={testStatus === 'testing' ? 'animate-spin' : ''} />
                                        {testStatus === 'idle' ? 'Test Funzionamento' :
                                            testStatus === 'testing' ? 'Test in corso...' :
                                                testStatus === 'success' ? 'Funzionamento OK' : 'Errore Test'}
                                    </button>
                                </div>
                                {testMessage && (
                                    <div className={`text-[10px] font-semibold ${testStatus === 'success' ? 'text-green-400' : testStatus === 'error' ? 'text-red-400' : 'text-gray-400'}`}>
                                        {testMessage}
                                    </div>
                                )}
                                <div className="relative group">
                                    <input
                                        type="password"
                                        value={isEditingOpenAIKey ? tempOpenAIKey : (openAIKey ? `${openAIKey.slice(0, 3)}••••••••••••` : '')}
                                        onChange={isEditingOpenAIKey ? (e) => setTempOpenAIKey(e.target.value) : undefined}
                                        readOnly={!isEditingOpenAIKey}
                                        placeholder="sk-..."
                                        className="w-full bg-black/30 border border-white/10 rounded-xl py-3 pl-4 pr-20 text-sm text-white focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all font-mono"
                                    />
                                    <button
                                        onClick={() => {
                                            setIsEditingOpenAIKey((v) => {
                                                const next = !v;
                                                if (next) setTempOpenAIKey('');
                                                return next;
                                            });
                                        }}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 px-2 py-1 text-[10px] font-bold rounded-lg bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                                    >
                                        {isEditingOpenAIKey ? 'Annulla' : 'Modifica'}
                                    </button>
                                </div>
                                <p className="text-[10px] text-gray-500 leading-relaxed">
                                    La chiave verrà salvata esclusivamente nella memoria locale del tuo dispositivo.
                                    Nessun dato viene inviato a server esterni oltre al provider selezionato per la traduzione.
                                </p>
                            </div>
                        </>
                    )}

                    <div className="pt-6 border-t border-white/5">
                        {(isLibraryView || onRedoAll) && (
                            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 block">Zona Pericolo / Azioni Avanzate</label>
                        )}
                        <div className="grid grid-cols-1 gap-3">
                            {!isLibraryView && onRedoAll && (
                                <button
                                    onClick={() => {
                                        onClose();
                                        onRedoAll();
                                    }}
                                    className="w-full text-left p-3 rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 transition-all group"
                                >
                                    <div className="text-sm font-bold text-red-200 group-hover:text-red-100">Reset e Ritraduci Tutto</div>
                                    <div className="text-[10px] text-red-300/60 group-hover:text-red-300/80 mt-1">
                                        Cancella tutte le traduzioni e le annotazioni di questo libro e ricomincia da capo.
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
                                    className={`w-full text-left p-3 rounded-xl border transition-all group ${!isRenameLegacyRunning && !isRenameAllRunning
                                        ? 'bg-blue-500/10 border-blue-500/20 hover:bg-blue-500/20'
                                        : 'bg-white/5 border-white/10 opacity-60 cursor-not-allowed'
                                        }`}
                                >
                                    <div className={`text-sm font-bold ${!isRenameLegacyRunning && !isRenameAllRunning ? 'text-blue-200 group-hover:text-blue-100' : 'text-white/60'
                                        }`}>Aggiorna Nomi File (Retroattivo)</div>
                                    <div className={`text-[10px] mt-1 ${!isRenameLegacyRunning && !isRenameAllRunning ? 'text-blue-300/60 group-hover:text-blue-300/80' : 'text-gray-400'
                                        }`}>
                                        {isRenameLegacyRunning ? 'Operazione in corso…' : 'Scansiona la libreria per trovare libri con vecchi nomi e prova a rinominarli in formato Anno_Autore_Titolo.'}
                                    </div>
                                    {!isLibraryView && (
                                        <div className="text-[10px] text-amber-500 mt-1">Nota: Questa operazione agisce sulla libreria globale.</div>
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
                                    className={`w-full text-left p-3 rounded-xl border transition-all group ${!isRenameLegacyRunning && !isRenameAllRunning
                                        ? 'bg-indigo-500/10 border-indigo-500/20 hover:bg-indigo-500/20'
                                        : 'bg-white/5 border-white/10 opacity-60 cursor-not-allowed'
                                        }`}
                                >
                                    <div className={`text-sm font-bold ${!isRenameLegacyRunning && !isRenameAllRunning ? 'text-indigo-200 group-hover:text-indigo-100' : 'text-white/60'
                                        }`}>Aggiorna Nomi File (Tutti)</div>
                                    <div className={`text-[10px] mt-1 ${!isRenameLegacyRunning && !isRenameAllRunning ? 'text-indigo-300/60 group-hover:text-indigo-300/80' : 'text-gray-400'
                                        }`}>
                                        {isRenameAllRunning ? 'Operazione in corso…' : 'Scansiona tutti i file presenti e rinomina quando Anno/Autore/Titolo sono disponibili.'}
                                    </div>
                                    {!isLibraryView && (
                                        <div className="text-[10px] text-amber-500 mt-1">Nota: Questa operazione agisce sulla libreria globale.</div>
                                    )}
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                <div className="p-4 bg-white/[0.02] border-t border-white/5 flex justify-end gap-3 shrink-0">
                    <button onClick={onClose} className="px-4 py-2 text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
                        Annulla
                    </button>
                    <button
                        onClick={async () => {
                            const finalGeminiKey = isEditingGeminiKey && tempGeminiKey.trim() ? tempGeminiKey : geminiKey;
                            const finalOpenAIKey = isEditingOpenAIKey && tempOpenAIKey.trim() ? tempOpenAIKey : openAIKey;
                            
                            const settingsToSave: AISettings = {
                                provider,
                                translationConcurrency,
                                qualityCheck: {
                                    enabled: qualityEnabled,
                                    verifierModel: qualityModel,
                                    maxAutoRetries: qualityMaxRetries
                                },
                                gemini: { apiKey: finalGeminiKey, model: geminiModel },
                                openai: { apiKey: finalOpenAIKey, model: openAIModel, reasoningEffort: openAIReasoningEffort, verbosity: openAIVerbosity },
                                legalContext,
                                verboseLogs: verboseEnabled,
                                customProjectsPath,
                                inputLanguageDefault: defaultInputLang.trim() || 'tedesco',
                                exportOptions: {
                                    splitSpreadIntoTwoPages: exportSplitSpread,
                                    insertBlankPages: exportInsertBlank,
                                    outputFormat: exportFormat,
                                    previewInReader
                                }
                            };

                            const keyToTest = provider === 'gemini' ? finalGeminiKey : finalOpenAIKey;
                            const modelToTest = provider === 'gemini' ? geminiModel : openAIModel;

                            if (!keyToTest.trim()) return;
                            setTestStatus('testing');
                            try {
                                const ok = provider === 'gemini' 
                                    ? await testGeminiConnection(keyToTest, modelToTest as GeminiModel)
                                    : await testOpenAIConnection(keyToTest, modelToTest as OpenAIModel);
                                    
                                if (!ok) {
                                    setTestStatus('error');
                                    const proceed = () => onSave(settingsToSave);

                                    if (showConfirm) {
                                        showConfirm(
                                            "Test Fallito", 
                                            `Il test di connessione con ${provider} è fallito. Vuoi salvare comunque le impostazioni?\n\n(Potresti non essere in grado di tradurre finché non risolvi il problema)`, 
                                            proceed, 
                                            'danger'
                                        );
                                    } else if (confirm(`Il test di connessione con ${provider} è fallito. Vuoi salvare comunque le impostazioni?\n\n(Potresti non essere in grado di tradurre finché non risolvi il problema)`)) {
                                        proceed();
                                    }
                                    return;
                                } else {
                                    setTestStatus('success');
                                    // Breve attesa per mostrare lo stato di successo prima di chiudere
                                    await new Promise(resolve => setTimeout(resolve, 800));
                                }
                            } catch (e) {
                                setTestStatus('error');
                                const proceed = () => onSave(settingsToSave);

                                if (showConfirm) {
                                    showConfirm(
                                        "Errore Test", 
                                        `Errore durante il test (${e}). Vuoi salvare comunque?`, 
                                        proceed, 
                                        'danger'
                                    );
                                } else if (confirm(`Errore durante il test (${e}). Vuoi salvare comunque?`)) {
                                    proceed();
                                }
                                return;
                            }
                            
                            onSave(settingsToSave);
                        }}
                        disabled={!canSave || testStatus === 'testing'}
                        className="px-6 py-2 bg-[#007AFF] hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-lg transition-all shadow-lg shadow-blue-500/20 flex items-center gap-2"
                    >
                        {testStatus === 'testing' ? (
                            <>
                                <Activity size={14} className="animate-spin" />
                                Verifica in corso...
                            </>
                        ) : (
                            <>
                                <Check size={14} />
                                Salva Configurazione
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}, areSettingsModalPropsEqual);
