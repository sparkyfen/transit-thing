import type { Route, Slot, Stop, TransitSource, Trip } from './types';

// recorded from tt.horner.tj on 2026-09-02, times anchored at subscribe time
export const FIXTURE_SLOTS: Slot[] = [
  { stopId: 'st:1_67652', stopName: 'Bellevue Transit Center - Bay 9', routeIds: ['st:1_100133', 'st:40_100239'] },
  { stopId: 'st:40_99903', stopName: 'Bellevue Downtown Station', routeIds: ['st:40_2LINE'] },
  { stopId: 'st:1_75403', stopName: 'Overlake Village Station', routeIds: ['st:1_100252', 'st:1_100511'] },
  { stopId: 'st:95_2', stopName: 'Seattle Ferry Terminal', routeIds: ['st:95_1'] },
  { stopId: 'st:1_29270', stopName: 'Fremont Ave N & N 34th St', routeIds: ['st:1_100223'] },
];

const NEARBY: Stop[] = [
  { stopId: 'st:1_67652', stopCode: '67652', name: 'Bellevue Transit Center - Bay 9', lat: 47.615509, lon: -122.194725 },
  { stopId: 'st:1_67655', stopCode: '67655', name: 'Bellevue Transit Center - Bay 8', lat: 47.615501, lon: -122.194389 },
  { stopId: 'st:1_67653', stopCode: '67653', name: 'Bellevue Transit Center - Bay 10', lat: 47.615398, lon: -122.194935 },
  { stopId: 'st:40_99903', stopCode: '99903', name: 'Bellevue Downtown Station', lat: 47.615, lon: -122.192 },
  { stopId: 'st:1_68870', stopCode: '68870', name: '108th Ave NE & NE 6th St', lat: 47.6156, lon: -122.1965 },
  { stopId: 'st:1_68880', stopCode: '68880', name: 'NE 8th St & 110th Ave NE', lat: 47.6172, lon: -122.1927 },
];

const ROUTES = new Map<string, Route[]>([
  [
    'st:1_67652',
    [
      { routeId: 'st:1_100133', name: '240', color: 'FDB71A', headsigns: ['Renton Newcastle'] },
      { routeId: 'st:40_100239', name: '550', color: '2B376E', headsigns: ['Seattle'] },
    ],
  ],
  [
    'st:1_67655',
    [
      { routeId: 'st:1_100169', name: '271', color: '00A5D2', headsigns: ['Issaquah', 'University District'] },
      { routeId: 'st:1_100002', name: 'B Line', color: 'D52B1E', headsigns: ['Redmond Transit Center'] },
    ],
  ],
  ['st:40_99903', [{ routeId: 'st:40_2LINE', name: '2 Line', color: '0077C0', headsigns: ['Redmond Technology', 'Lynnwood City Center'] }]],
]);

interface Seed {
  routeName: string;
  routeColor: string | null;
  headsign: string;
  offsetsMin: number[];
  realtime: boolean[];
}

const SEEDS = new Map<string, Seed[]>([
  [
    'st:1_67652',
    [
      { routeName: '240', routeColor: 'FDB71A', headsign: 'Renton Newcastle', offsetsMin: [3, 18, 33], realtime: [true, false, false] },
      { routeName: '550', routeColor: '2B376E', headsign: 'Seattle', offsetsMin: [7, 22], realtime: [true, true] },
    ],
  ],
  [
    'st:40_99903',
    [
      { routeName: '2 Line', routeColor: '0077C0', headsign: 'Redmond Technology', offsetsMin: [2, 12, 22], realtime: [true, true, false] },
      { routeName: '2 Line', routeColor: '0077C0', headsign: 'Lynnwood City Center', offsetsMin: [5, 15], realtime: [true, false] },
    ],
  ],
  [
    'st:1_75403',
    [
      { routeName: '245', routeColor: '00A5D2', headsign: 'Kirkland', offsetsMin: [0, 14], realtime: [true, true] },
      { routeName: '566', routeColor: '2B376E', headsign: 'Auburn Station', offsetsMin: [9], realtime: [false] },
    ],
  ],
  [
    'st:95_2',
    [
      { routeName: 'Bainbridge Ferry', routeColor: '006B54', headsign: 'Bainbridge Island', offsetsMin: [24, 74], realtime: [true, false] },
      { routeName: 'Bremerton Ferry', routeColor: '006B54', headsign: 'Bremerton', offsetsMin: [41], realtime: [true] },
    ],
  ],
  ['st:1_29270', []],
]);

function tripsFor(slot: Slot, nowMs: number): Trip[] {
  const seeds = SEEDS.get(slot.stopId) ?? [];
  const base = Math.floor(nowMs / 1000);
  return seeds.flatMap((seed, s) =>
    seed.offsetsMin.map((offset, i) => ({
      tripId: `${slot.stopId}:${s}:${i}`,
      stopId: slot.stopId,
      routeId: slot.routeIds[s] ?? slot.routeIds[0] ?? '',
      routeName: seed.routeName,
      routeColor: seed.routeColor,
      stopName: slot.stopName,
      headsign: seed.headsign,
      arrivalTime: base + offset * 60,
      departureTime: base + offset * 60,
      isRealtime: seed.realtime[i] ?? false,
    })),
  );
}

export const fixtureSource: TransitSource = {
  subscribe(slot, onTrips) {
    onTrips(tripsFor(slot, Date.now()));
    return () => {};
  },
  async stopsNear() {
    return NEARBY;
  },
  async routesAt(stopId) {
    return ROUTES.get(stopId) ?? [];
  },
};
