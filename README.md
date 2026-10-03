# MealMind

**An AI meal planner that only plans with real recipes.** Tell it your budget, cooking time, skill level and diet; it builds a Monday–Friday plan from a recipe database, uses what's in your pantry, and updates the pantry when you cook.

**Live:** https://mealmind-203993474720.us-central1.run.app

> Started as a team project for an *AI for HCI* course ([original repo](https://github.com/TanviKandalla/MealMind)). This fork rebuilds the backend, the AI planner, testing and deployment.

## Why "grounded"?

The original planner pasted recipe names into a prompt and asked the model to "only use these". It didn't: a bug sent `undefined` instead of names, and even with the bug fixed the model invented recipes and ignored constraints. MealMind now treats the database as the source of truth and the model as a chooser:

1. **Candidates from the database.** For each meal slot, keep only recipes that meet every constraint (cost, time, skill, diet) *and* suit that meal. If a slot has none, say so and suggest which filter to relax, instead of inventing a recipe.
2. **Constrained generation.** The model picks from per-slot `enum`s of short codes (`B1`, `L4`, `D12`) in a JSON schema, so it cannot name anything outside the allowed set.
3. **Server-side validation.** Every plan is re-checked (days, allowed recipes, repeat limits, no same lunch and dinner). On failure the planner retries once with the errors, then falls back to a deterministic planner.

## Results

### Offline eval: 40-case core set, same model for both systems (`gemini-2.5-flash-lite`)

| Metric | Prompt-only | Grounded |
|---|---|---|
| Main meals that aren't real recipes | 29.3% | **0%** |
| Fully valid weekly plans (plannable cases) | 29.2% | **100%** |
| Meals that suit their slot (no curry at breakfast) | 63.7% | **100%** |
| Impossible requests correctly refused | 0% | **100%** |
| Prompt-injection cases fully valid | 0% | **100%** |
| Pantry items used | 53.5% | **77.2%** |

Model behaviour before the safety nets (grounded planner, plannable cases):

| Model | Valid first try | After one retry | Needed rule fallback |
|---|---|---|---|
| `gemini-2.5-flash-lite` | 20.8% | 62.5% | 37.5% |
| `gemini-2.5-flash` | **91.7%** | 95.8% | 4.2% |

The eval set (100 cases, 40-case core subset) is generated deterministically from every filter combination and covers broad, narrow, impossible, diet-specific and prompt-injection requests. Raw model responses are committed in [`api/eval/results`](api/eval/results), so every number can be re-scored. **Honest note:** a rules-only planner (no model) matched the AI on pantry use and variety; the AI's value is in judgment these metrics don't capture.

### Production (Cloud Run, `gemini-2.5-flash`, 20 sequential requests)

| | |
|---|---|
| Meal-plan latency | p50 **2.6 s**, p95 **4.9 s** |
| Valid on first try / after retry / fallback | 85% / 15% / 0% |
| API health check | p50 100 ms, p95 144 ms |

### Correctness

- Deterministic fallback produces a valid plan for **all 162** plannable filter combinations (of 512), tested exhaustively.
- **73 automated tests**: 51 API (82% line coverage; planner logic 98–100%), 14 row-level-security tests that sign in as two users and try to read or change each other's data (verified to fail when RLS is disabled), 8 frontend logic tests.

## Architecture

```
Browser (React + Vite + Tailwind)
   │  Supabase Auth session
   ├──────────────► Supabase Postgres  (row level security on every user table)
   │
   └─ /api ───────► Node API (Hono), one container on Google Cloud Run
                      ├─ reads the user's diet and pantry from Postgres (as that user)
                      ├─ grounded planner ──► model chain: gemini-2.5-flash → flash-lite → … → free models
                      │                        (25 s timeout per model, then rules-only fallback)
                      └─ serves the built frontend and /config.js (runtime config)
```

- **Security:** prompts are built on the server from stored data; user text (pantry names, notes) is fenced as data; per-user rate limit on AI endpoints; explicit Postgres grants plus RLS; no secrets in the image.
- **One image, any environment:** the browser gets the public Supabase URL and key from `/config.js` at runtime, so the same Docker image runs locally and on Cloud Run.

## Tech

TypeScript · React 18 · Vite · Tailwind · Node 22 · Hono · Supabase (Postgres, Auth, RLS) · Gemini via OpenRouter / Google AI · Vitest · Docker (multi-stage, non-root) · GitHub Actions · Google Cloud Run

## Run locally

Requires Node 22 (`nvm use`), Docker and the [Supabase CLI](https://supabase.com/docs/guides/cli).

```bash
supabase start                      # local Postgres + Auth in Docker, applies migrations and the recipe seed
cp frontend/.env.example frontend/.env   # fill from `supabase status`
cp api/.env.example api/.env             # add an OpenRouter or Gemini key, or set PLANNER_MODE=rules
(cd api && npm ci && npm run dev)        # API on :8080
(cd frontend && npm ci && npm run dev)   # app on :3000 (proxies /api)
```

Tests:

```bash
(cd api && npm test && npm run test:rls)   # unit tests, then RLS tests against local Supabase
(cd frontend && npm test)
```

Evals (makes model calls):

```bash
cd api
npx tsx eval/run.ts grounded --model openrouter:google/gemini-2.5-flash
npx tsx eval/report.ts baseline-fixed grounded --model openrouter:google/gemini-2.5-flash
```

## CI/CD

GitHub Actions runs on every pull request: typecheck, tests and build for frontend and API, RLS tests against a throwaway Supabase, and a Docker build. Merging to `main` triggers a Cloud Build deploy to Cloud Run. See [DEPLOY.md](DEPLOY.md).

## Known limits

- Only 15 of 124 recipes suit breakfast, so 162 of 512 filter combinations can produce a full week; the app explains why and suggests a fix for the rest.
- Frontend tests cover the pantry/cooking logic, not the React pages.
