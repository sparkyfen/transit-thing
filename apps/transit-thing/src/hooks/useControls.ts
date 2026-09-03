import { useEffect, useRef } from 'react';
import type { Action } from '../state';

const DETENT = 60;

export function stepsFor(residue: number, deltaX: number): { steps: number; residue: number } {
  const total = residue + deltaX;
  const steps = Math.trunc(total / DETENT);
  return { steps, residue: total - steps * DETENT };
}

export function useControls(dispatch: (action: Action) => void): void {
  const wheel = useRef(0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const at = Date.now();
      if (e.key === '1' || e.key === '2' || e.key === '3' || e.key === '4') {
        dispatch({ type: 'preset', n: Number(e.key) as 1 | 2 | 3 | 4, at });
      } else if (e.key === 'm' || e.key === 'M') dispatch({ type: 'mode', at });
      else if (e.key === 'Escape') dispatch({ type: 'back', at });
      else if (e.key === 'Enter') {
        // the focused row would also fire click on enter
        e.preventDefault();
        dispatch({ type: 'select', at });
      }
    };
    const onWheel = (e: WheelEvent) => {
      const { steps, residue } = stepsFor(wheel.current, e.deltaX);
      wheel.current = residue;
      const delta = steps > 0 ? 1 : -1;
      for (let i = 0; i < Math.abs(steps); i++) dispatch({ type: 'turn', delta, at: Date.now() });
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('wheel', onWheel);
    };
  }, [dispatch]);
}
