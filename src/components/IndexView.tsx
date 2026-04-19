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
        <div className="text-reader-light-text leading-relaxed book-text font-reader" style={{
          lineHeight: 1.55
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
          <div key={i} className={`${cols.length === 2 && i === 0 ? 'border-r border-reader-light-border pr-6' : ''}`}>
            <div className="space-y-1.5">
              {entries.map((e, idx) => {
                if (e.isHeading) {
                  return (
                    <div key={idx} className="mt-4 mb-2 font-semibold tracking-wide text-reader-light-text uppercase text-[0.85em]">
                      {e.label}
                    </div>
                  );
                }
                if (e.page) {
                  const pNum = parseInt(e.page, 10);
                  return (
                    <div
                      key={idx}
                      className="grid grid-cols-[auto_1fr_auto] items-baseline gap-2 group cursor-pointer rounded-md px-1.5 -mx-1.5 py-0.5 hover:bg-marker-yellow/40 transition-colors duration-150"
                      onClick={() => !isNaN(pNum) && onPageClick?.(pNum)}
                    >
                      <span className="truncate text-reader-light-text group-hover:text-reader-light-text transition-colors duration-150">{e.label}</span>
                      <div className="border-t border-dotted border-reader-light-text-soft/40 translate-y-[0.25em]" />
                      <span className="tabular-nums font-semibold text-reader-light-text-soft group-hover:text-accent transition-colors duration-150">{e.page}</span>
                    </div>
                  );
                }
                return <div key={idx} className="text-reader-light-text-soft">{e.label}</div>;
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};
