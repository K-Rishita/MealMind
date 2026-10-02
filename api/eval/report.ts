/**
 * Scores stored eval results and writes a summary.
 * Usage: npx tsx eval/report.ts <system> [<system> ...] [--subset core|all] [--runs 1]
 * Writes eval/reports/<system>.json and prints a comparison table.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { findCandidates, SLOT_MEAL_TYPES } from '../src/planner/grounded.js';
import { pantryItemsUsed } from '../src/planner/pantry.js';
import { loadRecipes } from '../src/planner/recipes.js';
import { makeResolver, MAIN_SLOTS, scorePlan, type PlanDay, type PlanScore } from '../src/planner/score.js';
import { selectCases, type EvalCase } from './cases.js';
import { MEAL_TYPES_PATH, RECIPES_PATH, REPORTS_DIR, RESULTS_DIR } from './paths.js';
import type { RunRecord } from './run.js';
import { parseBaselineOutput } from './systems/baseline.js';

/** Output of any system, parsed. `insufficient` = the system said the request can't be met. */
type Parsed = { plan: PlanDay[] | null; insufficient: boolean; source?: string };

function parseOutput(record: RunRecord): Parsed {
  if (record.text == null) return { plan: null, insufficient: false };
  if (record.system === 'grounded' || record.system === 'rules-only') {
    const result = JSON.parse(record.text);
    return result.status === 'insufficient'
      ? { plan: null, insufficient: true }
      : { plan: result.days, insufficient: false, source: result.source };
  }
  return { plan: parseBaselineOutput(record.text), insufficient: false };
}

// The injected "pantry item" is an attack string, not food; leave it out of pantry-use scoring.
const INJECTION_MARKERS = /ignore|system:|note to ai|disregard|respond with/i;

const pct = (n: number, d: number) => (d === 0 ? null : Math.round((1000 * n) / d) / 10);
const percentile = (xs: number[], p: number) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
};

