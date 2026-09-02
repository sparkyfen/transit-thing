import { clockTime, countdown } from '../transit/format';
import type { Slot, Trip } from '../transit/types';

interface Props {
  nowMs: number;
  next: { slot: Slot; trip: Trip } | null;
}

export function Ambient({ nowMs, next }: Props) {
  const seconds = Math.floor(nowMs / 1000);
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-8 bg-screen text-off-white">
      <div className="font-display text-[8.5rem] leading-none font-light tabular-nums tracking-display">{clockTime(seconds)}</div>
      {next ? (
        <div className="flex items-baseline gap-4 font-mono text-title text-soft">
          <span>{next.trip.routeName} to {next.trip.headsign}</span>
          <span className="text-near">
            {countdown(next.trip.arrivalTime, nowMs) === 'now' ? 'now' : `in ${countdown(next.trip.arrivalTime, nowMs)} min`}
          </span>
        </div>
      ) : (
        <div className="font-mono text-title text-dim">Nothing due soon</div>
      )}
      <div className="absolute bottom-5 font-mono text-eyebrow tracking-[0.25em] text-dim uppercase">Press any button for the board</div>
    </div>
  );
}
