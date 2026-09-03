import { describe, expect, test } from 'bun:test';
import { latenessText } from './Lateness';

describe('latenessText', () => {
  test('late reads as a plus with a warning, early as a minus with good news', () => {
    expect(latenessText({ kind: 'late', minutes: 3 })).toEqual({ label: 'Running 3 minutes late', glyph: '+3 min', late: true });
    expect(latenessText({ kind: 'early', minutes: 2 })).toEqual({ label: 'Running 2 minutes early', glyph: '-2 min', late: false });
  });
  test('one minute is singular', () => {
    expect(latenessText({ kind: 'early', minutes: 1 })?.label).toBe('Running 1 minute early');
  });
  test('minutes clamp at 999', () => {
    expect(latenessText({ kind: 'late', minutes: 5000 })).toEqual({ label: 'Running 999 minutes late', glyph: '+999 min', late: true });
  });
  test('nothing to say without a value', () => {
    expect(latenessText(null)).toBeNull();
  });
});
