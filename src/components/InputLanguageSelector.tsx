import React from 'react';
import { X } from 'lucide-react';

interface InputLanguageSelectorProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  suggestions?: string[];
  label?: string;
  disabled?: boolean;
  className?: string;
}

export const InputLanguageSelector: React.FC<InputLanguageSelectorProps> = ({
  value,
  onChange,
  placeholder = 'es. inglese, francese, latino...',
  suggestions = [
    'inglese', 'francese', 'spagnolo', 'tedesco', 
    'portoghese', 'russo', 'cinese', 'giapponese', 
    'olandese', 'polacco', 'greco', 'rumeno',
    'bulgaro', 'ucraino', 'arabo', 'coreano', 
    'turco', 'ceco', 'svedese', 'danese', 
    'finlandese', 'norvegese', 'ungherese', 'latino'
  ],
  label,
  disabled,
  className
}) => {
  const filteredSuggestions = suggestions.filter(s => 
    s.toLowerCase().includes(value.toLowerCase()) && 
    s.toLowerCase() !== value.toLowerCase()
  );

  return (
    <div className={className || 'space-y-3'}>
      {label && (
        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block">
          {label}
        </label>
      )}
      <div className="relative group">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus
          className="w-full bg-black/30 border border-white/10 rounded-xl py-3.5 pl-4 pr-10 text-sm text-white focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all placeholder:text-gray-600"
        />
        {value && !disabled && (
          <button
            onClick={() => onChange('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-white transition-colors"
            title="Cancella"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {filteredSuggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {filteredSuggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onChange(s)}
              className="px-2.5 py-1 rounded-lg text-[10px] font-medium border border-white/5 bg-white/5 text-gray-500 hover:bg-white/10 hover:text-gray-300 transition-all"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

