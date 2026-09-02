import type { Route, Stop } from '../transit/types';

function distanceLabel(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function haversine(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const r = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

interface StopsProps {
  stops: Stop[];
  cursor: number;
  origin: { lat: number; lon: number } | null;
  onPick: (stop: Stop) => void;
}

export function StopPicker({ stops, cursor, origin, onPick }: StopsProps) {
  return (
    <div className="flex h-full w-full flex-col bg-bg text-off-white">
      <header className="px-8 pt-6 pb-2">
        <div className="font-mono text-eyebrow tracking-[0.25em] text-dim uppercase">Stops near you</div>
        <h1 className="m-0 font-display text-screen-title font-medium tracking-display">Pick a stop</h1>
      </header>
      <ol className="m-0 flex flex-1 list-none flex-col overflow-hidden px-8">
        {stops.length === 0 ? (
          <li className="py-10 text-center text-title text-soft">No stops within walking distance.</li>
        ) : (
          stops.map((stop, i) => (
            <li key={stop.stopId}>
              <button
                aria-current={i === cursor ? 'true' : undefined}
                className={`flex w-full items-center justify-between gap-6 border-b border-rule px-3 py-3 text-left ${i === cursor ? 'bg-accent-soft text-off-white' : 'text-near'}`}
                onClick={() => onPick(stop)}>
                <span className="truncate text-row-lg">{stop.name}</span>
                <span className="shrink-0 font-mono text-hint text-dim">
                  {origin ? distanceLabel(haversine(origin.lat, origin.lon, stop.lat, stop.lon)) : `#${stop.stopCode}`}
                </span>
              </button>
            </li>
          ))
        )}
      </ol>
      <footer className="px-8 pb-4 font-mono text-hint text-dim">Turn the dial to move, press it to choose. Back cancels.</footer>
    </div>
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
  return (
    <div className="flex h-full w-full flex-col bg-bg text-off-white">
      <header className="px-8 pt-6 pb-2">
        <div className="font-mono text-eyebrow tracking-[0.25em] text-dim uppercase">{stop.name}</div>
        <h1 className="m-0 font-display text-screen-title font-medium tracking-display">Which routes?</h1>
      </header>
      <ol className="m-0 flex flex-1 list-none flex-col overflow-hidden px-8">
        {routes.map((route, i) => {
          const on = chosen.includes(route.routeId);
          return (
            <li key={route.routeId}>
              <button
                role="checkbox"
                aria-checked={on}
                aria-current={i === cursor ? 'true' : undefined}
                className={`flex w-full items-center gap-4 border-b border-rule px-3 py-3 text-left ${i === cursor ? 'bg-accent-soft' : ''}`}
                onClick={() => onToggle(route.routeId)}>
                <span className={`grid h-6 w-6 shrink-0 place-items-center border ${on ? 'border-accent bg-accent text-screen' : 'border-edge'}`} aria-hidden="true">
                  {on ? '✓' : ''}
                </span>
                <span className="min-w-[4.5rem] font-display text-title font-semibold" style={{ color: route.color ? `#${route.color}` : undefined }}>
                  {route.name}
                </span>
                <span className="truncate text-row text-soft">{route.headsigns.join(' · ')}</span>
              </button>
            </li>
          );
        })}
        <li>
          <button
            aria-current={cursor === saveRow ? 'true' : undefined}
            disabled={chosen.length === 0}
            className={`mt-3 w-full border px-3 py-3 font-mono text-row-lg ${cursor === saveRow ? 'border-accent bg-accent text-screen' : 'border-edge text-near'} disabled:opacity-40`}
            onClick={onSave}>
            {chosen.length === 0 ? 'Choose at least one route' : `Save ${chosen.length === 1 ? 'this route' : `${chosen.length} routes`}`}
          </button>
        </li>
      </ol>
    </div>
  );
}
