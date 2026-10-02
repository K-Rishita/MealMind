/**
 * Runs a planner system over the eval set and stores every raw response.
 * Usage: npx tsx eval/run.ts <system> [--runs 3] [--concurrency 2] [--limit N]
 *
 * Results go to eval/results/<system>/<caseId>.r<run>.json. Existing files are
 * skipped, so an interrupted run resumes where it stopped. Scoring is separate
 * (eval/report.ts), so outputs can be re-scored without new API calls.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GoogleGenAI } from '@google/genai';
import { loadRecipes } from '../src/planner/recipes.js';
import type { EvalCase } from './cases.js';
import { RECIPES_PATH, RESULTS_DIR } from './paths.js';
import { buildBaselinePrompt, type BaselineName } from './systems/baseline.js';

export const MODEL = 'gemini-2.5-flash'; // same model the app uses, kept fixed for before/after

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
};

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : fallback;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Seconds to wait from a 429 error's RetryInfo, if present. */
function retryDelaySeconds(err: unknown): number | null {
  const m = String((err as Error)?.message ?? err).match(/"retryDelay":\s*"(\d+(?:\.\d+)?)s"/);
  return m ? Number(m[1]) : null;
}

async function main() {
  const system = process.argv[2] as BaselineName;
  if (system !== 'baseline-app' && system !== 'baseline-fixed') {
    throw new Error('Usage: npx tsx eval/run.ts <baseline-app|baseline-fixed> [--runs 3] [--concurrency 2] [--limit N]');
  }
  process.loadEnvFile(new URL('../.env', import.meta.url));
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY missing from api/.env');

  const runs = arg('runs', 3);
  const concurrency = arg('concurrency', 2);
  const limit = arg('limit', Infinity);
  const ai = new GoogleGenAI({ apiKey });
  const recipes = loadRecipes(RECIPES_PATH);
  const cases: EvalCase[] = JSON.parse(readFileSync(new URL('./cases.json', import.meta.url), 'utf8')).slice(0, limit);

  const outDir = join(RESULTS_DIR, system);
  mkdirSync(outDir, { recursive: true });

  const jobs = cases.flatMap((c) => Array.from({ length: runs }, (_, i) => ({ c, run: i + 1 })))
    .filter(({ c, run }) => !existsSync(join(outDir, `${c.id}.r${run}.json`)));
  console.log(`${system}: ${jobs.length} calls to make (${cases.length} cases × ${runs} runs, rest cached)`);

  let done = 0;
  let failed = 0;
  async function worker() {
    while (jobs.length) {
      const { c, run } = jobs.shift()!;
      const prompt = buildBaselinePrompt(system, recipes, c.request);
      const record: RunRecord = { system, caseId: c.id, run, model: MODEL, startedAt: new Date().toISOString(), latencyMs: 0, text: null, error: null };

      for (let attempt = 1; ; attempt++) {
        const t0 = performance.now();
        try {
          const res = await ai.models.generateContent({ model: MODEL, contents: prompt });
          record.latencyMs = Math.round(performance.now() - t0);
          record.text = res.text ?? '';
          record.usage = res.usageMetadata;
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
