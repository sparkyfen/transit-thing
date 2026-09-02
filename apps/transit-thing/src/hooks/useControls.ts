import { useEffect, useRef } from 'react';
import type { Action } from '../state';

const DETENT = 60;

export function useControls(dispatch: (action: Action) => void): void {
  const wheel = useRef(0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const at = Date.now();
      if (e.key === '1' || e.key === '2' || e.key === '3' || e.key === '4') {
        dispatch({ type: 'preset', n: Number(e.key) as 1 | 2 | 3 | 4, at });
      } else if (e.key === 'm' || e.key === 'M') dispatch({ type: 'mode', at });
      else if (e.key === 'Escape') dispatch({ type: 'back', at });
      else if (e.key === 'Enter') dispatch({ type: 'select', at });
    };
    const onWheel = (e: WheelEvent) => {
      wheel.current += e.deltaX;
      while (Math.abs(wheel.current) >= DETENT) {
        const delta = wheel.current > 0 ? 1 : -1;
        wheel.current -= delta * DETENT;
        dispatch({ type: 'turn', delta, at: Date.now() });
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('wheel', onWheel);
    };
  }, [dispatch]);
}
