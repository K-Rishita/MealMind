/**
 * Everything the HTTP layer needs from the outside world, behind one interface
 * so routes can be tested with fakes. The Supabase implementation acts as the
 * signed-in user (their access token), so row level security applies to every query.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { PlanRequest } from './planner/filters.js';
import type { PlanResult } from './planner/grounded.js';
import type { Diet, MealType, Recipe } from './planner/recipes.js';
import { DIETS } from './planner/recipes.js';

export type UserContext = {
  userId: string;
  diet: Diet | 'none';
  pantry: { name: string; quantity: string }[];
};

export interface Services {
  /** Returns the user for a Supabase access token, or null if it is invalid. */
  authenticate(token: string): Promise<UserContext | null>;
  /** All recipes (cached briefly). Recipes are only readable when signed in, hence the token. */
  recipes(token: string): Promise<Recipe[]>;
  savePlan(token: string, request: PlanRequest, result: Extract<PlanResult, { status: 'ok' }>, model: string): Promise<string>;
}

type RecipeRow = {
  id: string;
  name: string;
  cost: Recipe['cost'];
  skill: Recipe['skill'];
  minutes: number;
  diets: Diet[];
  meal_types: MealType[];
  ingredients: { quantity: number | string | null; unit: string; name: string }[];
  steps: string[];
};

const RECIPE_CACHE_MS = 5 * 60 * 1000;

export function supabaseServices(url: string, anonKey: string): Services {
  const asUser = (token: string): SupabaseClient =>
    createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
  const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  let cache: { at: number; recipes: Recipe[] } | null = null;

  return {
    async authenticate(token) {
      const { data, error } = await anon.auth.getUser(token);
      if (error || !data.user) return null;
      const db = asUser(token);
      const [profile, pantry] = await Promise.all([
        db.from('profiles').select('diet').maybeSingle(),
        db.from('pantry_items').select('name, quantity, unit').order('created_at'),
      ]);
      if (profile.error) throw new Error(profile.error.message);
      if (pantry.error) throw new Error(pantry.error.message);
      const diet = profile.data?.diet;
      return {
        userId: data.user.id,
        diet: DIETS.includes(diet) ? diet : 'none',
        pantry: (pantry.data ?? []).map((p) => ({ name: p.name, quantity: [p.quantity, p.unit].filter((x) => x != null && x !== '').join(' ') })),
      };
    },

    async recipes(token) {
      if (cache && Date.now() - cache.at < RECIPE_CACHE_MS) return cache.recipes;
      const { data, error } = await asUser(token).from('recipes').select('*');
      if (error) throw new Error(error.message);
      const recipes = (data as RecipeRow[]).map(
        (r): Recipe => ({
          id: r.id,
          name: r.name,
          cost: r.cost,
          skill: r.skill,
          minutes: r.minutes,
          diets: r.diets,
          mealTypes: r.meal_types,
          ingredientNames: r.ingredients.map((i) => i.name),
          ingredients: r.ingredients.map((i) => [i.quantity, i.unit, i.name].filter((p) => p !== '' && p != null).join(' ')),
          steps: r.steps,
        }),
      );
      cache = { at: Date.now(), recipes };
      return recipes;
    },

    async savePlan(token, request, result, model) {
      const db = asUser(token);
      const plan = await db.from('meal_plans').insert({ request, model: `${model} (${result.source})` }).select('id').single();
      if (plan.error) throw new Error(plan.error.message);
      const entries = result.days.flatMap((d) =>
        (['breakfast', 'lunch', 'dinner', 'snack'] as const)
          .filter((slot) => d[slot])
          .map((slot) => ({ plan_id: plan.data.id, day: d.day, slot, recipe_id: d[slot] })),
      );
      const inserted = await db.from('meal_plan_entries').insert(entries);
      if (inserted.error) throw new Error(inserted.error.message);
      return plan.data.id as string;
    },
  };
}
