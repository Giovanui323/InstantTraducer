import React from 'react';
import { ZoomIn, ZoomOut, Sun, SunSnow } from 'lucide-react';

interface ControlsBarProps {
  brightness: number;
  temperature: number;
  translationTheme: 'light' | 'sepia' | 'dark';
  scale: number;
  onScale: (s: number) => void;
  onBrightnessChange: (b: number) => void;
  onTemperatureChange: (t: number) => void;
  onThemeChange: (t: 'light' | 'sepia' | 'dark') => void;
}

export const ControlsBar: React.FC<ControlsBarProps> = ({
  brightness,
  temperature,
  translationTheme,
  scale,
  onScale,
  onBrightnessChange,
  onTemperatureChange,
  onThemeChange
}) => {
  const decBrightness = () => onBrightnessChange(Math.max(0.4, Math.min(1.6, brightness - 0.05)));
  const incBrightness = () => onBrightnessChange(Math.max(0.4, Math.min(1.6, brightness + 0.05)));

  return (
    <div className="fixed top-14 right-4 z-[120] app-region-no-drag pointer-events-auto controls-container">
      <div className="rounded-2xl bg-zinc-900/80 backdrop-blur-xl border border-white/10 p-3 shadow-2xl">
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-white/5 rounded-lg p-0.5 border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
            <button onClick={() => onScale(Math.max(0.3, Math.min(5, scale - 0.1)))} className="p-1.5 text-gray-300 hover:text-white hover:bg-white/10 rounded-md"><ZoomOut size={14} /></button>
            <button onClick={() => onScale(Math.max(0.3, Math.min(5, scale + 0.1)))} className="p-1.5 text-gray-300 hover:text-white hover:bg-white/10 rounded-md"><ZoomIn size={14} /></button>
          </div>
          <div className="h-4 w-[1px] bg-white/10 mx-1" />
          <div className="flex items-center bg-white/5 rounded-lg px-2 py-1 border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
            <Sun size={14} className="text-gray-300 mr-2" />
            <button onClick={decBrightness} className="px-2 py-1 text-[10px] rounded-md text-gray-300 hover:text-white hover:bg-white/10">−</button>
            <input
              type="range"
              min={40}
              max={160}
              step={1}
              value={Math.round(((brightness ?? 1) * 100))}
              onChange={(e) => onBrightnessChange(Math.max(0.4, Math.min(1.6, Number(e.target.value) / 100)))}
              className="w-28 accent-[#007AFF] cursor-pointer"
              aria-label="Luminosità"
            />
            <button onClick={incBrightness} className="px-2 py-1 text-[10px] rounded-md text-gray-300 hover:text-white hover:bg-white/10">+</button>
            <div className="ml-2 w-12 text-right text-[10px] font-mono text-gray-300">{Math.round(((brightness ?? 1) * 100))}%</div>
          </div>
          <div className="flex items-center bg-white/5 rounded-lg px-2 py-1 border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
            <SunSnow size={14} className="text-gray-300 mr-2" />
            <input
              type="range"
              min={-100}
              max={100}
              step={1}
              value={Math.round(temperature ?? 0)}
              onChange={(e) => onTemperatureChange(Math.max(-100, Math.min(100, Number(e.target.value))))}
              className="w-28 accent-[#f59e0b] cursor-pointer"
              aria-label="Temperatura colore (freddo/caldo)"
            />
            <div className="ml-2 w-20 text-right text-[10px] font-mono text-gray-300">
              {(() => {
                const t = Math.round(temperature ?? 0);
                if (t > 0) return `Caldo ${t}%`;
                if (t < 0) return `Freddo ${Math.abs(t)}%`;
                return 'Neutro';
              })()}
            </div>
          </div>
          <div className="h-4 w-[1px] bg-white/10 mx-1" />
          <div className="flex items-center bg-white/5 rounded-lg px-1 py-1 border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
            <span className="text-[10px] text-gray-300 px-2">Sfondo testo</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => onThemeChange('light')}
                className={`px-2 py-1 rounded-md text-[10px] font-semibold ${translationTheme === 'light' ? 'bg-white/15 text-white border border-white/20' : 'text-gray-300 hover:text-white hover:bg-white/10 border border-transparent'}`}
                title="Chiaro"
              >
                Chiaro
              </button>
              <button
                onClick={() => onThemeChange('sepia')}
                className={`px-2 py-1 rounded-md text-[10px] font-semibold ${translationTheme === 'sepia' ? 'bg-white/15 text-white border border-white/20' : 'text-gray-300 hover:text-white hover:bg-white/10 border border-transparent'}`}
                title="Seppia"
              >
                Seppia
              </button>
              <button
                onClick={() => onThemeChange('dark')}
                className={`px-2 py-1 rounded-md text-[10px] font-semibold ${translationTheme === 'dark' ? 'bg-white/15 text-white border border-white/20' : 'text-gray-300 hover:text-white hover:bg-white/10 border border-transparent'}`}
                title="Scuro"
              >
                Scuro
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
