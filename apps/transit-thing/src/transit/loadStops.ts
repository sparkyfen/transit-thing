import type { Action } from '../state';
import type { Origin } from './geo';
import type { TransitSource } from './types';

interface Request {
  dispatch: (action: Action) => void;
  source: Pick<TransitSource, 'stopsNear'>;
  token: number;
  reqId: number;
  origin: Origin | null;
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
