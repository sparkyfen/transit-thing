import { useEffect, useRef } from 'react';

// a screen root takes focus when it mounts so focus never rests on body between screens
export function useScreenFocus() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  return ref;
}