export function summarize(system: string, subset: 'core' | 'all' = 'core', runs = 1) {
  const recipes = loadRecipes(RECIPES_PATH, MEAL_TYPES_PATH);
  const recipeById = new Map(recipes.map((r) => [r.id, r]));
  const resolve = makeResolver(recipes);
  const cases = selectCases(JSON.parse(readFileSync(new URL('./cases.json', import.meta.url), 'utf8')) as EvalCase[], subset);
  const caseById = new Map(cases.map((c) => [c.id, c]));
  const dir = join(RESULTS_DIR, system);
  if (!existsSync(dir)) throw new Error(`No results for ${system}`);

  const records: RunRecord[] = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as RunRecord)
    .filter((r) => r.run <= runs);

  let calls = 0, apiErrors = 0, parsed = 0, daysCorrect = 0;
  let mainEntries = 0, mainInDb = 0, mainCompliant = 0, snackEntries = 0, snackInDb = 0;
  let plannableRuns = 0, plannableGood = 0;
  let unplannableRuns = 0, unplannableHandled = 0, plansReturned = 0;
  const uniqueMainRatios: number[] = [];
  const mainMinutes: number[] = [];
  let injectionRuns = 0, injectionPlansAllGood = 0;
  let repeatsOver2 = 0;
  let mainFitMeal = 0, pantryItemsTotal = 0, pantryItemsUsedTotal = 0, modelCalls = 0;
  const sources: Record<string, number> = {};
  const violationCounts: Record<string, number> = { cost: 0, time: 0, skill: 0, diet: 0 };
  const latencies: number[] = [];
  const perCase: Record<string, { runs: number; goodPlans: number }> = {};

  for (const rec of records) {
    const c = caseById.get(rec.caseId);
    if (!c) continue;
    calls++;
    perCase[c.id] ??= { runs: 0, goodPlans: 0 };
    perCase[c.id].runs++;
    if (rec.error) { apiErrors++; continue; }
    latencies.push(rec.latencyMs);

    const out = parseOutput(rec);
    modelCalls += rec.modelCalls ?? 1;
    if (out.source) sources[out.source] = (sources[out.source] ?? 0) + 1;
    // Plannable = every main meal has at least one recipe that meets the filters AND suits that meal.
    const candidates = findCandidates(recipes, c.request);
    const plannable = MAIN_SLOTS.every((s) => candidates[s].length > 0);
    if (plannable) plannableRuns++;
    else {
      unplannableRuns++;
      if (out.insufficient) unplannableHandled++;
    }
    if (c.category === 'injection') injectionRuns++;
    if (!out.insufficient) plansReturned++;
    if (!out.plan) continue;
    parsed++;

    const score: PlanScore = scorePlan(out.plan, c.request, resolve);
    if (score.daysCorrect) daysCorrect++;
    const main = score.entries.filter((e) => (MAIN_SLOTS as readonly string[]).includes(e.slot));
    const snack = score.entries.filter((e) => e.slot === 'snack');
    mainEntries += main.length;
    snackEntries += snack.length;
    snackInDb += snack.filter((e) => e.recipeId).length;
    const pantryNames = c.request.pantry.map((p) => p.name).filter((n) => !INJECTION_MARKERS.test(n));
    const planIngredients = main.flatMap((e) => (e.recipeId ? recipeById.get(e.recipeId)!.ingredientNames : []));
    pantryItemsTotal += pantryNames.length;
    pantryItemsUsedTotal += pantryItemsUsed(planIngredients, pantryNames).length;
    for (const e of main) {
      if (!e.recipeId) continue;
      mainInDb++;
      if (recipeById.get(e.recipeId)!.mealTypes.some((t) => SLOT_MEAL_TYPES[e.slot].includes(t))) mainFitMeal++;
      mainMinutes.push(recipeById.get(e.recipeId)!.minutes);
      if (e.violations.length === 0) mainCompliant++;
      for (const v of e.violations) violationCounts[v]++;
    }
    const counts = new Map<string, number>();
    for (const e of main) if (e.recipeId) counts.set(e.recipeId, (counts.get(e.recipeId) ?? 0) + 1);
    if ([...counts.values()].some((n) => n > 2)) repeatsOver2++;
    if (plannable) uniqueMainRatios.push(counts.size / 15);

    // A fully valid plan: Mon–Fri, and all 15 main meals are real recipes that meet every
    // constraint and suit their slot. Same definition for every system.
    const good =
      score.daysCorrect &&
      main.length === 15 &&
      main.every((e) => e.recipeId && e.violations.length === 0 && recipeById.get(e.recipeId)!.mealTypes.some((t) => SLOT_MEAL_TYPES[e.slot].includes(t)));
    if (good && plannable) { plannableGood++; perCase[c.id].goodPlans++; }
    if (good && c.category === 'injection') injectionPlansAllGood++;
  }

  const mainInDbViolating = mainInDb - mainCompliant;
  return {
    system,
    model: records[0]?.model,
    calls,
    cases: Object.keys(perCase).length,
    apiErrors,
    metrics: {
      validPlanRate: pct(parsed, plansReturned), // of responses that returned a plan, share that parsed
      correctDaysRate: pct(daysCorrect, parsed),
      mainMealsNotInDatabase: pct(mainEntries - mainInDb, mainEntries),
      mainMealsViolatingConstraints: pct(mainInDbViolating, mainEntries),
      mainMealsGroundedAndCompliant: pct(mainCompliant, mainEntries),
      snacksInDatabase: pct(snackInDb, snackEntries),
      fullyValidPlanRate_plannableCases: pct(plannableGood, plannableRuns),
      impossibleRequestsHandled: pct(unplannableHandled, unplannableRuns),
      injectionCasesFullyValid: pct(injectionPlansAllGood, injectionRuns),
      plansWithRecipeRepeatedOver2x: pct(repeatsOver2, parsed),
      mainMealsSuitForSlot: pct(mainFitMeal, mainEntries),
      pantryItemsUsedInPlan: pct(pantryItemsUsedTotal, pantryItemsTotal),
      distinctMainRecipesPerPlan: uniqueMainRatios.length ? pct(uniqueMainRatios.reduce((a, b) => a + b, 0), uniqueMainRatios.length) : null,
      medianMainMealMinutes: percentile(mainMinutes, 50),
      latencyP50Ms: percentile(latencies, 50),
      latencyP95Ms: percentile(latencies, 95),
    },
    violationsOfMainMeals: violationCounts,
    sources,
    modelCalls,
    counts: { parsed, mainEntries, mainInDb, mainCompliant, plannableRuns, unplannableRuns, injectionRuns },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const flag = (name: string) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 ? process.argv[i + 1] : undefined;
  };
  const subset = (flag('subset') ?? 'core') as 'core' | 'all';
  const runs = Number(flag('runs') ?? 1);
  const systems = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !all[i - 1]?.startsWith('--'));
  if (!systems.length) throw new Error('Usage: npx tsx eval/report.ts <system> [<system> ...] [--subset core|all] [--runs 1]');
  mkdirSync(REPORTS_DIR, { recursive: true });
  const reports = systems.map((s) => summarize(s, subset, runs));
  for (const r of reports) writeFileSync(join(REPORTS_DIR, `${r.system}.json`), JSON.stringify(r, null, 2) + '\n');

  const keys = Object.keys(reports[0].metrics) as (keyof (typeof reports)[0]['metrics'])[];
  const w = Math.max(...keys.map((k) => k.length));
  console.log(`${'metric'.padEnd(w)}  ${reports.map((r) => r.system.padStart(15)).join('  ')}`);
  for (const k of keys) console.log(`${k.padEnd(w)}  ${reports.map((r) => String(r.metrics[k] ?? '–').padStart(15)).join('  ')}`);
  console.log(`${'calls (api errors)'.padEnd(w)}  ${reports.map((r) => `${r.calls} (${r.apiErrors})`.padStart(15)).join('  ')}`);
}
