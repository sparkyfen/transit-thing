import { describe, expect, test } from 'bun:test';
import { keyToAction, stepsFor, wheelPixels } from './useControls';

describe('stepsFor', () => {
  test('three 40 px nudges make one step', () => {
    let r = stepsFor(0, 40);
    expect(r).toEqual({ steps: 0, residue: 40 });
    r = stepsFor(r.residue, 40);
    expect(r).toEqual({ steps: 0, residue: 80 });
    r = stepsFor(r.residue, 40);
    expect(r).toEqual({ steps: 1, residue: 0 });
  });
  test('one notch is one step', () => {
    expect(stepsFor(0, 120)).toEqual({ steps: 1, residue: 0 });
  });
  test('a 300 px flick makes two steps and carries the rest', () => {
    expect(stepsFor(0, 300)).toEqual({ steps: 2, residue: 60 });
  });
  test('the residue carries into the next event', () => {
    expect(stepsFor(0, 60)).toEqual({ steps: 0, residue: 60 });
    expect(stepsFor(60, 60)).toEqual({ steps: 1, residue: 0 });
  });
  test('turning the other way steps negative', () => {
    expect(stepsFor(0, -120)).toEqual({ steps: -1, residue: 0 });
  });
});

describe('wheelPixels', () => {
  test('pixels pass through', () => {
    expect(wheelPixels(45, 0)).toBe(45);
  });
  test('lines count 120 px each', () => {
    expect(wheelPixels(2, 1)).toBe(240);
    expect(wheelPixels(-1, 1)).toBe(-120);
  });
  test('a page is one detent either way', () => {
    expect(wheelPixels(3, 2)).toBe(120);
    expect(wheelPixels(-3, 2)).toBe(-120);
  });
});

describe('keyToAction', () => {
  test('presets, mode, back, and select', () => {
    expect(keyToAction('3', 1)).toEqual({ type: 'preset', n: 3, at: 1 });
    expect(keyToAction('m', 1)).toEqual({ type: 'mode', at: 1 });
    expect(keyToAction('M', 1)).toEqual({ type: 'mode', at: 1 });
    expect(keyToAction('Escape', 1)).toEqual({ type: 'back', at: 1 });
    expect(keyToAction('Enter', 1)).toEqual({ type: 'select', at: 1 });
  });
  test('arrows turn the dial', () => {
    expect(keyToAction('ArrowUp', 1)).toEqual({ type: 'turn', delta: -1, at: 1 });
    expect(keyToAction('ArrowLeft', 1)).toEqual({ type: 'turn', delta: -1, at: 1 });
    expect(keyToAction('ArrowDown', 1)).toEqual({ type: 'turn', delta: 1, at: 1 });
    expect(keyToAction('ArrowRight', 1)).toEqual({ type: 'turn', delta: 1, at: 1 });
  });
  test('other keys do nothing', () => {
    expect(keyToAction('5', 1)).toBeNull();
    expect(keyToAction('a', 1)).toBeNull();
  });
});
