import { useState, useRef, useCallback, useEffect } from 'react';

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void>;
  threshold?: number;
  disabled?: boolean;
}

interface PullToRefreshState {
  pulling: boolean;
  refreshing: boolean;
  pullDistance: number;
  handlers: {
    onTouchStart: (e: React.TouchEvent) => void;
    onTouchMove: (e: React.TouchEvent) => void;
    onTouchEnd: () => void;
  };
  pullStyle: React.CSSProperties;
}

export function usePullToRefresh({
  onRefresh,
  threshold = 80,
  disabled = false,
}: UsePullToRefreshOptions): PullToRefreshState {
  const [pulling, setPulling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);

  const startY = useRef(0);
  const currentY = useRef(0);
  const containerRef = useRef<HTMLElement | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled || refreshing) return;
    // Only trigger at top of scroll
    const target = e.currentTarget;
    if (target.scrollTop > 5) return;

    startY.current = e.touches[0].clientY;
    currentY.current = e.touches[0].clientY;
  }, [disabled, refreshing]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (disabled || refreshing) return;
    if (startY.current === 0) return;

    const y = e.touches[0].clientY;
    currentY.current = y;
    const diff = Math.max(0, y - startY.current);

    // Apply resistance
    const resisted = diff * 0.4;
    setPullDistance(resisted);
    setPulling(resisted > 10);
  }, [disabled, refreshing]);

  const handleTouchEnd = useCallback(async () => {
    if (disabled || refreshing) return;

    if (pullDistance >= threshold && !refreshing) {
      setRefreshing(true);
      setPulling(false);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
      }
    }

    setPullDistance(0);
    setPulling(false);
    startY.current = 0;
    currentY.current = 0;
  }, [disabled, refreshing, pullDistance, threshold, onRefresh]);

  // Reset on disable
  useEffect(() => {
    if (disabled) {
      setPullDistance(0);
      setPulling(false);
    }
  }, [disabled]);

  const progress = Math.min(pullDistance / threshold, 1);
  const translateY = pulling ? pullDistance : 0;

  return {
    pulling,
    refreshing,
    pullDistance,
    handlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    },
    pullStyle: {
      transform: translateY > 0 ? `translateY(${translateY}px)` : undefined,
      transition: pulling ? 'none' : 'transform 0.2s ease-out',
    },
  };
}
