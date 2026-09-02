import { clockTime, countdown, textOn } from '../transit/format';
import { modeFor } from '../transit/mode';
import type { Slot, Trip } from '../transit/types';
import { ModeIcon } from './ModeIcon';

interface Props {
  slot: Slot | null;
  slotIndex: number;
  slotCount: number;
  trips: Trip[];
  perStop: number;
  nowMs: number;
  connected: boolean;
  onAddStop: () => void;
}

export function Board({ slot, slotIndex, slotCount, trips, perStop, nowMs, connected, onAddStop }: Props) {
  if (!slot) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-6 bg-bg px-16 text-center text-off-white">
        <div className="font-display text-screen-title font-medium tracking-display">No stops yet</div>
        <p className="m-0 max-w-[36ch] text-title text-soft">Add a stop from the companion app, or pick one near you.</p>
        <button className="border border-accent bg-accent px-8 py-4 font-mono text-row-lg text-screen" onClick={onAddStop}>
          Find stops near me
        </button>
      </div>
    );
  }
  const rows = trips.slice(0, perStop);
  const live = rows.some(t => t.isRealtime);
  return (
    <div className="flex h-full w-full flex-col bg-bg text-off-white">
      <header className="flex items-end justify-between gap-6 px-8 pt-6 pb-3">
        <div className="min-w-0">
          <div className="font-mono text-eyebrow tracking-[0.25em] text-dim uppercase">
            Stop {slotIndex + 1} of {slotCount}
            {slotIndex < 4 ? ` · preset ${slotIndex + 1}` : ''}
          </div>
          <h1 className="m-0 truncate font-display text-screen-title font-medium leading-tight tracking-display">{slot.stopName}</h1>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <div className="font-mono text-title tabular-nums text-near">{clockTime(Math.floor(nowMs / 1000))}</div>
          <div className="flex items-center gap-2 font-mono text-eyebrow tracking-[0.2em] uppercase">
            <span className={`inline-block h-2 w-2 rounded-full ${!connected ? 'bg-warn' : live ? 'bg-ok' : 'bg-dim'}`} aria-hidden="true" />
            <span className={!connected ? 'text-warn' : 'text-dim'}>{!connected ? 'Offline' : live ? 'Live' : 'Scheduled'}</span>
          </div>
        </div>
      </header>
      <ol className="m-0 flex flex-1 list-none flex-col justify-center gap-2 px-8 py-2">
        {rows.length === 0 ? (
          <li className="py-10 text-center text-title text-soft">Nothing scheduled in the next hour.</li>
        ) : (
          rows.map(trip => {
            const mode = modeFor(trip.routeName, trip.headsign);
            const bg = trip.routeColor ? `#${trip.routeColor}` : '#2a2f36';
            return (
              <li key={trip.tripId} className="grid grid-cols-[auto_1fr_auto] items-center gap-5 border-b border-rule py-3 last:border-b-0">
                <div className="flex min-w-[7.5rem] items-center gap-2 rounded-none px-3 py-2 font-display text-title font-semibold" style={{ background: bg, color: textOn(trip.routeColor) }}>
                  <ModeIcon mode={mode} className="shrink-0" />
                  <span className="truncate">{trip.routeName}</span>
                </div>
                <div className="min-w-0 truncate text-row-lg text-near">{trip.headsign}</div>
                <div className="flex items-baseline gap-3">
                  <span className="font-display text-[3.25rem] leading-none font-medium tabular-nums tracking-display">
                    {countdown(trip.arrivalTime, nowMs)}
                  </span>
                  <span className="w-[3.5rem] font-mono text-hint text-dim">{countdown(trip.arrivalTime, nowMs) === 'now' ? '' : 'min'}</span>
                  <span className="flex w-[5.5rem] items-center justify-end gap-2 font-mono text-body tabular-nums text-soft">
                    {clockTime(trip.arrivalTime)}
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${trip.isRealtime ? 'bg-ok' : 'bg-transparent'}`}
                      role="img"
                      aria-label={trip.isRealtime ? 'Live estimate' : 'Scheduled time'}
                    />
                  </span>
                </div>
              </li>
            );
          })
        )}
      </ol>
      <footer className="flex items-center justify-between px-8 pb-4 font-mono text-hint text-dim">
        <span>Turn the dial for the next stop</span>
        <button className="border border-edge px-4 py-2 text-near" onClick={onAddStop}>
          Add a stop
        </button>
      </footer>
    </div>
  );
}
