/**
 * Scores stored eval results and writes a summary.
 * Usage: npx tsx eval/report.ts <system> [<system> ...]
 * Writes eval/reports/<system>.json and prints a comparison table.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadRecipes } from '../src/planner/recipes.js';
import { makeResolver, MAIN_SLOTS, scorePlan, type PlanDay, type PlanScore } from '../src/planner/score.js';
import type { EvalCase } from './cases.js';
import { RECIPES_PATH, REPORTS_DIR, RESULTS_DIR } from './paths.js';
import type { RunRecord } from './run.js';
import { parseBaselineOutput } from './systems/baseline.js';

/** Output of any system, parsed. `insufficient` = the system said the request can't be met. */
type Parsed = { plan: PlanDay[] | null; insufficient: boolean };

function parseOutput(record: RunRecord): Parsed {
  if (record.text == null) return { plan: null, insufficient: false };
  return { plan: parseBaselineOutput(record.text), insufficient: false };
}

const pct = (n: number, d: number) => (d === 0 ? null : Math.round((1000 * n) / d) / 10);
const percentile = (xs: number[], p: number) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
};

export function summarize(system: string) {
  const recipes = loadRecipes(RECIPES_PATH);
  const resolve = makeResolver(recipes);
  const cases: EvalCase[] = JSON.parse(readFileSync(new URL('./cases.json', import.meta.url), 'utf8'));
  const caseById = new Map(cases.map((c) => [c.id, c]));
  const dir = join(RESULTS_DIR, system);
  if (!existsSync(dir)) throw new Error(`No results for ${system}`);

  const records: RunRecord[] = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));

  let calls = 0, apiErrors = 0, parsed = 0, daysCorrect = 0;
  let mainEntries = 0, mainInDb = 0, mainCompliant = 0, snackEntries = 0, snackInDb = 0;
  let feasibleRuns = 0, feasiblePlansAllGood = 0;
  let infeasibleRuns = 0, infeasibleHandled = 0;
  let injectionRuns = 0, injectionPlansAllGood = 0;
  let repeatsOver2 = 0;
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
    const feasible = c.matchCount > 0;
    if (!feasible) {
      infeasibleRuns++;
      if (out.insufficient) infeasibleHandled++;
    } else feasibleRuns++;
    if (c.category === 'injection') injectionRuns++;
    if (!out.plan) continue;
    parsed++;

    const score: PlanScore = scorePlan(out.plan, c.request, resolve);
    if (score.daysCorrect) daysCorrect++;
    const main = score.entries.filter((e) => (MAIN_SLOTS as readonly string[]).includes(e.slot));
    const snack = score.entries.filter((e) => e.slot === 'snack');
    mainEntries += main.length;
    snackEntries += snack.length;
    snackInDb += snack.filter((e) => e.recipeId).length;
    for (const e of main) {
      if (!e.recipeId) continue;
      mainInDb++;
      if (e.violations.length === 0) mainCompliant++;
      for (const v of e.violations) violationCounts[v]++;
    }
    const counts = new Map<string, number>();
    for (const e of main) if (e.recipeId) counts.set(e.recipeId, (counts.get(e.recipeId) ?? 0) + 1);
    if ([...counts.values()].some((n) => n > 2)) repeatsOver2++;

    // A "good plan": Mon–Fri, all 15 main meals are real recipes that meet every constraint.
    const good = score.daysCorrect && main.length === 15 && main.every((e) => e.recipeId && e.violations.length === 0);
    if (good && feasible) { feasiblePlansAllGood++; perCase[c.id].goodPlans++; }
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
      validPlanRate: pct(parsed, calls - apiErrors),
      correctDaysRate: pct(daysCorrect, parsed),
      mainMealsNotInDatabase: pct(mainEntries - mainInDb, mainEntries),
      mainMealsViolatingConstraints: pct(mainInDbViolating, mainEntries),
      mainMealsGroundedAndCompliant: pct(mainCompliant, mainEntries),
      snacksInDatabase: pct(snackInDb, snackEntries),
      fullyValidPlanRate_feasibleCases: pct(feasiblePlansAllGood, feasibleRuns),
      impossibleRequestsHandled: pct(infeasibleHandled, infeasibleRuns),
      injectionCasesFullyValid: pct(injectionPlansAllGood, injectionRuns),
      plansWithRecipeRepeatedOver2x: pct(repeatsOver2, parsed),
      latencyP50Ms: percentile(latencies, 50),
      latencyP95Ms: percentile(latencies, 95),
    },
    violationsOfMainMeals: violationCounts,
    counts: { parsed, mainEntries, mainInDb, mainCompliant, feasibleRuns, infeasibleRuns, injectionRuns },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const systems = process.argv.slice(2);
  if (!systems.length) throw new Error('Usage: npx tsx eval/report.ts <system> [<system> ...]');
  mkdirSync(REPORTS_DIR, { recursive: true });
  const reports = systems.map(summarize);
  for (const r of reports) writeFileSync(join(REPORTS_DIR, `${r.system}.json`), JSON.stringify(r, null, 2) + '\n');

  const keys = Object.keys(reports[0].metrics) as (keyof (typeof reports)[0]['metrics'])[];
  const w = Math.max(...keys.map((k) => k.length));
  console.log(`${'metric'.padEnd(w)}  ${reports.map((r) => r.system.padStart(15)).join('  ')}`);
  for (const k of keys) console.log(`${k.padEnd(w)}  ${reports.map((r) => String(r.metrics[k] ?? '–').padStart(15)).join('  ')}`);
  console.log(`${'calls (api errors)'.padEnd(w)}  ${reports.map((r) => `${r.calls} (${r.apiErrors})`.padStart(15)).join('  ')}`);
}
