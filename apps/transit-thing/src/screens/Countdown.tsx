interface Props {
  min: number;
  size: 'board' | 'ambient';
  dim?: boolean;
}

export function countdown(min: number): string {
  return min === 0 ? 'now' : String(min);
}

export function countdownLabel(min: number): string {
  if (min === 0) return 'Due now';
  return min === 1 ? 'In 1 minute' : `In ${min} minutes`;
}

// the min slot stays in the flow when empty so "now" ends where the numerals end
export function Countdown({ min, size, dim = false }: Props) {
  return (
    <span className={`flex items-baseline gap-2 ${size === 'board' ? 'h-[3.25rem] w-[8.5rem] justify-end' : 'h-[4rem]'}`}>
      <span className="sr-only">{countdownLabel(min)}</span>
      <span
        className={`font-display leading-none font-medium tabular-nums tracking-display ${size === 'board' ? 'text-[3.25rem]' : 'text-[4rem]'} ${
          dim ? 'text-soft' : ''
        }`}
        aria-hidden="true">
        {countdown(min)}
      </span>
      <span className="w-[3ch] font-mono text-hint text-soft" aria-hidden="true">
        {min === 0 ? '' : 'min'}
      </span>
    </span>
  );
}
