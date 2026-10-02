import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { matchingRecipes, timeBucket, violations, type PlanRequest } from './filters.js';
import { loadRecipes, normalizeDiets, type Recipe } from './recipes.js';
import { makeResolver, scorePlan } from './score.js';

const recipes = loadRecipes(fileURLToPath(new URL('../../../Recipes.json', import.meta.url)));
const req = (over: Partial<PlanRequest> = {}): PlanRequest => ({ cost: 'all', time: 'all', skill: 'all', diet: 'none', pantry: [], ...over });

describe('normalizeDiets', () => {
  it('keeps unconditional tags and adds implied diets', () => {
    expect(normalizeDiets(['Vegan', 'Gluten Free'])).toEqual(['vegetarian', 'vegan', 'pescatarian', 'gluten-free', 'dairy-free']);
  });

  it('drops tags that need a substitution', () => {
    expect(normalizeDiets(['Vegan (using oil instead of ghee)', 'Gluten Free (if using GF pasta)'])).toEqual([]);
  });

  it('treats "None" as no diet', () => {
    expect(normalizeDiets(['None'])).toEqual([]);
  });
});

describe('loadRecipes', () => {
  it('loads all 124 recipes with unique ids and parsed times', () => {
    expect(recipes).toHaveLength(124);
    expect(new Set(recipes.map((r) => r.id)).size).toBe(124);
    expect(recipes.every((r) => r.minutes > 0)).toBe(true);
  });
});

describe('filters', () => {
  it('buckets times at 30 and 60 minutes', () => {
    expect([30, 31, 60, 61].map(timeBucket)).toEqual(['quick', 'medium', 'medium', 'long']);
  });

  it('reports every broken constraint', () => {
    const carbonara = recipes.find((r) => r.name === 'Classic Spaghetti Carbonara')!;
    expect(violations(carbonara, req({ diet: 'vegan', cost: carbonara.cost === 'low' ? 'high' : 'low' }))).toEqual(['cost', 'diet']);
  });

  it('matches every recipe when there are no constraints', () => {
    expect(matchingRecipes(recipes, req())).toHaveLength(124);
  });
});

describe('scorePlan', () => {
  const resolve = makeResolver(recipes);
  const dal = recipes.find((r) => r.name.startsWith('Dal Tadka'))! as Recipe;

  it('resolves ids, exact names and names without the parenthetical', () => {
    expect(resolve(dal.id)?.id).toBe(dal.id);
    expect(resolve('dal tadka (yellow lentil curry)')?.id).toBe(dal.id);
    expect(resolve('Dal Tadka')?.id).toBe(dal.id);
    expect(resolve('Toast and Jam')).toBeNull();
  });

  it('flags invented recipes and constraint violations', () => {
    const plan = [{ day: 'Monday', breakfast: 'Toast and Jam', lunch: 'Dal Tadka', dinner: 'Classic Spaghetti Carbonara', snack: '' }];
    const score = scorePlan(plan, req({ diet: 'vegan' }), resolve);
    expect(score.daysCorrect).toBe(false); // only one day
    expect(score.entries.map((e) => [e.slot, e.recipeId !== null, e.violations])).toEqual([
      ['breakfast', false, []],
      ['lunch', true, []],
      ['dinner', true, ['diet']],
      ['snack', false, []],
    ]);
  });
});
