import { describe, expect, test } from 'bun:test';
import { countdown, countdownLabel } from './Countdown';

describe('countdown', () => {
  test('says now at zero minutes', () => {
    expect(countdown(0)).toBe('now');
  });
  test('shows whole minutes otherwise', () => {
    expect(countdown(1)).toBe('1');
    expect(countdown(74)).toBe('74');
  });
});

describe('countdownLabel', () => {
  test('reads due now at zero', () => {
    expect(countdownLabel(0)).toBe('Due now');
  });
  test('uses the singular for one minute', () => {
    expect(countdownLabel(1)).toBe('In 1 minute');
  });
  test('uses the plural otherwise', () => {
    expect(countdownLabel(5)).toBe('In 5 minutes');
  });
});
