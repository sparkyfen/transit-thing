import { clockTime, countdown } from '../transit/format';
import type { Slot, Trip } from '../transit/types';
import { RouteBadge } from './RouteBadge';

interface Props {
  nowMs: number;
  next: { slot: Slot; trip: Trip } | null;
}

export function Ambient({ nowMs, next }: Props) {
  const seconds = Math.floor(nowMs / 1000);
  const min = next ? countdown(next.trip.arrivalTime, nowMs) : null;
  return (
    <main className="relative flex h-full w-full flex-col items-center justify-center gap-6 bg-screen text-off-white">
      <h1 className="sr-only">Clock</h1>
      <div className="font-display text-[6rem] leading-none font-medium tabular-nums tracking-display">{clockTime(seconds)}</div>
      {next ? (
        <div className="flex w-[40rem] items-center gap-4">
          <RouteBadge name={next.trip.routeName} color={next.trip.routeColor} headsign={next.trip.headsign} size="sm" />
          <span className="min-w-0 flex-1 truncate text-title text-soft">to {next.trip.headsign}</span>
          <span className="flex w-[11rem] items-baseline gap-2 text-left">
            <span className="sr-only">{min === 'now' ? 'Due now' : `in ${min} minutes`}</span>
            {min === 'now' ? (
              <span className="font-display text-[2.5rem] leading-none font-medium text-accent" aria-hidden="true">
                now
              </span>
            ) : (
              <>
                <span className="font-display text-[4rem] leading-none font-medium tabular-nums tracking-display" aria-hidden="true">
                  {min}
                </span>
                <span className="font-mono text-hint text-soft" aria-hidden="true">
                  min
                </span>
              </>
            )}
          </span>
        </div>
      ) : (
        <div className="font-mono text-title text-soft">Nothing due soon</div>
      )}
      <div className="absolute bottom-5 font-mono text-hint tracking-[0.25em] text-soft uppercase">Press any button for arrivals</div>
    </main>
  );
}
