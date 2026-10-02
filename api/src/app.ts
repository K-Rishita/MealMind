import { Hono, type Context } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import type { PlanRequest } from './planner/filters.js';
import { generatePlan } from './planner/grounded.js';
import type { JsonModel, TextModel } from './planner/llm.js';
import { buildRecipePrompt } from './recipeGenerator.js';
import type { Services, UserContext } from './services.js';

export type AppOptions = {
  staticDir?: string;
  services?: Services;
  planModel?: JsonModel; // undefined = rules-only planning (no AI calls)
  textModel?: TextModel; // undefined = Recipe Generator disabled
  aiRequestsPerHour?: number;
  /** Public browser config served as /config.js, so one image works in any environment. */
  publicConfig?: { supabaseUrl: string; supabaseAnonKey: string };
};

const COSTS = ['all', 'low', 'medium', 'high'];
const TIMES = ['all', 'quick', 'medium', 'long'];
const SKILLS = ['all', 'beginner', 'intermediate', 'advanced'];
const MAX_NOTES = 500;

/** A model that always fails, so the planner returns its deterministic plan. */
const RULES_ONLY: JsonModel = {
  name: 'rules-only',
  generateJson: async () => {
    throw new Error('AI planning disabled (PLANNER_MODE=rules)');
  },
};

/** Fixed-window limiter per user, kept in memory (one instance is enough here). */
function rateLimiter(perHour: number) {
  const windows = new Map<string, { start: number; count: number }>();
  return (userId: string) => {
    const now = Date.now();
    const w = windows.get(userId);
    if (!w || now - w.start > 3_600_000) {
      windows.set(userId, { start: now, count: 1 });
      return true;
    }
    w.count++;
    return w.count <= perHour;
  };
}

function pick(value: unknown, allowed: string[], fallback = 'all'): string | null {
  if (value === undefined) return fallback;
  return typeof value === 'string' && allowed.includes(value) ? value : null;
}

/**
 * Builds the HTTP app. API routes live under /api; everything else is the
 * built React frontend, with unknown paths falling back to index.html.
 */
export function createApp({ staticDir, services, planModel, textModel, aiRequestsPerHour = 30, publicConfig }: AppOptions = {}) {
  const app = new Hono<{ Variables: { user: UserContext; token: string } }>();
  const allow = rateLimiter(aiRequestsPerHour);

  app.get('/api/health', (c) => c.json({ status: 'ok' }));

  // Only public values (the anon key is designed to be exposed; RLS protects the data).
  app.get('/config.js', (c) => {
    c.header('Content-Type', 'application/javascript; charset=utf-8');
    c.header('Cache-Control', 'no-store');
    return c.body(publicConfig ? `window.__MEALMIND_CONFIG__ = ${JSON.stringify(publicConfig)};\n` : '// no runtime config\n');
  });

  const requireUser = async (c: Context, next: () => Promise<void>) => {
    if (!services) return c.json({ error: 'Server is missing Supabase configuration' }, 503);
    const token = c.req.header('Authorization')?.replace(/^Bearer\s+/i, '');
    const user = token ? await services.authenticate(token) : null;
    if (!user || !token) return c.json({ error: 'Sign in required' }, 401);
    if (!allow(user.userId)) return c.json({ error: 'Too many requests. Try again later.' }, 429);
    c.set('user', user);
    c.set('token', token);
    await next();
  };

  app.post('/api/meal-plan', requireUser, async (c) => {
    const body = await c.req.json().catch(() => null);
    const cost = pick(body?.cost, COSTS);
    const time = pick(body?.time, TIMES);
    const skill = pick(body?.skill, SKILLS);
    if (!body || !cost || !time || !skill) return c.json({ error: 'cost, time and skill must be valid options' }, 400);

    const user = c.get('user');
    const token = c.get('token');
    const request = { cost, time, skill, diet: user.diet, pantry: user.pantry } as PlanRequest;
    const recipes = await services!.recipes(token);
    const model = planModel ?? RULES_ONLY;
    const result = await generatePlan(recipes, request, model);

    if (result.status === 'insufficient') {
      return c.json({ status: 'insufficient', missingSlots: result.missingSlots, suggestions: result.suggestions, diet: user.diet });
    }

    const { pantry: _pantry, ...savedRequest } = request; // don't duplicate the pantry into every plan row
    const planId = await services!.savePlan(token, savedRequest as PlanRequest, result, model.name);
    const byId = new Map(recipes.map((r) => [r.id, r]));
    const meal = (id?: string) => (id ? { id, name: byId.get(id)!.name, minutes: byId.get(id)!.minutes } : null);
    return c.json({
      status: 'ok',
      planId,
      source: result.source,
      limitedSlots: result.limitedSlots,
      suggestions: result.suggestions,
      diet: user.diet,
      days: result.days.map((d) => ({
        day: d.day,
        breakfast: meal(d.breakfast),
        lunch: meal(d.lunch),
        dinner: meal(d.dinner),
        snack: meal(d.snack),
      })),
    });
  });

  app.post('/api/generate-recipe', requireUser, async (c) => {
    if (!textModel) return c.json({ error: 'The AI recipe generator is turned off on this server' }, 503);
    const body = await c.req.json().catch(() => null);
    const cost = pick(body?.cost, COSTS);
    const time = pick(body?.time, TIMES);
    const skill = pick(body?.skill, SKILLS);
    const notes = body?.notes ?? '';
    if (!body || !cost || !time || !skill || typeof notes !== 'string' || notes.length > MAX_NOTES) {
      return c.json({ error: `cost, time and skill must be valid options and notes at most ${MAX_NOTES} characters` }, 400);
    }
    try {
      const recipe = await textModel.generateText(buildRecipePrompt(c.get('user'), { cost, time, skill, notes }));
      return c.json({ recipe });
    } catch (err) {
      console.error('generate-recipe failed:', err);
      return c.json({ error: 'The AI chef is unavailable right now. Please try again.' }, 502);
    }
  });

  app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404));

  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: 'Internal server error' }, 500);
  });

  if (staticDir) {
    app.use('/*', serveStatic({ root: staticDir }));
    app.get('*', serveStatic({ root: staticDir, path: 'index.html' }));
  }

  return app;
}
