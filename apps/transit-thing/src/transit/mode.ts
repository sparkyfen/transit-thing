import type { Mode } from './types';

const RAIL = /^(1|2|T|S) line$|link|sounder|amtrak|metra|rail|subway/i;
const FERRY = /ferry|wsf|water taxi/i;
const TRAM = /streetcar|tram/i;

// the api sends no route type, so guess from what the feed calls the route; a bus to a ferry dock is still a bus
export function modeFor(routeName: string): Mode {
  if (FERRY.test(routeName)) return 'ferry';
  if (RAIL.test(routeName)) return 'rail';
  if (TRAM.test(routeName)) return 'tram';
  return 'bus';
}
