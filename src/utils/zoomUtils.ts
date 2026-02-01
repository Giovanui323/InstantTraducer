import { clamp } from './mathUtils';

type WheelLike = Pick<WheelEvent, 'deltaY' | 'deltaMode'>;

const normalizeDeltaY = (e: WheelLike) => {
  const raw = Number.isFinite(e.deltaY) ? e.deltaY : 0;
  if (e.deltaMode === 1) return raw * 16;
  if (e.deltaMode === 2) return raw * 400;
  return raw;
};

export const getNextScaleFromWheel = (
  currentScale: number,
  e: WheelLike,
  opts: { min: number; max: number; intensity?: number; precision?: number; maxDelta?: number }
) => {
  const min = opts.min;
  const max = opts.max;
  const intensity = Number.isFinite(opts.intensity) ? (opts.intensity as number) : 0.002;
  const maxDelta = Number.isFinite(opts.maxDelta) ? (opts.maxDelta as number) : 50;
  const precisionRaw = Number.isFinite(opts.precision) ? (opts.precision as number) : 3;
  const precision = clamp(Math.round(precisionRaw), 0, 6);

  const s = Number.isFinite(currentScale) ? currentScale : 1;
  const delta = clamp(normalizeDeltaY(e), -maxDelta, maxDelta);
  const factor = Math.exp(-delta * intensity);
  const next = clamp(s * factor, min, max);
  return Number(next.toFixed(precision));
};
