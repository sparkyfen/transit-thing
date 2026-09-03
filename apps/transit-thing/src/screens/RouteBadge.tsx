import { badgeColors } from '../transit/format';
import { modeFor } from '../transit/mode';
import { ModeIcon } from './ModeIcon';

interface Props {
  name: string;
  color: string | null;
  headsign?: string;
  size: 'lg' | 'sm';
}

export function RouteBadge({ name, color, headsign, size }: Props) {
  const { bg, fg } = badgeColors(color);
  return (
    <span
      className={`inline-flex min-w-[4.5rem] max-w-[9rem] items-center gap-2 border border-edge font-display font-medium ${size === 'lg' ? 'px-3 py-2 text-title' : 'px-2 py-1 text-row'}`}
      style={{ background: bg, color: fg }}>
      <ModeIcon mode={modeFor(name, headsign)} className="shrink-0" />
      <span className="truncate">{name}</span>
    </span>
  );
}
