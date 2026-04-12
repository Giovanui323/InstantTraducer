import { useState, useCallback, useRef, useEffect } from 'react';
import type { RefObject } from 'react';
import { getNextScaleFromWheel } from '../utils/zoomUtils';

interface UseZoomSystemProps {
  initialScale?: number;
  value?: number;
  onChange?: (scale: number) => void;
  minScale?: number;
  maxScale?: number;
  step?: number;
  precision?: number;
  scrollContainerRef?: RefObject<HTMLElement | null>;
}

export const useZoomSystem = ({
  initialScale = 1,
  value,
  onChange,
  minScale = 0.3,
  maxScale = 5,
  step = 0.1,
  precision = 2,
  scrollContainerRef,
}: UseZoomSystemProps = {}) => {
  const isControlled = value !== undefined;
  
  const [internalScale, setInternalScale] = useState<number>(() => {
    return Math.max(minScale, Math.min(maxScale, Number(initialScale.toFixed(precision))));
  });

  const scale = isControlled ? value : internalScale;
  
  // Keep a ref to the current scale to allow stable event handlers
  const scaleRef = useRef(scale);
  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  const setScale = useCallback((newScale: number) => {
    const clamped = Math.max(minScale, Math.min(maxScale, newScale));
    const rounded = Number(clamped.toFixed(precision));
    
    if (isControlled) {
      onChange?.(rounded);
      return;
    }

    setInternalScale(rounded);
  }, [minScale, maxScale, precision, isControlled, onChange]);

  const zoomIn = useCallback(() => {
    const current = scaleRef.current as number;
    const next = Math.min(maxScale, current + step);
    setScale(next);
  }, [maxScale, step, setScale]);

  const zoomOut = useCallback(() => {
    const current = scaleRef.current as number;
    const next = Math.max(minScale, current - step);
    setScale(next);
  }, [minScale, step, setScale]);

  const resetZoom = useCallback(() => {
    setScale(initialScale);
  }, [initialScale, setScale]);

  // Throttling wheel events
  const rafRef = useRef<number | null>(null);

  const pendingScrollRef = useRef<null | { scale: number; left: number; top: number }>(null);
  const applyScrollRafRef = useRef<number | null>(null);
  
  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      if (applyScrollRafRef.current) {
        cancelAnimationFrame(applyScrollRafRef.current);
      }
    };
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent | WheelEvent) => {
    // Only handle if Ctrl key is pressed (standard for zoom)
    if (!e.ctrlKey) return;
    
    e.preventDefault();
    e.stopPropagation();

    if (rafRef.current) return;

    rafRef.current = requestAnimationFrame(() => {
      const current = scaleRef.current as number;
      const next = getNextScaleFromWheel(current, e as WheelEvent, { 
        min: minScale, 
        max: maxScale, 
        precision 
      });
      
      if (next !== current) {
        const container = scrollContainerRef?.current;
        if (container) {
          const rect = container.getBoundingClientRect();
          const wheelEvent = e as WheelEvent;
          const anchorX = wheelEvent.clientX - rect.left;
          const anchorY = wheelEvent.clientY - rect.top;
          const ratio = next / current;
          const left = (container.scrollLeft + anchorX) * ratio - anchorX;
          const top = (container.scrollTop + anchorY) * ratio - anchorY;
          pendingScrollRef.current = { scale: next, left, top };
        }

        setScale(next);
      }
      rafRef.current = null;
    });
  }, [minScale, maxScale, precision, scrollContainerRef, setScale]);

  useEffect(() => {
    const pending = pendingScrollRef.current;
    const container = scrollContainerRef?.current;
    if (!pending || !container) return;
    if (Math.abs(pending.scale - (scale as number)) > 0.0005) return;

    applyScrollRafRef.current = requestAnimationFrame(() => {
      const nextPending = pendingScrollRef.current;
      if (!nextPending || Math.abs(nextPending.scale - (scale as number)) > 0.0005) return;
      container.scrollLeft = nextPending.left;
      container.scrollTop = nextPending.top;
      pendingScrollRef.current = null;
    });

    return () => {
      if (applyScrollRafRef.current) {
        cancelAnimationFrame(applyScrollRafRef.current);
        applyScrollRafRef.current = null;
      }
    };
  }, [scale, scrollContainerRef]);

  return {
    scale: scale as number,
    setScale,
    zoomIn,
    zoomOut,
    resetZoom,
    handleWheel
  };
};
