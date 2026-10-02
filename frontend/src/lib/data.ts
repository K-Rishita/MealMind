/**
 * All database access for the app. Components call these functions instead of
 * using the Supabase client directly. Row level security scopes every user
 * table to the signed-in user, so no query needs to filter by user id.
 */
import { supabase } from './supabase';
import type { Cost, Ingredient, MealPlan, NewItem, PantryItem, PlanDay, PlanSlot, Recipe, ShoppingListItem, SkillLevel, UserProfile } from './types';

type RecipeRow = {
  id: string;
  name: string;
  cost: Cost;
  skill: SkillLevel;
  minutes: number;
  diets: Recipe['diets'];
  meal_types: Recipe['mealTypes'];
  ingredients: Ingredient[];
  steps: string[];
};

const ITEM_COLUMNS = 'id, name, quantity, unit';

function check<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

function toRecipe(row: RecipeRow): Recipe {
  return {
    id: row.id,
    name: row.name,
    cost: row.cost,
    time: row.minutes,
    skillLevel: row.skill,
    diets: row.diets,
    mealTypes: row.meal_types,
    ingredientItems: row.ingredients,
    ingredients: row.ingredients.map((i) => [i.quantity, i.unit, i.name].filter((p) => p !== '' && p != null).join(' ')),
    steps: row.steps,
    instructions: row.steps.map((s, i) => `${i + 1}. ${s}`).join('\n'),
  };
}

// ---------------------------------------------------------------------------
// Recipes
// ---------------------------------------------------------------------------

export async function fetchRecipes(): Promise<Recipe[]> {
  const rows = check(await supabase.from('recipes').select('*').order('name'));
  return (rows as RecipeRow[]).map(toRecipe);
}

const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** The user's most recent saved meal plan, or null. */
export async function fetchLatestPlan(): Promise<MealPlan | null> {
  const latest = check(
    await supabase.from('meal_plans').select('id').order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ) as { id: string } | null;
  if (!latest) return null;
  const rows = check(
    await supabase.from('meal_plan_entries').select('day, slot, recipes(id, name, minutes)').eq('plan_id', latest.id),
  ) as unknown as { day: string; slot: PlanSlot; recipes: { id: string; name: string; minutes: number } }[];

  const days = new Map<string, PlanDay>();
  for (const row of rows) {
    const day = days.get(row.day) ?? { day: row.day, breakfast: null, lunch: null, dinner: null, snack: null };
    day[row.slot] = row.recipes;
    days.set(row.day, day);
  }
  return {
    planId: latest.id,
    source: 'saved',
    days: [...days.values()].sort((a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day)),
  };
}

// ---------------------------------------------------------------------------
// Pantry and shopping list
// ---------------------------------------------------------------------------

export async function listPantry(): Promise<PantryItem[]> {
  return check(await supabase.from('pantry_items').select(ITEM_COLUMNS).order('created_at')) as PantryItem[];
}

export async function addPantryItem(item: NewItem): Promise<PantryItem> {
  return check(await supabase.from('pantry_items').insert(item).select(ITEM_COLUMNS).single()) as PantryItem;
}

export async function updatePantryQuantity(id: string, quantity: number | null): Promise<void> {
  check(await supabase.from('pantry_items').update({ quantity }).eq('id', id));
}

export async function deletePantryItem(id: string): Promise<void> {
  check(await supabase.from('pantry_items').delete().eq('id', id));
}

export async function listShoppingList(): Promise<ShoppingListItem[]> {
  return check(await supabase.from('shopping_list_items').select(`${ITEM_COLUMNS}, checked`).order('created_at')) as ShoppingListItem[];
}

export async function addShoppingItem(item: NewItem): Promise<ShoppingListItem> {
  return check(
    await supabase.from('shopping_list_items').insert(item).select(`${ITEM_COLUMNS}, checked`).single(),
  ) as ShoppingListItem;
}

export async function deleteShoppingItem(id: string): Promise<void> {
  check(await supabase.from('shopping_list_items').delete().eq('id', id));
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

type ProfileRow = {
  display_name: string | null;
  age: number | null;
  gender: string | null;
  height: string | null;
  weight: string | null;
  calorie_goal: number | null;
  diet: string | null;
};

const str = (v: string | number | null) => (v == null ? undefined : String(v));
const num = (v: string | undefined) => (v ? Number(v) : null);

export async function getProfile(): Promise<UserProfile> {
  const row = check(
    await supabase.from('profiles').select('display_name, age, gender, height, weight, calorie_goal, diet').maybeSingle(),
  ) as ProfileRow | null;
  if (!row) return {};
  return {
    displayName: str(row.display_name),
    age: str(row.age),
    gender: str(row.gender),
    height: str(row.height),
    weight: str(row.weight),
    calorieGoal: str(row.calorie_goal),
    diet: str(row.diet),
  };
}

export async function updateProfile(userId: string, p: UserProfile): Promise<void> {
  check(
    await supabase
      .from('profiles')
      .update({
        age: num(p.age),
        gender: p.gender ?? null,
        height: p.height ?? null,
        weight: p.weight ?? null,
        calorie_goal: num(p.calorieGoal),
        diet: p.diet ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId),
  );
}
