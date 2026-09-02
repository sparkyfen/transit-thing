import type { Mode } from './types';

const RAIL = /^(1|2|T|S) line$|link|sounder|amtrak|metra|rail|subway/i;
const FERRY = /ferry|wsf|water taxi/i;
const TRAM = /streetcar|tram/i;

// the api sends no route type, so guess from what the feed calls the route
export function modeFor(routeName: string, headsign = ''): Mode {
  const text = `${routeName} ${headsign}`;
  if (FERRY.test(text)) return 'ferry';
  if (RAIL.test(routeName)) return 'rail';
  if (TRAM.test(text)) return 'tram';
  return 'bus';
}
