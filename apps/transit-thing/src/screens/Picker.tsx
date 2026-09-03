import { useEffect, useRef } from 'react';
import type { PickerStatus } from '../state';
import { haversine, type Origin } from '../transit/geo';
import type { Route, Stop } from '../transit/types';
import { RouteBadge } from './RouteBadge';

function distanceLabel(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

// dom focus follows the dial cursor so the focused row is the highlighted one
function useCursorFocus(cursor: number, rows: number) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: 'nearest' });
  }, [cursor, rows]);
  return ref;
}

function rowClass(active: boolean): string {
  return `flex w-full items-center gap-4 border-b border-l-[3px] border-rule px-3 py-3 text-left outline-none ${
    active ? 'border-l-accent bg-accent-soft text-off-white' : 'border-l-transparent text-near'
  }`;
}

interface StopsProps {
  stops: Stop[];
  cursor: number;
  status: PickerStatus;
  origin: Origin | null;
  onLocate: () => void;
  onRetry: () => void;
  onPick: (stop: Stop) => void;
}

export function StopPicker({ stops, cursor, status, origin, onLocate, onRetry, onPick }: StopsProps) {
  const ref = useCursorFocus(cursor, stops.length + (status === 'stopsFailed' ? 1 : 0));
  const rowProps = (i: number) => ({ ref: i === cursor ? ref : null, tabIndex: i === cursor ? 0 : -1, 'aria-current': i === cursor ? ('true' as const) : undefined });
  return (
    <main className="flex h-full w-full flex-col bg-bg text-off-white">
      <header className="px-8 pt-6 pb-2">
        <div className="font-mono text-hint tracking-[0.25em] text-soft uppercase">Stops near you</div>
        <h1 className="m-0 font-display text-screen-title font-medium tracking-display">Pick a stop</h1>
        <p className="m-0 mt-1 text-hint text-soft">Uses this device's location to sort stops by distance. It stays on the device.</p>
      </header>
      <ol className="m-0 flex min-h-0 flex-1 list-none flex-col overflow-y-auto px-8">
        <li>
          <button {...rowProps(0)} className={rowClass(cursor === 0)} onClick={onLocate}>
            <span className="text-row-lg">Use my location</span>
          </button>
        </li>
        {status === 'loading' ? (
          <li className="py-10 text-center text-row-lg text-soft">Loading stops</li>
        ) : status === 'stopsFailed' ? (
          <li>
            <button {...rowProps(1)} className={rowClass(cursor === 1)} onClick={onRetry}>
              <span className="text-row-lg">Couldn't load stops. Try again.</span>
            </button>
          </li>
        ) : stops.length === 0 ? (
          <li className="py-10 text-center text-row-lg text-soft">No stops found near you.</li>
        ) : (
          stops.map((stop, i) => (
            <li key={stop.stopId}>
              <button {...rowProps(i + 1)} className={`${rowClass(i + 1 === cursor)} justify-between`} onClick={() => onPick(stop)}>
                <span className="truncate text-row-lg">{stop.name}</span>
                <span className="shrink-0 font-mono text-hint text-soft">
                  {origin ? distanceLabel(haversine(origin.lat, origin.lon, stop.lat, stop.lon)) : `#${stop.stopCode}`}
                </span>
              </button>
            </li>
          ))
        )}
      </ol>
      {status === 'routesFailed' ? (
        <p className="m-0 px-8 py-2 font-mono text-hint text-warn" role="alert">
          Couldn't load routes for that stop. Try again.
        </p>
      ) : null}
      <footer className="flex justify-between gap-6 border-t border-rule px-8 pt-3 pb-4 font-mono text-hint text-soft">
        <span>Turn the dial to move, press it to choose</span>
        <span>Back returns to the board</span>
      </footer>
    </main>
  );
}

interface RoutesProps {
  stop: Stop;
  routes: Route[];
  cursor: number;
  chosen: string[];
  onToggle: (routeId: string) => void;
  onSave: () => void;
}

export function RoutePicker({ stop, routes, cursor, chosen, onToggle, onSave }: RoutesProps) {
  const saveRow = routes.length;
  const ref = useCursorFocus(cursor, routes.length);
  const rowProps = (i: number) => ({ ref: i === cursor ? ref : null, tabIndex: i === cursor ? 0 : -1, 'aria-current': i === cursor ? ('true' as const) : undefined });
  const saveLabel = chosen.length === 1 ? 'Save this route' : chosen.length > 1 ? `Save ${chosen.length} routes` : 'Save';
  return (
    <main className="flex h-full w-full flex-col bg-bg text-off-white">
      <header className="px-8 pt-6 pb-2">
        <div className="font-mono text-hint tracking-[0.25em] text-soft uppercase">{stop.name}</div>
        <h1 id="routes-title" className="m-0 font-display text-screen-title font-medium tracking-display">
          Pick routes
        </h1>
      </header>
      <div role="group" aria-labelledby="routes-title" className="min-h-0 flex-1 overflow-y-auto px-8">
        <ol className="m-0 list-none">
          {routes.map((route, i) => {
            const on = chosen.includes(route.routeId);
            return (
              <li key={route.routeId}>
                <button {...rowProps(i)} role="checkbox" aria-checked={on} className={rowClass(i === cursor)} onClick={() => onToggle(route.routeId)}>
                  <span className={`grid h-6 w-6 shrink-0 place-items-center border ${on ? 'border-accent bg-accent text-screen' : 'border-edge'}`} aria-hidden="true">
                    {on ? '✓' : ''}
                  </span>
                  <RouteBadge name={route.name} color={route.color} headsign={route.headsigns.join(' ')} size="sm" />
                  <span className="truncate text-row text-soft">{route.headsigns.join(' · ')}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
      <div className="flex items-center justify-between gap-6 border-t border-rule px-8 py-3">
        <span id="save-hint" className="font-mono text-hint text-soft">
          {chosen.length === 0 ? 'Choose at least one route' : `${chosen.length} of ${routes.length} chosen`}
        </span>
        <button
          {...rowProps(saveRow)}
          aria-disabled={chosen.length === 0}
          aria-describedby="save-hint"
          className={`border px-4 py-2 font-mono text-row-lg outline-none aria-disabled:opacity-40 ${
            cursor === saveRow ? 'border-accent bg-accent text-screen' : 'border-edge text-near'
          }`}
          onClick={() => chosen.length > 0 && onSave()}>
          {saveLabel}
        </button>
      </div>
      <footer className="flex justify-between gap-6 px-8 pb-4 font-mono text-hint text-soft">
        <span>Turn the dial to move, press it to tick a route</span>
        <span>Back returns to stops</span>
      </footer>
    </main>
  );
}
