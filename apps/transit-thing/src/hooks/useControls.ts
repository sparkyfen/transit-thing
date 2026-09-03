import { useEffect, useRef } from 'react';
import type { Action } from '../state';

// one wheel notch on the device is a 120 px horizontal wheel event
const DETENT = 120;

export function stepsFor(residue: number, deltaX: number): { steps: number; residue: number } {
  const total = residue + deltaX;
  const steps = Math.trunc(total / DETENT);
  return { steps, residue: total - steps * DETENT };
}

export function wheelPixels(deltaX: number, deltaMode: number): number {
  if (deltaMode === 1) return deltaX * DETENT;
  return deltaX;
}

export function keyToAction(key: string, at: number): Action | null {
  switch (key) {
    case '1':
    case '2':
    case '3':
    case '4':
      return { type: 'preset', n: Number(key) as 1 | 2 | 3 | 4, at };
    case 'm':
    case 'M':
      return { type: 'mode', at };
    case 'Escape':
      return { type: 'back', at };
    case 'Enter':
      return { type: 'select', at };
    case 'ArrowUp':
    case 'ArrowLeft':
      return { type: 'turn', delta: -1, at };
    case 'ArrowDown':
    case 'ArrowRight':
      return { type: 'turn', delta: 1, at };
    default:
      return null;
  }
}

export function useControls(dispatch: (action: Action) => void): void {
  const wheel = useRef(0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const action = keyToAction(e.key, Date.now());
      if (!action) return;
      // enter would also click the focused row, arrows would scroll the list
      if (action.type === 'select' || action.type === 'turn') e.preventDefault();
      dispatch(action);
    };
    const onWheel = (e: WheelEvent) => {
      const { steps, residue } = stepsFor(wheel.current, wheelPixels(e.deltaX, e.deltaMode));
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
