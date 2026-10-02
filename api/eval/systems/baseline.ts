/**
 * Baselines: the prompt-only meal planner from frontend/src/components/Home.tsx.
 *
 * - baseline-app:   faithful copy of the app as shipped. Its Firestore query reads
 *                   `doc.data().name`, which does not exist (the field is `recipeName`),
 *                   so every recipe name is `undefined`; it filters cost and skill only,
 *                   ignores time, and has no way to express a diet.
 * - baseline-fixed: the same prompt-only approach done properly: recipes correctly
 *                   pre-filtered on every constraint, real names, diet stated in the prompt.
 *                   This is the fair comparison for the grounded planner.
 */
import { matchingRecipes, type PlanRequest } from '../../src/planner/filters.js';
import type { Recipe } from '../../src/planner/recipes.js';
import type { PlanDay } from '../../src/planner/score.js';

export type BaselineName = 'baseline-app' | 'baseline-fixed';

/** Recipe "names" exactly as the shipped fetchRecipesByFilters returns them. */
function appRecipeNames(recipes: Recipe[], req: PlanRequest): (string | undefined)[] {
  return recipes
    .filter((r) => (req.cost === 'all' || r.cost === req.cost) && (req.skill === 'all' || r.skill === req.skill))
    .map(() => undefined);
}

export function buildBaselinePrompt(system: BaselineName, recipes: Recipe[], req: PlanRequest): string {
  const ingredientsList = req.pantry.map((item) => `${item.quantity} of ${item.name}`).join(', ');
  const names = system === 'baseline-app' ? appRecipeNames(recipes, req) : matchingRecipes(recipes, req).map((r) => r.name);
  const recipeNamesList = names.join(', '); // [undefined, undefined].join(', ') === ', '
  const dietLine = system === 'baseline-fixed' ? `\n      Dietary Restriction: ${req.diet}` : '';

  // Text below is copied verbatim from Home.tsx (handleGenerateMealPlan); only dietLine is added for baseline-fixed.
  return `
      You are an expert chef and meal planner. Generate a 5-day meal plan (Monday to Friday) based on the following:

      Available Ingredients (for reference): ${ingredientsList || 'None listed.'}
      Available Recipes in Database: [${recipeNamesList}]

      Instructions:
      1. For the meal plan, you **MUST ONLY** use recipe names found in the [${recipeNamesList}] list.
      2. If a recipe from the list is not suitable for a specific meal (e.g., a "Dinner" recipe for "Breakfast"), suggest a generic snack or simple item like "Toast and Jam" or "Quick Salad" if no appropriate recipe name is available for that slot.

      Budget Preference: ${req.cost}
      Time Preference: ${req.time}
      Skill Level: ${req.skill}${dietLine}

      The output MUST be a JSON object with the following structure:
            {
              "plan": [
                { "day": "Monday", "breakfast": "Recipe Name for Breakfast", "lunch": "Recipe Name for Lunch", "dinner": "Recipe Name for Dinner", "snack": "Snack Idea" },
                // ... Tuesday to Friday ...
              ]
            }
            Do not include any introductory or concluding text outside of the JSON block.
        `;
}

/** Parses model text the same way Home.tsx does. Returns null if the app would show its parse error. */
export function parseBaselineOutput(text: string): PlanDay[] | null {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    return parsed.plan && Array.isArray(parsed.plan) ? parsed.plan : null;
  } catch {
    return null;
  }
}
