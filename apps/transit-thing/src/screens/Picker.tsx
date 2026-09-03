import { useEffect, useState } from 'react';
import { pickerMessage, type PickerStatus } from '../state';
import { distanceLabel, rowTitle } from '../transit/format';
import { haversine, type Origin } from '../transit/geo';
import type { Route, Stop } from '../transit/types';
import { RouteBadge } from './RouteBadge';

// dom focus follows the dial cursor: the cursor row takes focus as soon as it attaches
function focusOnAttach(el: HTMLElement | null) {
  if (!el) return;
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: 'nearest' });
}

function useCursorFocus(cursor: number) {
  return (i: number) =>
    i === cursor
      ? { ref: focusOnAttach, tabIndex: 0, 'aria-current': 'true' as const }
      : { ref: null, tabIndex: -1, 'aria-current': undefined };
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
  const rowProps = useCursorFocus(cursor);
  const message = pickerMessage(status, stops.length);
  // a live region only announces text that arrives after it mounts, so it starts empty
  const [announced, setAnnounced] = useState<string | null>(null);
  useEffect(() => setAnnounced(message), [message]);
  return (
    <main className="flex h-full w-full flex-col bg-bg text-off-white">
      <header className="px-8 pt-6 pb-2">
        <div className="font-mono text-hint tracking-[0.25em] text-soft uppercase">{origin ? 'Stops near you' : 'Stops'}</div>
        <h1 className="m-0 font-display text-screen-title font-medium tracking-display">Pick a stop</h1>
        <p className="m-0 mt-1 text-hint text-soft">
          Uses this device's location once to find nearby stops. The rounded position goes to the transit server you set. This app does not save it.
        </p>
      </header>
      <ol className="m-0 flex min-h-0 flex-1 list-none flex-col overflow-y-auto px-8">
        <li>
          <button {...rowProps(0)} className={rowClass(cursor === 0)} onClick={onLocate} aria-disabled={status === 'locating'}>
            <span className="text-row-lg">{status === 'locating' ? 'Finding your location' : 'Use my location'}</span>
          </button>
        </li>
        {message ? (
          <li className="py-10 text-center text-row-lg text-soft" aria-hidden="true">
            {message}
          </li>
        ) : null}
        {status === 'stopsFailed' ? (
          <li>
            <p className="m-0 px-3 py-2 font-mono text-hint text-warn" role="alert">
              Couldn't load stops.
            </p>
            <button {...rowProps(1)} className={rowClass(cursor === 1)} onClick={onRetry}>
              <span className="text-row-lg">Try again</span>
            </button>
          </li>
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
      <div role="status" className="sr-only">
        {announced}
      </div>
      {status === 'routesFailed' || status === 'locateFailed' ? (
        <p className="m-0 px-8 py-2 font-mono text-hint text-warn" role="alert">
          {status === 'locateFailed' ? "Couldn't get this device's location." : "Couldn't load routes for that stop. Try again."}
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
  const rowProps = useCursorFocus(cursor);
  const saveLabel = chosen.length === 1 ? 'Save this route' : chosen.length > 1 ? `Save ${chosen.length} routes` : 'Save';
  const canSave = chosen.length > 0;
  return (
    <main className="flex h-full w-full flex-col bg-bg text-off-white">
      <header className="px-8 pt-6 pb-2">
        <div className="font-mono text-hint tracking-[0.25em] text-soft uppercase">{stop.name}</div>
        <h1 id="routes-title" className="m-0 font-display text-screen-title font-medium tracking-display">
          Pick routes
        </h1>
      </header>
      {routes.length === 0 ? (
        <div ref={focusOnAttach} tabIndex={-1} className="flex flex-1 flex-col items-center justify-center px-8 text-center outline-none">
          <p className="m-0 text-row-lg text-soft">No routes serve this stop.</p>
        </div>
      ) : (
        <>
          <div role="group" aria-labelledby="routes-title" className="min-h-0 flex-1 overflow-y-auto px-8">
            <ol className="m-0 list-none">
              {routes.map((route, i) => {
                const on = chosen.includes(route.routeId);
                const headsigns = route.headsigns.join(' · ');
                return (
                  <li key={route.routeId}>
                    <button {...rowProps(i)} role="checkbox" aria-checked={on} className={rowClass(i === cursor)} onClick={() => onToggle(route.routeId)}>
                      <span
                        className={`grid h-6 w-6 shrink-0 place-items-center ${on ? 'border border-accent bg-accent text-screen' : 'border-2 border-soft'}`}
                        aria-hidden="true">
                        {on ? '✓' : ''}
                      </span>
                      <RouteBadge name={route.name} color={route.color} size="sm" />
                      <span className="truncate text-row text-soft">{rowTitle(route.name, headsigns)}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
          <div className="flex items-center justify-between gap-6 border-t border-rule px-8 py-3">
            <span id="save-hint" className="font-mono text-hint text-soft">
              {canSave ? `${chosen.length} of ${routes.length} chosen` : 'Choose at least one route'}
            </span>
            <button
              {...rowProps(saveRow)}
              aria-disabled={!canSave}
              aria-describedby="save-hint"
              className={`border px-4 py-2 font-mono text-row-lg outline-none ${
                cursor !== saveRow ? 'border-edge text-near' : canSave ? 'border-accent bg-accent text-screen' : 'border-accent text-soft'
              }`}
              onClick={() => canSave && onSave()}>
              {saveLabel}
            </button>
          </div>
        </>
      )}
      <footer className="flex justify-between gap-6 px-8 pb-4 font-mono text-hint text-soft">
        <span>{routes.length === 0 ? '' : 'Turn the dial to move, press it to choose'}</span>
        <span>Back returns to stops</span>
      </footer>
    </main>
  );
}
