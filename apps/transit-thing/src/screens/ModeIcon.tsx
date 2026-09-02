import type { Mode } from '../transit/types';

const LABEL: Record<Mode, string> = { bus: 'Bus', rail: 'Train', ferry: 'Ferry', tram: 'Streetcar' };

export function ModeIcon({ mode, className = '' }: { mode: Mode; className?: string }) {
  const common = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, className, role: 'img', 'aria-label': LABEL[mode] };
  switch (mode) {
    case 'rail':
      return (
        <svg {...common}>
          <rect x="5" y="3" width="14" height="14" rx="3" />
          <path d="M5 10h14M9 21l1.5-3M15 21l-1.5-3" />
          <circle cx="9" cy="14" r="0.6" fill="currentColor" />
          <circle cx="15" cy="14" r="0.6" fill="currentColor" />
        </svg>
      );
    case 'ferry':
      return (
        <svg {...common}>
          <path d="M4 15l1.5 4h13L20 15" />
          <path d="M6 15V9h12v6M10 9V5h4v4" />
          <path d="M2 20c2 0 2-1 4-1s2 1 4 1 2-1 4-1 2 1 4 1 2-1 4-1" />
        </svg>
      );
    case 'tram':
      return (
        <svg {...common}>
          <rect x="5" y="6" width="14" height="12" rx="2" />
          <path d="M8 2l4 4 4-4M5 12h14M9 22l1-4M15 22l-1-4" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <rect x="4" y="4" width="16" height="14" rx="3" />
          <path d="M4 11h16M8 21v-3M16 21v-3" />
          <circle cx="8" cy="15" r="0.6" fill="currentColor" />
          <circle cx="16" cy="15" r="0.6" fill="currentColor" />
        </svg>
      );
  }
}
