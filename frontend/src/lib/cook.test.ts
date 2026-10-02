import { describe, expect, it } from 'vitest';
import { convert, namesMatch, planCook } from './cook';
import type { PantryItem } from './types';

const item = (name: string, quantity: number | null, unit: string | null): PantryItem => ({ id: name, name, quantity, unit });

describe('namesMatch', () => {
  it('matches whole words, ignoring plurals and notes', () => {
    expect(namesMatch('Eggs', 'Large Egg Yolks')).toBe(true);
    expect(namesMatch('Chicken Breast', 'Chicken Breast (diced)')).toBe(true);
    expect(namesMatch('Tomatoes', 'Crushed Tomato')).toBe(true);
  });

  it('does not match inside other words', () => {
    expect(namesMatch('Egg', 'Eggplant (sliced)')).toBe(false);
    expect(namesMatch('Rice', 'Licorice')).toBe(false);
    expect(namesMatch('Oil', 'Toil')).toBe(false);
  });
});

describe('convert', () => {
  it('converts within mass and volume', () => {
    expect(convert(1, 'lb', 'g')).toBeCloseTo(453.6);
    expect(convert(3, 'tsp', 'tbsp')).toBeCloseTo(1, 1);
    expect(convert(2, 'cups', 'cup')).toBe(2);
  });

  it('refuses to mix dimensions or count units', () => {
    expect(convert(400, 'g', 'cups')).toBeNull();
    expect(convert(2, 'cans', 'lb')).toBeNull();
  });

  it('treats a missing unit as a count', () => {
    expect(convert(3, '', 'count')).toBe(3);
  });
});

describe('planCook', () => {
  it('deducts converted amounts and never goes below zero', () => {
    const plan = planCook(
      [
        { quantity: 2, unit: 'cups', name: 'Basmati Rice' },
        { quantity: 3, unit: '', name: 'Large Eggs' },
      ],
      [item('Rice', 5, 'cups'), item('Eggs', 2, null)],
    );
    expect(plan.updates.map((u) => [u.item.name, u.newQuantity])).toEqual([
      ['Rice', 3],
      ['Eggs', 0],
    ]);
  });

  it('skips ingredients whose units cannot be compared', () => {
    const plan = planCook([{ quantity: 400, unit: 'g', name: 'Spaghetti' }], [item('Spaghetti', 2, 'boxes')]);
    expect(plan.updates).toEqual([]);
    expect(plan.skipped.map((s) => s.reason)).toEqual(['units']);
  });

  it('ignores pantry items the recipe does not use', () => {
    const plan = planCook([{ quantity: 1, unit: '', name: 'Eggplant' }], [item('Eggs', 12, null)]);
    expect(plan).toEqual({ updates: [], skipped: [] });
  });
});
