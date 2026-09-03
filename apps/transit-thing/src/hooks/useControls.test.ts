import { describe, expect, test } from 'bun:test';
import { stepsFor } from './useControls';

describe('stepsFor', () => {
  test('three 25 px nudges make one step', () => {
    let r = stepsFor(0, 25);
    expect(r).toEqual({ steps: 0, residue: 25 });
    r = stepsFor(r.residue, 25);
    expect(r).toEqual({ steps: 0, residue: 50 });
    r = stepsFor(r.residue, 25);
    expect(r).toEqual({ steps: 1, residue: 15 });
  });
  test('a 150 px flick makes two steps and carries the rest', () => {
    expect(stepsFor(0, 150)).toEqual({ steps: 2, residue: 30 });
  });
  test('the residue carries into the next event', () => {
    expect(stepsFor(30, 40)).toEqual({ steps: 1, residue: 10 });
  });
  test('turning the other way steps negative', () => {
    expect(stepsFor(0, -75)).toEqual({ steps: -1, residue: -15 });
  });
});
