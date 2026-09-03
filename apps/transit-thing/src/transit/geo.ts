export interface Origin {
  lat: number;
  lon: number;
}

export function haversine(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const r = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export interface GeoOnce {
  getOnce(req: { accuracy: 'coarse' }): Promise<{ ok: true; response: { position: { lat: number; lon: number } } } | { ok: false }>;
}

// one coarse fix, rounded to about 100 m before anything else sees it
export async function locate(geo: GeoOnce): Promise<Origin | null> {
  const r = await geo.getOnce({ accuracy: 'coarse' }).catch(() => null);
  if (!r?.ok) return null;
  return { lat: round3(r.response.position.lat), lon: round3(r.response.position.lon) };
}
