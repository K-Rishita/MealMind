import { describe, expect, it } from 'vitest';
import recipes from '../../../Recipes.json';
import { parseCookTimeMinutes } from './time';

describe('parseCookTimeMinutes', () => {
  it.each([
    ['40 minutes', 40],
    ['1 hour', 60],
    ['1 hour 15 minutes', 75],
    ['8 hours 30 minutes (simmering)', 510],
    ['45 minutes (includes marinating)', 45],
    ['5 minutes (prep) + chilling', 5],
    ['1.5 hours', 90],
  ])('parses %j as %i minutes', (input, expected) => {
    expect(parseCookTimeMinutes(input)).toBe(expected);
  });

  it('returns null when there is no duration', () => {
    expect(parseCookTimeMinutes('overnight')).toBeNull();
    expect(parseCookTimeMinutes('')).toBeNull();
  });

  it('parses every cook time in Recipes.json', () => {
    const unparsed = recipes
      .map((r) => r.timeTakenToCook)
      .filter((t) => parseCookTimeMinutes(t) === null);
    expect(unparsed).toEqual([]);
  });
});
