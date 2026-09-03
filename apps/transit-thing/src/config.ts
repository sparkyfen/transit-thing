export interface Config {
  perStop: number;
  ambientIdle: boolean;
}

export const DEFAULT_CONFIG: Config = { perStop: 3, ambientIdle: true };

// apiBaseUrl, feed, and slots are declared in the manifest but read by the network client, which is the next change
export function applyConfig(prev: Config, key: string, value: string | null): Config {
  switch (key) {
    case 'perStop': {
      if (value === null) return { ...prev, perStop: DEFAULT_CONFIG.perStop };
      const n = Number(value);
      if (!Number.isInteger(n) || n < 1 || n > 4) return prev;
      return { ...prev, perStop: n };
    }
    case 'ambientIdle':
      if (value === null) return { ...prev, ambientIdle: DEFAULT_CONFIG.ambientIdle };
      if (value !== 'true' && value !== 'false') return prev;
      return { ...prev, ambientIdle: value === 'true' };
    default:
      return prev;
  }
}
