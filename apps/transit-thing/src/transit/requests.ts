import type { Action, FailReason } from '../state';
import type { Origin } from './geo';
import { ApiError } from './live';
import type { Stop, TransitSource } from './types';

interface StopsRequest {
  dispatch: (action: Action) => void;
  source: Pick<TransitSource, 'stopsNear'>;
  token: number;
  reqId: number;
  origin: Origin | null;
}

interface RoutesRequest {
  dispatch: (action: Action) => void;
  source: Pick<TransitSource, 'routesAt'>;
  token: number;
  reqId: number;
  stop: Stop;
}

function reasonFor(e: unknown): FailReason {
  return e instanceof ApiError && e.status === 429 ? 'rateLimited' : 'failed';
}

export async function requestRoutes({ dispatch, source, token, reqId, stop }: RoutesRequest): Promise<void> {
  dispatch({ type: 'routesRequested', token, reqId });
  try {
    const routes = await source.routesAt(stop.stopId);
    dispatch({ type: 'openRoutes', token, reqId, stop, routes });
  } catch (e) {
    dispatch({ type: 'routesFailed', token, reqId, reason: reasonFor(e) });
  }
}

export async function requestStops({ dispatch, source, token, reqId, origin }: StopsRequest): Promise<void> {
  dispatch({ type: 'stopsRequested', token, reqId });
  try {
    const stops = await source.stopsNear(origin);
    dispatch({ type: 'stops', token, reqId, stops });
  } catch (e) {
    dispatch({ type: 'stopsFailed', token, reqId, reason: reasonFor(e) });
  }
}
