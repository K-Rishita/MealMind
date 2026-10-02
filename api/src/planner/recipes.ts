import { readFileSync } from 'node:fs';
import { parseCookTimeMinutes } from './time.js';

export const DIETS = ['vegetarian', 'vegan', 'pescatarian', 'keto', 'paleo', 'gluten-free', 'dairy-free'] as const;
export type Diet = (typeof DIETS)[number];
export type Cost = 'low' | 'medium' | 'high';
export type Skill = 'beginner' | 'intermediate' | 'advanced';

export type Recipe = {
  id: string;
  name: string;
  cost: Cost;
  skill: Skill;
  minutes: number;
  diets: Diet[];
  ingredients: string[];
  steps: string[];
};

/** Shape of one entry in Recipes.json. */
export type RawRecipe = {
  recipeName: string;
  ingredients: { quantity: number | string; unit: string; name: string }[];
  steps: string[];
  dietaryRestrictions: string[];
  costOfIngredients: string;
  skillLevel: string;
  timeTakenToCook: string;
};

const TAG_TO_DIET: Record<string, Diet> = {
  vegetarian: 'vegetarian',
  vegan: 'vegan',
  pescatarian: 'pescatarian',
  keto: 'keto',
  paleo: 'paleo',
  'gluten free': 'gluten-free',
  'dairy free': 'dairy-free',
};

/**
 * Converts raw diet tags to diets the recipe satisfies as written.
 * Conditional tags such as "Vegan (using oil instead of ghee)" are dropped:
 * the recipe only meets that diet after a substitution.
 * Implied diets are added (vegan is also vegetarian and dairy-free, etc.).
 */
export function normalizeDiets(tags: string[]): Diet[] {
  const diets = new Set<Diet>();
  for (const tag of tags) {
    const diet = TAG_TO_DIET[tag.trim().toLowerCase()];
    if (diet) diets.add(diet);
  }
  if (diets.has('vegan')) {
    diets.add('vegetarian');
    diets.add('dairy-free');
  }
  if (diets.has('vegetarian')) diets.add('pescatarian');
  return DIETS.filter((d) => diets.has(d));
}

export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function normalizeRecipe(raw: RawRecipe): Recipe {
  const minutes = parseCookTimeMinutes(raw.timeTakenToCook);
  if (minutes === null) throw new Error(`Unparseable cook time for "${raw.recipeName}": ${raw.timeTakenToCook}`);

  return {
    id: slugify(raw.recipeName),
    name: raw.recipeName,
    cost: raw.costOfIngredients.toLowerCase() as Cost,
    skill: raw.skillLevel.toLowerCase() as Skill,
    minutes,
    diets: normalizeDiets(raw.dietaryRestrictions),
    ingredients: raw.ingredients.map((i) => [i.quantity, i.unit, i.name].filter((p) => p !== '' && p != null).join(' ')),
    steps: raw.steps,
  };
}

export function loadRecipes(path: string): Recipe[] {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as RawRecipe[];
  return raw.map(normalizeRecipe);
}
