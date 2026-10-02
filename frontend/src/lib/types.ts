export type Cost = 'low' | 'medium' | 'high';
export type SkillLevel = 'beginner' | 'intermediate' | 'advanced';
export type Diet = 'vegetarian' | 'vegan' | 'pescatarian' | 'keto' | 'paleo' | 'gluten-free' | 'dairy-free';
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'dessert' | 'side';

export type Ingredient = {
  quantity: number | string | null;
  unit: string;
  name: string;
};

export type Recipe = {
  id: string;
  name: string;
  cost: Cost;
  time: number; // minutes
  skillLevel: SkillLevel;
  diets: Diet[];
  mealTypes: MealType[];
  ingredientItems: Ingredient[];
  ingredients: string[]; // display strings, e.g. "1 cup Rice"
  steps: string[];
  instructions: string; // numbered steps joined for display
};

export type PantryItem = {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
};

export type ShoppingListItem = PantryItem & { checked: boolean };

export type NewItem = { name: string; quantity: number | null; unit: string | null };

export type UserProfile = {
  displayName?: string;
  age?: string;
  gender?: string;
  height?: string;
  weight?: string;
  calorieGoal?: string;
  diet?: string;
};

export type PlanSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type PlannedMeal = { id: string; name: string; minutes: number } | null;
export type PlanDay = { day: string } & Record<PlanSlot, PlannedMeal>;

/** A generated, saved meal plan. `source` says whether the AI built it or the rule-based fallback did. */
export type MealPlan = {
  planId: string;
  source: 'model' | 'model-retry' | 'fallback' | 'saved';
  days: PlanDay[];
};

export type PlanSuggestion = { field: 'cost' | 'time' | 'skill' | 'diet'; label: string };

/** "2 cups", "3", or "" for an item without a quantity. */
export function formatQuantity(item: { quantity: number | null; unit: string | null }): string {
  return [item.quantity ?? '', item.unit ?? ''].join(' ').trim();
}

/** "2 cups of Rice" / "Rice", used when describing the pantry to the AI. */
export function describeItem(item: PantryItem): string {
  const qty = formatQuantity(item);
  return qty ? `${qty} of ${item.name}` : item.name;
}
