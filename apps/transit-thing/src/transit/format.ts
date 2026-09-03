export function minutesUntil(arrivalTime: number, nowMs: number): number {
  return Math.max(0, Math.round((arrivalTime * 1000 - nowMs) / 60_000));
}

export function countdown(arrivalTime: number, nowMs: number): string {
  const min = minutesUntil(arrivalTime, nowMs);
  return min === 0 ? 'now' : String(min);
}

export function countdownLabel(min: string): string {
  if (min === 'now') return 'Due now';
  return min === '1' ? 'In 1 minute' : `In ${min} minutes`;
}

export function clockTime(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function distanceLabel(meters: number): string {
  const tens = Math.round(meters / 10) * 10;
  if (tens < 1000) return `${tens} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

const DARK = '#0a0c0e';
const LIGHT = '#efefef';
const NO_COLOR = '#2a2f36';
const MIN_RATIO = 4.5;

export function routeHex(color: string | null | undefined): string | null {
  return color && /^[0-9a-f]{6}$/i.test(color) ? `#${color.toLowerCase()}` : null;
}

function channels(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(rgb: [number, number, number]): string {
  return `#${rgb.map(c => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map(c => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function blend(hex: string, toward: string, amount: number): string {
  const from = channels(hex);
  const to = channels(toward);
  return toHex(from.map((c, i) => c + (to[i]! - c) * amount) as [number, number, number]);
}

// keeps the agency color when it can carry readable text, else pulls it toward black or white until it does
export function badgeColors(color: string | null | undefined): { bg: string; fg: string } {
  const base = routeHex(color) ?? NO_COLOR;
  const fg = contrastRatio(base, DARK) >= contrastRatio(base, LIGHT) ? DARK : LIGHT;
  const toward = fg === DARK ? LIGHT : DARK;
  let bg = base;
  for (let amount = 0.05; contrastRatio(bg, fg) < MIN_RATIO && amount <= 1; amount += 0.05) {
    bg = blend(base, toward, amount);
  }
  return { bg, fg };
}

const BADGE_MAX = 6;

// a name longer than the badge can hold moves into the headsign column
export function badgeLabel(name: string): string | null {
  return name.length > 0 && name.length <= BADGE_MAX ? name : null;
}

export function rowTitle(name: string, headsign: string): string {
  return name && !badgeLabel(name) ? `${name} · ${headsign}` : headsign;
}

// the ambient phrase reads "to <headsign>" only when the badge already names the route
export function ambientTitle(name: string, headsign: string): string {
  return badgeLabel(name) ? `to ${headsign}` : rowTitle(name, headsign);
}
