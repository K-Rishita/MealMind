import { violations, type PlanRequest } from './filters.js';
import type { Recipe } from './recipes.js';

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const;
export const MAIN_SLOTS = ['breakfast', 'lunch', 'dinner'] as const;
export const SLOTS = [...MAIN_SLOTS, 'snack'] as const;
export type Slot = (typeof SLOTS)[number];

/** A plan as produced by any system: each slot holds a recipe name or id. */
export type PlanDay = { day: string } & Partial<Record<Slot, string>>;

export type EntryScore = {
  day: string;
  slot: Slot;
  value: string;
  recipeId: string | null; // null = not a recipe in the database
  violations: string[];
};

export type PlanScore = {
  daysCorrect: boolean; // exactly Monday–Friday, in order
  entries: EntryScore[];
};

const clean = (s: string) =>
  s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const withoutParens = (s: string) => clean(s.replace(/\(.*?\)/g, ''));

/**
 * Resolves a plan entry to a recipe. Lenient on purpose so that prompt-only
 * baselines are not penalised for formatting: matches the id, the full name,
 * or the name without its parenthetical ("Dal Tadka" -> "Dal Tadka (Yellow Lentil Curry)").
 */
export function makeResolver(recipes: Recipe[]) {
  const byKey = new Map<string, Recipe | null>();
  const add = (key: string, r: Recipe) => {
    if (!key) return;
    const existing = byKey.get(key);
    byKey.set(key, existing && existing.id !== r.id ? null : r); // null marks an ambiguous short name
  };
  for (const r of recipes) {
    add(r.id, r);
    add(clean(r.name), r);
    add(withoutParens(r.name), r);
  }
  return (value: string): Recipe | null => {
    const v = value.trim();
    return byKey.get(v) ?? byKey.get(clean(v)) ?? byKey.get(withoutParens(v)) ?? null;
  };
}

export function scorePlan(plan: PlanDay[], req: PlanRequest, resolve: (v: string) => Recipe | null): PlanScore {
  const entries: EntryScore[] = [];
  for (const day of plan) {
    for (const slot of SLOTS) {
      const value = typeof day[slot] === 'string' ? (day[slot] as string) : '';
      const recipe = value ? resolve(value) : null;
      entries.push({
        day: day.day,
        slot,
        value,
        recipeId: recipe?.id ?? null,
        violations: recipe ? violations(recipe, req) : [],
      });
    }
  }
  const daysCorrect = plan.length === DAYS.length && plan.every((d, i) => d.day === DAYS[i]);
  return { daysCorrect, entries };
}
