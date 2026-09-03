import { useEffect, useState } from 'react';
import { LOCATE_ROW, pickerMessage, RETRY_ROW, stopRow, visibleCursor, type FailReason, type LoadStatus, type LocateStatus, type PickerAlert } from '../state';
import { distanceLabel, rowTitle, type Units } from '../transit/format';
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

// the save button reads as a row: accent when the cursor sits on it, muted until a route is chosen
const SAVE_CLASS = {
  ready: { cursor: 'border-accent bg-accent text-screen', idle: 'border-soft text-near' },
  disabled: { cursor: 'border-accent bg-accent-soft text-soft', idle: 'border-soft text-soft' },
};

function rowClass(active: boolean): string {
  return `flex w-full items-center gap-4 border-b border-l-[3px] border-rule px-3 py-3 text-left outline-none ${
    active ? 'border-l-accent bg-accent-soft text-off-white' : 'border-l-transparent text-near'
  }`;
}

const ALERTS: Record<PickerAlert, string> = {
  refresh: "Couldn't refresh stops. Showing the stops found earlier.",
  locate: "Couldn't get this device's location.",
  routes: "Couldn't load routes for that stop. Try again.",
};
const RATE_LIMITED: Record<Exclude<PickerAlert, 'locate'> | 'load', string> = {
  refresh: 'Too many requests. Showing the stops found earlier.',
  routes: 'Too many requests. Try again in a minute.',
  load: 'Too many requests. Try loading stops again in a minute.',
};

export function alertText(alert: PickerAlert | null, reason: FailReason): string {
  if (!alert) return '';
  return alert !== 'locate' && reason === 'rateLimited' ? RATE_LIMITED[alert] : ALERTS[alert];
}

export function loadFailedText(reason: FailReason): string {
  return reason === 'rateLimited' ? RATE_LIMITED.load : "Couldn't load stops.";
}

interface StopsProps {
  stops: Stop[];
  cursor: number;
  load: LoadStatus;
  locate: LocateStatus;
  alert: PickerAlert | null;
  reason: FailReason;
  origin: Origin | null;
  units: Units;
  // the server that receives the location request, named so the disclosure says who gets it
  host: string;
  onLocate: () => void;
  onRetry: () => void;
  onPick: (stop: Stop, row: number) => void;
}

export function StopPicker({ stops, cursor: stored, load, locate, alert, reason, origin, units, host, onLocate, onRetry, onPick }: StopsProps) {
  const cursor = visibleCursor({ cursor: stored, load, stops });
  const rowProps = useCursorFocus(cursor);
  const message = pickerMessage(load, stops.length, origin !== null);
  // the stop count is for screen readers only; sighted users see the list itself
  const visible = stops.length === 0 ? message : null;
  // a live region only announces text that arrives after it mounts, so it starts empty
  const [announced, setAnnounced] = useState<string | null>(null);
  useEffect(() => setAnnounced(message), [message]);
  return (
    <main className="flex h-full w-full flex-col bg-bg text-off-white">
      <header className="px-8 pt-6 pb-2">
        <div className="font-mono text-hint tracking-[0.25em] text-soft uppercase">{origin ? 'Stops near you' : 'Stops'}</div>
        <h1 className="m-0 font-display text-screen-title font-medium tracking-display">Pick a stop</h1>
        <p className="m-0 mt-1 max-w-[72ch] text-hint text-soft">
          Uses this device's location once to find nearby stops. Sends an area around you to {host}, the transit server in settings. Transit&nbsp;Thing does not
          store your location.
        </p>
      </header>
      <ol className="m-0 flex min-h-0 flex-1 list-none flex-col overflow-y-auto px-8">
        <li>
          <button {...rowProps(LOCATE_ROW)} className={rowClass(cursor === LOCATE_ROW)} onClick={onLocate} aria-disabled={locate === 'locating'}>
            <span className="text-row-lg">{locate === 'locating' ? 'Finding your location' : 'Use my location'}</span>
          </button>
        </li>
        {visible ? (
          <li className="py-10 text-center text-row-lg text-soft" aria-hidden="true">
            {visible}
          </li>
        ) : null}
        {load === 'failed' ? (
          <li>
            <p className="m-0 py-2 pl-[15px] font-mono text-hint text-warn" role="alert">
              {loadFailedText(reason)}
            </p>
            <button {...rowProps(RETRY_ROW)} className={rowClass(cursor === RETRY_ROW)} onClick={onRetry}>
              <span className="text-row-lg">Try again</span>
            </button>
          </li>
        ) : (
          stops.map((stop, i) => (
            <li key={stop.stopId}>
              <button {...rowProps(stopRow(i))} className={`${rowClass(stopRow(i) === cursor)} justify-between`} onClick={() => onPick(stop, stopRow(i))}>
                <span className="truncate text-row-lg">{stop.name}</span>
                <span className="shrink-0 font-mono text-hint text-soft">
                  {origin ? distanceLabel(haversine(origin.lat, origin.lon, stop.lat, stop.lon), units) : `#${stop.stopCode}`}
                </span>
              </button>
            </li>
          ))
        )}
      </ol>
      <div role="status" className="sr-only">
        {announced}
      </div>
      <p className="m-0 h-[2.125rem] px-8 py-2 font-mono text-hint leading-[1.125rem] text-warn" role="alert">
        {alertText(alert, reason)}
      </p>
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
              className={`border px-4 py-2 font-mono text-row-lg outline-none ${SAVE_CLASS[canSave ? 'ready' : 'disabled'][cursor === saveRow ? 'cursor' : 'idle']}`}
              onClick={onSave}>
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
