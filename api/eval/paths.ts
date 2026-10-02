import { fileURLToPath } from 'node:url';

export const RECIPES_PATH = fileURLToPath(new URL('../../Recipes.json', import.meta.url));
export const MEAL_TYPES_PATH = fileURLToPath(new URL('../../supabase/data/meal_types.json', import.meta.url));
export const RESULTS_DIR = fileURLToPath(new URL('./results/', import.meta.url));
export const REPORTS_DIR = fileURLToPath(new URL('./reports/', import.meta.url));
