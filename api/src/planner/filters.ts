import type { Cost, Diet, Recipe, Skill } from './recipes.js';

export type TimeBucket = 'quick' | 'medium' | 'long';

/** What a user asks the planner for. 'all' means no constraint. */
export type PlanRequest = {
  cost: Cost | 'all';
  time: TimeBucket | 'all';
  skill: Skill | 'all';
  diet: Diet | 'none';
  pantry: { name: string; quantity: string }[];
};

export function timeBucket(minutes: number): TimeBucket {
  if (minutes <= 30) return 'quick';
  if (minutes <= 60) return 'medium';
  return 'long';
}

/** Names of the constraints a recipe breaks for a request (empty if it fits). */
export function violations(recipe: Recipe, req: PlanRequest): string[] {
  const broken: string[] = [];
  if (req.cost !== 'all' && recipe.cost !== req.cost) broken.push('cost');
  if (req.time !== 'all' && timeBucket(recipe.minutes) !== req.time) broken.push('time');
  if (req.skill !== 'all' && recipe.skill !== req.skill) broken.push('skill');
  if (req.diet !== 'none' && !recipe.diets.includes(req.diet)) broken.push('diet');
  return broken;
}

export function matchingRecipes(recipes: Recipe[], req: PlanRequest): Recipe[] {
  return recipes.filter((r) => violations(r, req).length === 0);
}
