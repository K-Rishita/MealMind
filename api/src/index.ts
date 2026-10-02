import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { geminiModel, geminiTextModel } from './planner/llm.js';
import { supabaseServices } from './services.js';

try {
  process.loadEnvFile(new URL('../.env', import.meta.url)); // local development; Cloud Run sets real env vars
} catch {
  // no .env file: rely on the environment
}

const port = Number(process.env.PORT) || 8080; // Cloud Run provides PORT
const { SUPABASE_URL, SUPABASE_ANON_KEY, GEMINI_API_KEY } = process.env;
// PLANNER_MODE=rules plans without calling the model (useful offline or to save quota).
const useModel = Boolean(GEMINI_API_KEY) && process.env.PLANNER_MODE !== 'rules';

const app = createApp({
  staticDir: process.env.STATIC_DIR,
  services: SUPABASE_URL && SUPABASE_ANON_KEY ? supabaseServices(SUPABASE_URL, SUPABASE_ANON_KEY) : undefined,
  planModel: useModel ? geminiModel(GEMINI_API_KEY!) : undefined,
  textModel: useModel ? geminiTextModel(GEMINI_API_KEY!) : undefined,
  aiRequestsPerHour: Number(process.env.AI_REQUESTS_PER_HOUR) || undefined, // default 30 per user
});

serve({ fetch: app.fetch, port }, () => {
  console.log(`MealMind API listening on :${port} (planner: ${useModel ? 'model' : 'rules only'})`);
});
