import { describe, expect, test } from 'bun:test';
import type { Action } from '../state';
import { requestRoutes, requestStops } from './requests';
import type { Route, Stop } from './types';

const stop: Stop = { stopId: 's9', stopCode: '9', name: 'Stop 9', lat: 0, lon: 0 };
const route: Route = { routeId: 'a', name: 'A', color: null, headsigns: [] };

describe('requestStops', () => {
  test('announces the request, then delivers the stops under the same reqId', async () => {
    const seen: Action[] = [];
    const source = { stopsNear: async () => [stop] };
    await requestStops({ dispatch: a => seen.push(a), source, token: 3, reqId: 7, origin: null });
    expect(seen).toEqual([
      { type: 'stopsRequested', token: 3, reqId: 7 },
      { type: 'stops', token: 3, reqId: 7, stops: [stop] },
    ]);
  });
  test('announces the request, then the failure under the same reqId', async () => {
    const seen: Action[] = [];
    const source = {
      stopsNear: async () => {
        throw new Error('down');
      },
    };
    await requestStops({ dispatch: a => seen.push(a), source, token: 3, reqId: 8, origin: null });
    expect(seen).toEqual([
      { type: 'stopsRequested', token: 3, reqId: 8 },
      { type: 'stopsFailed', token: 3, reqId: 8 },
    ]);
  });
  test('passes the origin through to the source', async () => {
    let got: unknown = 'unset';
    const source = {
      stopsNear: async (origin: unknown) => {
        got = origin;
        return [];
      },
    };
    await requestStops({ dispatch: () => {}, source, token: 1, reqId: 1, origin: { lat: 47.615, lon: -122.195 } });
    expect(got).toEqual({ lat: 47.615, lon: -122.195 });
  });
});

describe('requestRoutes', () => {
  test('announces the request, then opens the routes under the same reqId', async () => {
    const seen: Action[] = [];
    let asked = '';
    const source = {
      routesAt: async (stopId: string) => {
        asked = stopId;
        return [route];
      },
    };
    await requestRoutes({ dispatch: a => seen.push(a), source, token: 3, reqId: 7, stop });
    expect(asked).toBe('s9');
    expect(seen).toEqual([
      { type: 'routesRequested', token: 3, reqId: 7 },
      { type: 'openRoutes', token: 3, reqId: 7, stop, routes: [route] },
    ]);
  });
  test('announces the request, then the failure under the same reqId', async () => {
    const seen: Action[] = [];
    const source = {
      routesAt: async () => {
        throw new Error('down');
      },
    };
    await requestRoutes({ dispatch: a => seen.push(a), source, token: 3, reqId: 8, stop });
    expect(seen).toEqual([
      { type: 'routesRequested', token: 3, reqId: 8 },
      { type: 'routesFailed', token: 3, reqId: 8 },
    ]);
  });
});
