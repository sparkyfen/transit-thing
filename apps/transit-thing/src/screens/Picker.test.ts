import { describe, expect, test } from 'bun:test';
import { alertText, loadFailedText } from './Picker';

describe('alertText', () => {
  test('a rate limit asks for a pause on a stops or routes failure', () => {
    expect(alertText('refresh', 'rateLimited')).toBe('Too many requests. Showing the stops found earlier.');
    expect(alertText('routes', 'rateLimited')).toBe('Too many requests. Try again in a minute.');
  });
  test('other failures keep their own copy', () => {
    expect(alertText('refresh', 'failed')).toBe("Couldn't refresh stops. Showing the stops found earlier.");
    expect(alertText('routes', 'failed')).toBe("Couldn't load routes for that stop. Try again.");
    expect(alertText('locate', 'rateLimited')).toBe("Couldn't get this device's location.");
  });
  test('no alert is empty', () => {
    expect(alertText(null, 'rateLimited')).toBe('');
  });
});

describe('loadFailedText', () => {
  test('names the reason the first load failed', () => {
    expect(loadFailedText('rateLimited')).toBe('Too many requests. Try loading stops again in a minute.');
    expect(loadFailedText('failed')).toBe("Couldn't load stops.");
  });
});
