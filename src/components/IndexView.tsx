import React from 'react';
import { normalize, splitColumns } from '../utils/textUtils';

interface IndexViewProps {
  text: string;
  onPageClick?: (page: number) => void;
}

type Entry = { label: string; page?: string; isHeading?: boolean };

function looksLikeIndex(text: string) {
  const t = text.toUpperCase();
  if (/\bINDICE\b/.test(t) || /\bSOMMARIO\b/.test(t) || /\bTAVOLA DEI CONTENUTI\b/.test(t) || /\bINDEX\b/.test(t)) return true;
  const lines = normalize(text).split('\n').map(l => l.trim()).filter(Boolean);
  let hits = 0;
  for (const l of lines) {
    if (/^\D+?\s+\.{2,}\s*\d{1,4}$/.test(l)) { hits++; continue; }
    if (/^\D+?\s+\d{1,4}$/.test(l)) { hits++; continue; }
  }
  return hits >= Math.max(4, Math.floor(lines.length * 0.3));
}

function parseEntries(text: string): Entry[] {
  const lines = normalize(text).split('\n').map(l => l.trim()).filter(Boolean);
  const entries: Entry[] = [];
  for (const raw of lines) {
    if (/^\*{0,2}INDICE\*{0,2}$/i.test(raw)) {
      entries.push({ label: raw.replace(/\*+/g, ''), isHeading: true });
      continue;
    }
    if (/^[A-Z]\.|^\d+\.|^\bPARTE\b|^\bCAPITOLO\b|^\bSEZIONE\b/i.test(raw)) {
      entries.push({ label: raw.replace(/\s*\.*\s*$/, ''), isHeading: true });
      continue;
    }
    const mDots = raw.match(/^(.+?)\s+\.{2,}\s*(\d{1,4})$/);
    if (mDots) {
      entries.push({ label: mDots[1].trim(), page: mDots[2] });
      continue;
    }
    const mSimple = raw.match(/^(.+?)\s+(\d{1,4})$/);
    if (mSimple) {
      entries.push({ label: mSimple[1].trim(), page: mSimple[2] });
      continue;
    }
    entries.push({ label: raw });
  }
  return entries;
}

export const IndexView: React.FC<IndexViewProps> = ({ text, onPageClick }) => {
  const cols = splitColumns(text);
  const isIndex = looksLikeIndex(text);
  if (!isIndex) {
    return (
      <div className="mx-auto max-w-[70ch]">
        <div className="text-gray-900 leading-relaxed book-text" style={{ 
          fontFamily: 'Iowan Old Style, Palatino, "Palatino Linotype", "Book Antiqua", Georgia, Cambria, "Times New Roman", Times, serif',
          lineHeight: 1.28
        }}>
          {text}
        </div>
      </div>
    );
  }

  return (
    <div className={`h-full ${cols.length === 2 ? 'grid grid-cols-2 gap-8' : ''}`}>
      {cols.map((c, i) => {
        const entries = parseEntries(c);
        return (
          <div key={i} className={`${cols.length === 2 && i === 0 ? 'border-r border-black/10 pr-6' : ''}`}>
            <div className="space-y-1.5">
              {entries.map((e, idx) => {
                if (e.isHeading) {
                  return (
                    <div key={idx} className="mt-3 mb-2 font-semibold tracking-wide text-stone-900">
                      {e.label}
                    </div>
                  );
                }
                if (e.page) {
                  const pNum = parseInt(e.page, 10);
                  return (
                    <div key={idx} className="grid grid-cols-[auto_1fr_auto] items-baseline gap-2 group cursor-pointer" onClick={() => !isNaN(pNum) && onPageClick?.(pNum)}>
                      <span className="truncate group-hover:text-blue-700 transition-colors">{e.label}</span>
                      <div className="border-t border-dotted border-stone-400 translate-y-[0.25em]" />
                      <span className="tabular-nums font-medium group-hover:text-blue-700 transition-colors underline decoration-dotted underline-offset-4">{e.page}</span>
                    </div>
                  );
                }
                return <div key={idx} className="text-stone-800">{e.label}</div>;
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};
