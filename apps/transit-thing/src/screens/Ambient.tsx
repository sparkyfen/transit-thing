import { useScreenFocus } from '../hooks/useScreenFocus';
import { ambientTitle, clockTime, minutesUntil } from '../transit/format';
import type { NextTrip } from '../transit/trips';
import { Countdown } from './Countdown';
import { RouteBadge } from './RouteBadge';

interface Props {
  nowMs: number;
  next: NextTrip | null;
  hasFeed: boolean;
}

export function Ambient({ nowMs, next, hasFeed }: Props) {
  const root = useScreenFocus();
  const seconds = Math.floor(nowMs / 1000);
  return (
    <main ref={root} tabIndex={-1} className="relative flex h-full w-full flex-col items-center justify-center gap-6 bg-screen text-off-white outline-none">
      <h1 className="sr-only">Clock and next arrival</h1>
      <div className="font-display text-[6rem] leading-none font-medium tabular-nums tracking-display">{clockTime(seconds)}</div>
      {next ? (
        <div className="flex max-w-[44rem] flex-col items-center gap-2">
          <div className="flex max-w-full items-center gap-4">
            <RouteBadge name={next.trip.routeName} color={next.trip.routeColor} size="sm" />
            <span className="min-w-0 truncate text-title text-soft">{ambientTitle(next.trip.routeName, next.trip.headsign)}</span>
            <Countdown min={minutesUntil(next.trip.arrivalTime, nowMs)} size="ambient" />
          </div>
          <div className="max-w-full truncate font-mono text-hint text-soft">at {next.slot.stopName}</div>
        </div>
      ) : (
        <div className="font-mono text-title text-soft">{hasFeed ? 'Nothing due soon.' : 'Waiting for arrivals.'}</div>
      )}
      <div className="absolute bottom-5 font-mono text-hint tracking-[0.25em] text-soft uppercase">Press any button for arrivals</div>
    </main>
  );
}
