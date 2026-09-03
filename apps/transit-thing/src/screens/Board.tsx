import { useScreenFocus } from '../hooks/useScreenFocus';
import { clockTime, minutesUntil, rowTitle } from '../transit/format';
import { lateness, showLateness } from '../transit/delay';
import { boardStatus, waitingText, type Connection, type Link } from '../transit/status';
import type { Slot, Trip } from '../transit/types';
import { Countdown } from './Countdown';
import { Lateness } from './Lateness';
import { RouteBadge } from './RouteBadge';

interface Props {
  slot: Slot | null;
  slotIndex: number;
  slotCount: number;
  trips: Trip[];
  hasFeed: boolean;
  perStop: number;
  nowMs: number;
  connection: Connection;
  updatedMs: number | null;
  link: Link | null;
  firstSeen: Map<string, number>;
  onAddStop: () => void;
}

const TONE = { soft: 'text-soft', notice: 'text-experimental', warn: 'text-warn' };

export function Board({ slot, slotIndex, slotCount, trips, hasFeed, perStop, nowMs, connection, updatedMs, link, firstSeen, onAddStop }: Props) {
  const root = useScreenFocus();
  if (!slot) {
    return (
      <main ref={root} tabIndex={-1} className="flex h-full w-full flex-col items-center justify-center gap-6 bg-bg px-16 text-center text-off-white outline-none">
        <h1 className="m-0 font-display text-screen-title font-medium tracking-display">No stops yet</h1>
        <p className="m-0 max-w-[36ch] text-title text-soft">Add a stop from the companion app, or pick one on the device.</p>
        <button className="border border-accent bg-accent px-8 py-4 font-mono text-row-lg text-screen" onClick={onAddStop}>
          Add a stop
        </button>
      </main>
    );
  }
  const feed = link?.status ?? null;
  const status = boardStatus(connection, updatedMs, link, nowMs);
  // a feed that is reconnecting is as stale as one with no daemon, so every live signal follows one flag
  const fresh = connection === 'open' && feed !== 'reconnecting';
  const anyLive = fresh && trips.some(t => t.isRealtime);
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
          <div className={`h-[1.125rem] min-w-[13rem] text-right font-mono text-hint leading-[1.125rem] ${TONE[status?.tone ?? 'soft']}`} aria-live="polite" aria-atomic="true">
            {status?.text}
          </div>
        </div>
      </header>
      <ol className="m-0 grid flex-1 list-none px-8 py-2" style={{ gridTemplateRows: `repeat(${perStop}, minmax(0, 1fr))` }}>
        {!hasFeed ? (
          <li className="row-span-full self-center text-center text-title text-soft">
            <span role="status">{waitingText(connection, feed)}</span>
          </li>
        ) : trips.length === 0 ? (
          <li className="row-span-full self-center text-center text-title text-soft">
            <span role="status">No arrivals scheduled.</span>
          </li>
        ) : (
          trips.map(trip => {
            const min = minutesUntil(trip.arrivalTime, nowMs);
            const late = showLateness(fresh, trip) ? lateness(trip, firstSeen) : null;
            return (
              <li key={trip.tripId} className="grid grid-cols-[auto_1fr_auto] items-center gap-5 border-b border-rule last:border-b-0">
                <RouteBadge name={trip.routeName} color={trip.routeColor} size="lg" />
                <div className="min-w-0 truncate text-row-lg text-near">{rowTitle(trip.routeName, trip.headsign)}</div>
                <div className="flex items-center gap-3">
                  <Countdown min={min} size="board" dim={!fresh} />
                  <Lateness value={late} />
                  <span className="flex w-[5.5rem] items-center justify-end gap-2 font-mono text-body tabular-nums text-soft">
                    {clockTime(trip.arrivalTime)}
                    {fresh ? (
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
          <span className="flex w-14 shrink-0 items-center gap-2">
            {anyLive ? (
              <>
                <span className="inline-block h-2 w-2 rounded-full bg-ok" aria-hidden="true" />
                live
              </>
            ) : null}
          </span>
          <span>Turn the dial for the next stop, press it to add one</span>
        </span>
        <button className="border border-soft px-4 py-2 text-near" onClick={onAddStop}>
          Add a stop
        </button>
      </footer>
    </main>
  );
}
