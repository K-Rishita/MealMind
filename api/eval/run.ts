/**
 * Runs a planner system over the eval set and stores every raw response.
 * Usage: npx tsx eval/run.ts <system> [--subset core|all] [--runs 1] [--concurrency 2] [--limit N]
 *
 * Results go to eval/results/<system>/<caseId>.r<run>.json. Existing files are
 * skipped, so an interrupted run resumes where it stopped. Scoring is separate
 * (eval/report.ts), so outputs can be re-scored without new API calls.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fallbackPlan, findCandidates, generatePlan } from '../src/planner/grounded.js';
import { modelFromSpec, type Model } from '../src/planner/llm.js';
import { loadRecipes } from '../src/planner/recipes.js';
import { selectCases, type EvalCase } from './cases.js';
import { MEAL_TYPES_PATH, RECIPES_PATH, RESULTS_DIR } from './paths.js';
import { buildBaselinePrompt, type BaselineName } from './systems/baseline.js';

// rules-only: the grounded pipeline with no model at all (always the deterministic plan). Makes no API calls.
export const SYSTEMS = ['baseline-app', 'baseline-fixed', 'grounded', 'rules-only'] as const;
export type SystemName = (typeof SYSTEMS)[number];

// One model per run, for every system, so differences come from the system design and not the model.
// The shipped app used gemini-2.5-flash.
export const DEFAULT_EVAL_MODEL = 'google:gemini-2.5-flash';

/** Folder name for a model spec, e.g. "openrouter:google/gemma-4-31b-it:free" -> "openrouter-google-gemma-4-31b-it-free". */
export const modelSlug = (spec: string) => spec.replace(/[^a-zA-Z0-9.]+/g, '-');
export const resultsDir = (spec: string, system: string) => join(RESULTS_DIR, system === 'rules-only' ? 'none' : modelSlug(spec), system);

export type RunRecord = {
  system: string;
  caseId: string;
  run: number;
  model: string;
  startedAt: string;
  latencyMs: number;
  text: string | null;
  error: string | null;
  usage?: unknown;
  modelCalls?: number; // grounded only: 0 for impossible requests, 2 when it retried
};

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : fallback;
}

function strArg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
}

/** Counts calls so an eval run reports how many requests the grounded planner made. */
function countingModel(inner: Model) {
  const wrapper = {
    calls: 0,
    name: inner.name,
    generateJson: (p: string, s: object) => (wrapper.calls++, inner.generateJson(p, s)),
    generateText: (p: string) => (wrapper.calls++, inner.generateText(p)),
  };
  return wrapper;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Seconds to wait from a 429 error's RetryInfo, if present. */
function retryDelaySeconds(err: unknown): number | null {
  const m = String((err as Error)?.message ?? err).match(/"retryDelay":\s*"(\d+(?:\.\d+)?)s"/);
  return m ? Number(m[1]) : null;
}

async function main() {
  const system = process.argv[2] as SystemName;
  if (!SYSTEMS.includes(system)) {
    throw new Error(`Usage: npx tsx eval/run.ts <${SYSTEMS.join('|')}> [--model provider:id] [--subset core|all] [--runs 1] [--concurrency 2] [--limit N]`);
  }
  if (system !== 'rules-only') process.loadEnvFile(new URL('../.env', import.meta.url));
  const modelSpec = strArg('model', DEFAULT_EVAL_MODEL);
  const model = system === 'rules-only' ? null : modelFromSpec(modelSpec, { google: process.env.GEMINI_API_KEY, openrouter: process.env.OPENROUTER_API_KEY });
  if (system !== 'rules-only' && !model) throw new Error(`No API key in api/.env for ${modelSpec}`);

  const runs = arg('runs', 1);
  const subset = strArg('subset', 'core') as 'core' | 'all';
  const concurrency = arg('concurrency', 2);
  const limit = arg('limit', Infinity);
  const recipes = loadRecipes(RECIPES_PATH, MEAL_TYPES_PATH);
  const allCases: EvalCase[] = JSON.parse(readFileSync(new URL('./cases.json', import.meta.url), 'utf8'));
  const cases = selectCases(allCases, subset).slice(0, limit);

  const outDir = resultsDir(modelSpec, system);
  mkdirSync(outDir, { recursive: true });

  const jobs = cases.flatMap((c) => Array.from({ length: runs }, (_, i) => ({ c, run: i + 1 })))
    .filter(({ c, run }) => !existsSync(join(outDir, `${c.id}.r${run}.json`)));
  console.log(`${system} [${system === 'rules-only' ? 'no model' : modelSpec}]: ${jobs.length} calls to make (${cases.length} cases × ${runs} runs, rest cached)`);

  let done = 0;
  let failed = 0;
  async function worker() {
    while (jobs.length) {
      const { c, run } = jobs.shift()!;
      const record: RunRecord = { system, caseId: c.id, run, model: system === 'rules-only' ? 'none' : modelSpec, startedAt: new Date().toISOString(), latencyMs: 0, text: null, error: null };

      for (let attempt = 1; ; attempt++) {
        const t0 = performance.now();
        try {
          if (system === 'rules-only') {
            const noModel = { name: 'none', generateJson: async () => { throw new Error('rules-only'); } };
            const result = await generatePlan(recipes, c.request, { ...noModel });
            const days = result.status === 'ok' ? fallbackPlan(findCandidates(recipes, c.request)) : undefined;
            record.text = JSON.stringify(result.status === 'ok' ? { ...result, days, attempts: [] } : result);
            record.modelCalls = 0;
          } else if (system === 'grounded') {
            // The planner handles its own retry and fallback; model errors become a fallback plan.
            const counted = countingModel(model!);
            const result = await generatePlan(recipes, c.request, counted);
            const quota = result.status === 'ok' && result.attempts.find((a) => a.errors.some((e) => /429|RESOURCE_EXHAUSTED/.test(e)));
            if (quota) throw new Error(quota.errors.join(' '));
            record.text = JSON.stringify(result);
            record.modelCalls = counted.calls;
          } else {
            record.text = await model!.generateText(buildBaselinePrompt(system, recipes, c.request));
          }
          record.latencyMs = Math.round(performance.now() - t0);
          record.error = null;
          break;
        } catch (err) {
          const msg = String((err as Error)?.message ?? err);
          const is429 = msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED');
          if (is429 && /PerDay/i.test(msg)) {
            console.error('\nDaily quota exhausted. Re-run later; finished calls are saved.');
            process.exit(2);
          }
          const transient = is429 || /\b(500|502|503|504)\b|UNAVAILABLE|fetch failed/i.test(msg);
          if (transient && attempt < 6) {
            const wait = (retryDelaySeconds(err) ?? 2 ** attempt) * 1000 + 500;
            await sleep(wait);
            continue;
          }
          record.latencyMs = Math.round(performance.now() - t0);
          record.error = msg.slice(0, 2000);
          failed++;
          break;
        }
      }
      if (record.error === null || !/\b(429|5\d\d)\b|UNAVAILABLE|fetch failed/i.test(record.error)) {
        // Only cache real outcomes; infrastructure failures are retried on the next run.
        writeFileSync(join(outDir, `${c.id}.r${run}.json`), JSON.stringify(record, null, 2));
      }
      done++;
      process.stdout.write(`\r${done} done, ${failed} errors`);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  console.log(`\nFinished ${system}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
