import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { DEFAULT_MODEL_CHAIN, modelChain, modelFromSpec, type Model } from './planner/llm.js';
import { supabaseServices } from './services.js';

try {
  process.loadEnvFile(new URL('../.env', import.meta.url)); // local development; Cloud Run sets real env vars
} catch {
  // no .env file: rely on the environment
}

const port = Number(process.env.PORT) || 8080; // Cloud Run provides PORT
const { SUPABASE_URL, SUPABASE_ANON_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY } = process.env;

// LLM_MODELS: comma-separated specs tried in order, e.g.
//   openrouter:google/gemma-4-31b-it:free,google:gemini-2.5-flash
// Models whose provider key is missing are skipped. PLANNER_MODE=rules disables AI entirely.
const specs = process.env.LLM_MODELS ? process.env.LLM_MODELS.split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT_MODEL_CHAIN;
const models = specs
  .map((spec) => modelFromSpec(spec, { google: GEMINI_API_KEY, openrouter: OPENROUTER_API_KEY }))
  .filter((m): m is Model => m !== null);
const model = process.env.PLANNER_MODE !== 'rules' && models.length ? modelChain(models) : undefined;

const app = createApp({
  staticDir: process.env.STATIC_DIR,
  services: SUPABASE_URL && SUPABASE_ANON_KEY ? supabaseServices(SUPABASE_URL, SUPABASE_ANON_KEY) : undefined,
  planModel: model,
  textModel: model,
  aiRequestsPerHour: Number(process.env.AI_REQUESTS_PER_HOUR) || undefined, // default 30 per user
  publicConfig: SUPABASE_URL && SUPABASE_ANON_KEY ? { supabaseUrl: SUPABASE_URL, supabaseAnonKey: SUPABASE_ANON_KEY } : undefined,
});

serve({ fetch: app.fetch, port }, () => {
  const mode = model ? `models: ${models.map((m) => m.name).join(' > ')}` : 'rules only';
  console.log(`MealMind API listening on :${port} (${mode})`);
});
