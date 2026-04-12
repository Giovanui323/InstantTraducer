import { ZoomIn, ZoomOut, Sun, SunSnow, LayoutTemplate, BookOpen } from 'lucide-react';
import { useZoomSystem } from '../hooks/useZoomSystem';
import type { ReaderViewModePreference } from './reader/bookLayout';

interface ControlsBarProps {
  brightness: number;
  temperature: number;
  translationTheme: 'light' | 'sepia' | 'dark';
  scale: number;
  viewMode: ReaderViewModePreference;
  onScale: (s: number) => void;
  onBrightnessChange: (b: number) => void;
  onTemperatureChange: (t: number) => void;
  onThemeChange: (t: 'light' | 'sepia' | 'dark') => void;
  onViewModeChange: (v: ReaderViewModePreference) => void;
  columnLayout: number;
  onColumnLayoutChange: (l: number) => void;
}

export const ControlsBar: React.FC<ControlsBarProps> = ({
  brightness,
  temperature,
  translationTheme,
  scale,
  viewMode,
  onScale,
  onBrightnessChange,
  onTemperatureChange,
  onThemeChange,
  onViewModeChange,
  columnLayout,
  onColumnLayoutChange
}) => {
  const { zoomIn, zoomOut } = useZoomSystem({
    value: scale,
    onChange: onScale,
    minScale: 0.3,
    maxScale: 5,
    precision: 4
  });

  const decBrightness = () => onBrightnessChange(Math.max(0.4, Math.min(1.6, brightness - 0.05)));
  const incBrightness = () => onBrightnessChange(Math.max(0.4, Math.min(1.6, brightness + 0.05)));

  const SegmentedControl = ({ value, options, onChange }: { value: string | number, options: { value: string | number, label: string, title?: string }[], onChange: (v: any) => void }) => (
    <div className="flex items-center bg-white/[0.03] rounded-lg p-0.5 border border-border-muted">
      {options.map(opt => (
        <button
          key={String(opt.value)}
          onClick={() => onChange(opt.value)}
          className={`px-2 py-1 rounded-md text-[10px] font-semibold transition-all duration-200 ${
            (typeof opt.value === 'number' ? Math.abs(Number(value) - Number(opt.value)) < 0.01 : value === opt.value)
              ? 'bg-white/[0.08] text-txt-primary border border-white/[0.06] shadow-inner-glow'
              : 'text-txt-muted hover:text-txt-secondary border border-transparent hover:bg-white/[0.03]'
          }`}
          title={opt.title || opt.label}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="fixed top-14 right-4 z-[120] app-region-no-drag pointer-events-auto controls-container animate-fade-in">
      <div className="rounded-xl glass-panel p-3 flex flex-col gap-2.5">
        {/* Row 1: Zoom + Brightness + Temperature */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-white/[0.03] rounded-lg p-0.5 border border-border-muted">
            <button onClick={zoomOut} className="p-1.5 text-txt-muted hover:text-txt-primary hover:bg-white/[0.06] rounded-md transition-all duration-150"><ZoomOut size={13} /></button>
            <button onClick={zoomIn} className="p-1.5 text-txt-muted hover:text-txt-primary hover:bg-white/[0.06] rounded-md transition-all duration-150"><ZoomIn size={13} /></button>
          </div>

          <div className="h-4 w-px bg-border-muted" />

          <div className="flex items-center bg-white/[0.03] rounded-lg px-2 py-1 border border-border-muted gap-2">
            <Sun size={13} className="text-txt-muted shrink-0" />
            <button onClick={decBrightness} className="px-1.5 py-0.5 text-[10px] rounded-md text-txt-muted hover:text-txt-primary hover:bg-white/[0.06] transition-all duration-100">−</button>
            <input
              type="range"
              min={40}
              max={160}
              step={1}
              value={Math.round(((brightness ?? 1) * 100))}
              onChange={(e) => onBrightnessChange(Math.max(0.4, Math.min(1.6, Number(e.target.value) / 100)))}
              className="w-24 cursor-pointer"
              aria-label="Luminosità"
            />
            <button onClick={incBrightness} className="px-1.5 py-0.5 text-[10px] rounded-md text-txt-muted hover:text-txt-primary hover:bg-white/[0.06] transition-all duration-100">+</button>
            <div className="ml-1 w-10 text-right text-[10px] font-mono text-txt-muted tabular-nums">{Math.round(((brightness ?? 1) * 100))}%</div>
          </div>

          <div className="flex items-center bg-white/[0.03] rounded-lg px-2 py-1 border border-border-muted gap-2">
            <SunSnow size={13} className="text-txt-muted shrink-0" />
            <input
              type="range"
              min={-100}
              max={100}
              step={1}
              value={Math.round(temperature ?? 0)}
              onChange={(e) => onTemperatureChange(Math.max(-100, Math.min(100, Number(e.target.value))))}
              className="w-24 cursor-pointer"
              aria-label="Temperatura colore"
            />
            <div className="ml-1 w-16 text-right text-[10px] font-mono text-txt-muted tabular-nums">
              {(() => {
                const t = Math.round(temperature ?? 0);
                if (t > 0) return `Caldo ${t}%`;
                if (t < 0) return `Freddo ${Math.abs(t)}%`;
                return 'Neutro';
              })()}
            </div>
          </div>
        </div>

        {/* Row 2: Theme + Columns */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-white/[0.03] rounded-lg px-2 py-1 border border-border-muted gap-2">
            <span className="text-[9px] text-txt-muted font-semibold uppercase tracking-wider">Tema</span>
            <SegmentedControl
              value={translationTheme}
              options={[
                { value: 'light', label: 'Chiaro' },
                { value: 'sepia', label: 'Seppia' },
                { value: 'dark', label: 'Scuro' },
              ]}
              onChange={onThemeChange}
            />
          </div>

          <div className="h-4 w-px bg-border-muted" />

          <div className="flex items-center bg-white/[0.03] rounded-lg px-2 py-1 border border-border-muted gap-2">
            <LayoutTemplate size={13} className="text-txt-muted shrink-0" />
            <span className="text-[9px] text-txt-muted font-semibold uppercase tracking-wider">Colonne</span>
            <SegmentedControl
              value={columnLayout}
              options={[
                { value: 0.3, label: '30/70', title: 'Sinistra stretta' },
                { value: 0.5, label: '50/50', title: 'Bilanciato' },
                { value: 0.7, label: '70/30', title: 'Sinistra larga' },
              ]}
              onChange={onColumnLayoutChange}
            />
          </div>
        </div>

        {/* Row 3: Page mode */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-white/[0.03] rounded-lg px-2 py-1 border border-border-muted gap-2">
            <BookOpen size={13} className="text-txt-muted shrink-0" />
            <span className="text-[9px] text-txt-muted font-semibold uppercase tracking-wider">Pagine</span>
            <SegmentedControl
              value={viewMode}
              options={[
                { value: 'auto', label: 'Auto' },
                { value: 'single', label: '1' },
                { value: 'spread', label: '2' },
              ]}
              onChange={onViewModeChange}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
