import { describe, expect, test } from 'bun:test';
import type { Action } from '../state';
import { requestStops } from './loadStops';
import type { Stop } from './types';

const stop: Stop = { stopId: 's9', stopCode: '9', name: 'Stop 9', lat: 0, lon: 0 };

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
