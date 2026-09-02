export function minutesUntil(arrivalTime: number, nowMs: number): number {
  return Math.max(0, Math.round((arrivalTime * 1000 - nowMs) / 60_000));
}

export function countdown(arrivalTime: number, nowMs: number): string {
  const min = minutesUntil(arrivalTime, nowMs);
  return min === 0 ? 'now' : String(min);
}

export function clockTime(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function textOn(hex: string | null): '#0a0c0e' | '#efefef' {
  if (!hex || !/^[0-9a-f]{6}$/i.test(hex)) return '#efefef';
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#0a0c0e' : '#efefef';
}
