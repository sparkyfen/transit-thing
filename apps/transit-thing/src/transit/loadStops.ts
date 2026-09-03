import type { Action } from '../state';
import type { Origin } from './geo';
import type { Stop, TransitSource } from './types';

interface Request {
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

export async function requestRoutes({ dispatch, source, token, reqId, stop }: RoutesRequest): Promise<void> {
  dispatch({ type: 'routesRequested', token, reqId });
  try {
    const routes = await source.routesAt(stop.stopId);
    dispatch({ type: 'openRoutes', token, reqId, stop, routes });
  } catch {
    dispatch({ type: 'routesFailed', token, reqId });
  }
}

export async function requestStops({ dispatch, source, token, reqId, origin }: Request): Promise<void> {
  dispatch({ type: 'stopsRequested', token, reqId });
  try {
    const stops = await source.stopsNear(origin);
    dispatch({ type: 'stops', token, reqId, stops });
  } catch {
    dispatch({ type: 'stopsFailed', token, reqId });
  }
}
