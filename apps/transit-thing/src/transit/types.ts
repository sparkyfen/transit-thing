import type { Origin } from './geo';

export type Mode = 'bus' | 'rail' | 'ferry' | 'tram';

export interface Trip {
  tripId: string;
  stopId: string;
  routeId: string;
  routeName: string;
  routeColor: string | null;
  stopName: string;
  headsign: string;
  arrivalTime: number;
  // mirrors the API payload; nothing reads it yet
  departureTime: number;
  isRealtime: boolean;
  // seconds late (positive) or early; only servers running the delaySeconds fork send it
  delaySeconds?: number;
}

export interface Stop {
  stopId: string;
  stopCode: string;
  name: string;
  lat: number;
  lon: number;
}

export interface Route {
  routeId: string;
  name: string;
  color: string | null;
  headsigns: string[];
}

export interface Slot {
  stopId: string;
  stopName: string;
  routeIds: string[];
}

export interface TransitSource {
  subscribe(slot: Slot, onTrips: (trips: Trip[]) => void): () => void;
  stopsNear(origin: Origin | null): Promise<Stop[]>;
  routesAt(stopId: string): Promise<Route[]>;
}
