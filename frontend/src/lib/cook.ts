import type { Ingredient, PantryItem } from './types';

/**
 * Units grouped by dimension, with the size of each unit in a base unit
 * (grams for mass, millilitres for volume). Count-like units share one group
 * keyed by the unit itself, so "2 cans" only matches other cans.
 */
const MASS: Record<string, number> = { g: 1, gram: 1, kg: 1000, kilogram: 1000, oz: 28.35, ounce: 28.35, lb: 453.6, pound: 453.6 };
const VOLUME: Record<string, number> = {
  ml: 1, milliliter: 1, millilitre: 1, l: 1000, liter: 1000, litre: 1000,
  tsp: 4.93, teaspoon: 4.93, tbsp: 14.79, tablespoon: 14.79, cup: 236.6,
  'fl oz': 29.57, pint: 473.2, quart: 946.4, gallon: 3785,
};
const COUNT_ALIASES: Record<string, string> = { '': 'count', count: 'count', whole: 'count', piece: 'count', each: 'count', large: 'count', medium: 'count', small: 'count' };

function canonicalUnit(unit: string | null | undefined): string {
  let u = (unit ?? '').trim().toLowerCase().replace(/\.$/, '');
  if (u === 'lbs') u = 'lb';
  if (u.length > 2 && u.endsWith('s') && !(u in MASS) && !(u in VOLUME)) u = u.slice(0, -1); // cups -> cup, cloves -> clove
  return COUNT_ALIASES[u] ?? u;
}

/** Converts `qty` of `from` into `to`, or returns null if the units can't be compared. */
export function convert(qty: number, from: string | null | undefined, to: string | null | undefined): number | null {
  const f = canonicalUnit(from);
  const t = canonicalUnit(to);
  if (f === t) return qty;
  if (f in MASS && t in MASS) return (qty * MASS[f]) / MASS[t];
  if (f in VOLUME && t in VOLUME) return (qty * VOLUME[f]) / VOLUME[t];
  return null;
}

const tokens = (s: string) =>
  s
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .split(/[^a-z]+/)
    .filter(Boolean)
    .map((w) => (w.length > 3 && w.endsWith('es') && /(oes|ches|shes|sses)$/.test(w) ? w.slice(0, -2) : w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w));

/** True if every word of the pantry name appears, in order and adjacent, in the ingredient name. */
export function namesMatch(pantryName: string, ingredientName: string): boolean {
  const p = tokens(pantryName);
  const i = tokens(ingredientName);
  if (!p.length) return false;
  for (let start = 0; start + p.length <= i.length; start++) {
    if (p.every((w, k) => i[start + k] === w)) return true;
  }
  return false;
}

export type CookUpdate = { item: PantryItem; newQuantity: number; used: number };
export type CookSkip = { item: PantryItem; ingredient: Ingredient; reason: 'units' | 'no-quantity' };
export type CookPlan = { updates: CookUpdate[]; skipped: CookSkip[] };

/**
 * Works out how cooking a recipe changes the pantry. Each pantry item is
 * matched to at most one ingredient; quantities are converted when units are
 * compatible and skipped otherwise. Nothing is written here.
 */
export function planCook(ingredients: Ingredient[], pantry: PantryItem[]): CookPlan {
  const updates: CookUpdate[] = [];
  const skipped: CookSkip[] = [];

  for (const item of pantry) {
    const ingredient = ingredients.find((ing) => namesMatch(item.name, ing.name));
    if (!ingredient) continue;

    const recipeQty = typeof ingredient.quantity === 'number' ? ingredient.quantity : Number(ingredient.quantity);
    if (item.quantity == null || !Number.isFinite(recipeQty)) {
      skipped.push({ item, ingredient, reason: 'no-quantity' });
      continue;
    }
    const used = convert(recipeQty, ingredient.unit, item.unit);
    if (used == null) {
      skipped.push({ item, ingredient, reason: 'units' });
      continue;
    }
    const newQuantity = Math.max(0, Math.round((item.quantity - used) * 100) / 100);
    updates.push({ item, newQuantity, used: Math.round(used * 100) / 100 });
  }
  return { updates, skipped };
}
