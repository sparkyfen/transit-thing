import { useEffect, useRef } from 'react';
import { clockTime, countdown, countdownLabel, rowTitle } from '../transit/format';
import { boardStatus, type Connection } from '../transit/status';
import type { Slot, Trip } from '../transit/types';
import { RouteBadge } from './RouteBadge';

interface Props {
  slot: Slot | null;
  slotIndex: number;
  slotCount: number;
  trips: Trip[];
  perStop: number;
  nowMs: number;
  connection: Connection;
  updatedMs: number | null;
  onAddStop: () => void;
}

export function Board({ slot, slotIndex, slotCount, trips, perStop, nowMs, connection, updatedMs, onAddStop }: Props) {
  // focus lands on the screen root when the board comes back, never on body
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    root.current?.focus({ preventScroll: true });
  }, []);
  if (!slot) {
    return (
      <main ref={root} tabIndex={-1} className="flex h-full w-full flex-col items-center justify-center gap-6 bg-bg px-16 text-center text-off-white outline-none">
        <h1 className="m-0 font-display text-screen-title font-medium tracking-display">No stops yet</h1>
        <p className="m-0 max-w-[36ch] text-title text-soft">Add a stop from the companion app, or pick one near you.</p>
        <button className="border border-accent bg-accent px-8 py-4 font-mono text-row-lg text-screen" onClick={onAddStop}>
          Find nearby stops
        </button>
      </main>
    );
  }
  const connected = connection === 'open';
  const status = boardStatus(connection, updatedMs);
  const anyLive = connected && trips.some(t => t.isRealtime);
  return (
    <main ref={root} tabIndex={-1} className="flex h-full w-full flex-col bg-bg text-off-white outline-none">
      <header className="flex items-end justify-between gap-6 border-b border-rule px-8 pt-6 pb-3">
        <div className="min-w-0">
          <div className="font-mono text-hint tracking-[0.25em] text-soft uppercase">
            Stop {slotIndex + 1} of {slotCount}
            {slotIndex < 4 ? ` · preset ${slotIndex + 1}` : ''}
          </div>
          <h1 className="m-0 truncate font-display text-screen-title font-medium leading-tight tracking-display">{slot.stopName}</h1>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <div className="font-mono text-title tabular-nums text-near">{clockTime(Math.floor(nowMs / 1000))}</div>
          <div className={`font-mono text-hint ${status?.warn ? 'text-warn' : 'text-soft'}`} aria-live="polite">
            {status?.text}
          </div>
        </div>
      </header>
      <ol className="m-0 grid flex-1 list-none px-8 py-2" style={{ gridTemplateRows: `repeat(${perStop}, minmax(0, 1fr))` }}>
        {trips.length === 0 ? (
          <li className="row-span-full self-center text-center text-title text-soft">No arrivals scheduled.</li>
        ) : (
          trips.map(trip => {
            const min = countdown(trip.arrivalTime, nowMs);
            return (
              <li key={trip.tripId} className="grid grid-cols-[auto_1fr_auto] items-center gap-5 border-b border-rule last:border-b-0">
                <RouteBadge name={trip.routeName} color={trip.routeColor} headsign={trip.headsign} size="lg" />
                <div className="min-w-0 truncate text-row-lg text-near">{rowTitle(trip.routeName, trip.headsign)}</div>
                <div className="flex items-center gap-3">
                  <span className="flex h-[3.25rem] w-[8.5rem] items-baseline justify-end gap-2">
                    <span className="sr-only">{countdownLabel(min)}</span>
                    <span
                      className={`font-display text-[3.25rem] leading-none font-medium tabular-nums tracking-display ${connected ? '' : 'text-soft'}`}
                      aria-hidden="true">
                      {min}
                    </span>
                    {min === 'now' ? null : (
                      <span className="font-mono text-hint text-soft" aria-hidden="true">
                        min
                      </span>
                    )}
                  </span>
                  <span className="flex w-[5.5rem] items-center justify-end gap-2 font-mono text-body tabular-nums text-soft">
                    {clockTime(trip.arrivalTime)}
                    {connected ? (
                      <span
                        className={`inline-block h-2 w-2 rounded-full ${trip.isRealtime ? 'bg-ok' : 'bg-transparent'}`}
                        role="img"
                        aria-label={trip.isRealtime ? 'Live estimate' : 'Scheduled time'}
                      />
                    ) : null}
                  </span>
                </div>
              </li>
            );
          })
        )}
      </ol>
      <footer className="flex items-center justify-between px-8 pb-4 font-mono text-hint text-soft">
        <span className="flex items-center gap-4">
          {anyLive ? (
            <span className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-ok" aria-hidden="true" />
              live
            </span>
          ) : null}
          <span>Turn the dial for the next stop, press it to add one</span>
        </span>
        <button className="border border-edge px-4 py-2 text-near" onClick={onAddStop}>
          Add a stop
        </button>
      </footer>
    </main>
  );
}
