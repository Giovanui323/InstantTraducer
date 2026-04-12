import React, { useState } from 'react';
import { AISettings, CustomModel, AIProvider } from '../types';
import { Trash2, Activity, Plus, HelpCircle } from 'lucide-react';
import { testOpenAIConnection } from '../services/openaiService';
import { testClaudeConnection } from '../services/claudeService';
import { testGeminiConnection } from '../services/geminiService';

interface CustomModelManagerProps {
  settings: AISettings;
  onUpdateSettings: (updater: (prev: AISettings) => AISettings) => void;
}

export const CustomModelManager: React.FC<CustomModelManagerProps> = ({ settings, onUpdateSettings }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [newModel, setNewModel] = useState<Partial<CustomModel>>({
    provider: 'gemini',
    isCustom: true,
    category: 'flash',
    pricing: { input: 0, output: 0 }
  });

  const [testState, setTestState] = useState<Record<string, { testing: boolean; result?: string; success?: boolean }>>({});

  const handleAdd = () => {
    if (!newModel.id || !newModel.name || !newModel.provider) return;

    onUpdateSettings(prev => {
      const existingModels = prev.customModels || [];
      return {
        ...prev,
        customModels: [...existingModels, newModel as CustomModel]
      };
    });

    setNewModel({
      provider: 'gemini',
      isCustom: true,
      category: 'flash',
      pricing: { input: 0, output: 0 }
    });
    setIsAdding(false);
  };

  const handleRemove = (id: string) => {
    onUpdateSettings(prev => ({
      ...prev,
      customModels: (prev.customModels || []).filter(m => m.id !== id)
    }));
  };

  const handleTestModel = async (model: CustomModel) => {
    setTestState(prev => ({ ...prev, [model.id]: { testing: true } }));
    try {
      let res: { success: boolean; message: string };

      if (model.provider === 'gemini') {
        const apiKey = settings.gemini.apiKey;
        if (!apiKey) throw new Error("API Key Gemini mancante");
        res = await testGeminiConnection(apiKey, model.id as any);
      }
      else if (model.provider === 'openai') {
         if (!settings.openai.apiKey) throw new Error("API Key mancante");
         res = await testOpenAIConnection(settings.openai.apiKey, model.id);
      }
      else if (model.provider === 'claude') {
         if (!settings.claude.apiKey) throw new Error("API Key mancante");
         res = await testClaudeConnection(settings.claude.apiKey, model.id as any);
      } else {
        throw new Error("Provider non supportato");
      }

      setTestState(prev => ({
        ...prev,
        [model.id]: { testing: false, success: res.success, result: res.message }
      }));
    } catch (e: any) {
      setTestState(prev => ({
        ...prev,
        [model.id]: { testing: false, success: false, result: e?.message || "Errore di connessione o modello inesistente." }
      }));
    }
  };

  const models = settings.customModels || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-bold text-txt-muted uppercase tracking-wider flex items-center gap-2">
          Gestione Modelli Personalizzati
          <div className="group relative cursor-help">
             <HelpCircle size={13} className="text-txt-faint" />
             <div className="absolute opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-surface-5/95 backdrop-blur-xl border border-border-muted p-2.5 rounded-lg text-[10px] w-64 top-full mt-1 z-10 text-txt-secondary pointer-events-none shadow-surface-xl">
                In futuro potrai aggiungere manualmente nuovi modelli senza aggiornare l'app.
             </div>
          </div>
        </h3>
        <button
          onClick={() => setIsAdding(!isAdding)}
          className="text-[10px] bg-accent/10 text-accent hover:bg-accent/20 px-3 py-1.5 rounded-lg font-bold transition-all duration-200 flex items-center gap-1 border border-accent/15"
        >
          <Plus size={12} /> Aggiungi Nuovo
        </button>
      </div>

      {isAdding && (
        <div className="bg-surface-3/40 border border-border-muted rounded-xl p-4 space-y-3 animate-fade-in">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[9px] text-txt-muted font-bold uppercase tracking-wider">Provider</label>
              <select
                value={newModel.provider}
                onChange={e => setNewModel({...newModel, provider: e.target.value as AIProvider})}
                className="w-full bg-surface-4/50 border border-border-muted rounded-lg py-2.5 px-3 text-[11px] text-txt-primary focus:outline-none focus:border-accent/40 transition-all duration-200"
              >
                <option value="gemini">Google Gemini</option>
                <option value="claude">Anthropic Claude</option>
                <option value="openai">OpenAI</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[9px] text-txt-muted font-bold uppercase tracking-wider">Nome Interfaccia (Display)</label>
              <input
                type="text"
                value={newModel.name || ''}
                placeholder="es: Gemini 4.5 Super"
                onChange={e => setNewModel({...newModel, name: e.target.value})}
                className="w-full bg-surface-4/50 border border-border-muted rounded-lg py-2.5 px-3 text-[11px] text-txt-primary focus:outline-none focus:border-accent/40 transition-all duration-200 placeholder:text-txt-faint"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] text-txt-muted font-bold uppercase tracking-wider">ID API Vero</label>
              <input
                type="text"
                value={newModel.id || ''}
                placeholder="es: gemini-4.5-pro-vision"
                onChange={e => setNewModel({...newModel, id: e.target.value})}
                className="w-full bg-surface-4/50 border border-border-muted rounded-lg py-2.5 px-3 text-[11px] text-txt-primary font-mono focus:outline-none focus:border-accent/40 transition-all duration-200 placeholder:text-txt-faint"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] text-txt-muted font-bold uppercase tracking-wider">Categoria</label>
              <select
                value={newModel.category}
                onChange={e => setNewModel({...newModel, category: e.target.value as any})}
                className="w-full bg-surface-4/50 border border-border-muted rounded-lg py-2.5 px-3 text-[11px] text-txt-primary focus:outline-none focus:border-accent/40 transition-all duration-200"
              >
                <option value="flash">Veloce (Flash / Haiku / Mini)</option>
                <option value="pro">Pro (Pro / Opus / O1)</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border-muted">
            <button onClick={() => setIsAdding(false)} className="text-[10px] px-3 py-1.5 text-txt-muted hover:text-txt-secondary hover:bg-white/[0.04] rounded-lg transition-all duration-200">Annulla</button>
            <button onClick={handleAdd} disabled={!newModel.id || !newModel.name} className="text-[10px] font-bold bg-success/10 text-success px-4 py-1.5 rounded-lg hover:bg-success/20 transition-all duration-200 disabled:opacity-40 border border-success/15">Salva Modello</button>
          </div>
        </div>
      )}

      {models.length === 0 && !isAdding && (
        <div className="text-center py-6 border border-dashed border-border-muted rounded-xl">
          <p className="text-[11px] text-txt-muted">Nessun modello personalizzato aggiunto.</p>
        </div>
      )}

      <div className="space-y-2">
        {models.map(m => (
          <div key={m.id} className="bg-surface-3/30 border border-border-muted rounded-lg p-3 flex flex-col gap-2">
             <div className="flex justify-between items-center">
                <div>
                   <div className="flex items-center gap-2">
                      <span className="text-[12px] font-bold text-txt-primary">{m.name}</span>
                      <span className="text-[8px] px-2 py-0.5 rounded-md bg-surface-4 text-txt-muted uppercase tracking-wider font-bold">{m.provider}</span>
                   </div>
                   <p className="text-[10px] text-txt-faint font-mono mt-0.5">{m.id}</p>
                </div>
                <div className="flex items-center gap-2">
                   <button
                     onClick={() => handleTestModel(m)}
                     disabled={testState[m.id]?.testing}
                     title="Lancia una richiesta da 1 token per validare che l'endpoint non vada in 404. Costo quasi nullo."
                     className="text-[10px] px-3 py-1.5 font-bold rounded-lg bg-accent/10 text-accent hover:bg-accent/20 transition-all duration-200 flex items-center gap-1 disabled:opacity-40 border border-accent/15"
                   >
                     {testState[m.id]?.testing ? 'Testando...' : <><Activity size={12}/> Testa (0.00c)</>}
                   </button>
                   <button onClick={() => handleRemove(m.id)} className="p-1.5 text-txt-faint hover:text-danger hover:bg-danger/10 rounded-md transition-all duration-200">
                      <Trash2 size={14} />
                   </button>
                </div>
             </div>
             {testState[m.id]?.result && (
                <div className={`text-[10px] mt-1 p-2 rounded-lg border ${
                  testState[m.id].success
                    ? 'border-success/15 text-success bg-success/5'
                    : 'border-danger/15 text-danger bg-danger/5'
                }`}>
                   {testState[m.id].result}
                </div>
             )}
          </div>
        ))}
      </div>
    </div>
  );
}
