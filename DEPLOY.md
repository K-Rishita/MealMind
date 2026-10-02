# Deploying MealMind

MealMind runs as one container on Google Cloud Run (React frontend + Node API) with
Supabase for Postgres and auth. The image has no environment-specific values baked in:
the API serves the public Supabase URL and anon key to the browser at runtime (`/config.js`).

## 1. Supabase (once)

1. Create a project at supabase.com (pick a region near your Cloud Run region).
2. From the repo root, load the schema, security policies and recipes:
   ```bash
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   supabase db push --include-seed
   ```
3. Note the **Project URL** and **anon / publishable key** (Project Settings → API).
   Never use the `service_role` key in the app.

## 2. Google Cloud (once, all in the web console)

1. **Billing**: link a billing account; add a budget alert (Billing → Budgets & alerts).
2. **APIs & Services → Library**: enable Cloud Run Admin, Cloud Build, Artifact Registry, Secret Manager.
3. **Secret Manager → Create secret**: name `gemini-api-key`, value = your Gemini API key.
4. On that secret's **Permissions** tab, grant **Secret Manager Secret Accessor** to
   `PROJECT_NUMBER-compute@developer.gserviceaccount.com` (project number is on the console home page).

## 3. Cloud Run service

**Cloud Run → Deploy container → Service → Continuously deploy from a repository → Set up with Cloud Build**

| Setting | Value |
|---|---|
| Repository | `K-Rishita/MealMind`, branch `^main$` |
| Build type | Dockerfile, `/Dockerfile` |
| Service name / region | `mealmind` / `us-central1` |
| Authentication | Allow unauthenticated invocations |
| Container port | `8080` |
| Max instances | `2` (caps cost) |
| Env vars | `SUPABASE_URL`, `SUPABASE_ANON_KEY` |
| Secrets | `GEMINI_API_KEY` ← `gemini-api-key:latest`, and optionally `OPENROUTER_API_KEY` ← its own secret |

Every push to `main` then rebuilds and redeploys.

Optional env vars: `LLM_MODELS` (models to try in order, see `api/.env.example`),
`PLANNER_MODE=rules` (plan without calling any model),
`AI_REQUESTS_PER_HOUR` (per-user limit, default 30).

## 4. After the first deploy

- Supabase → Authentication → URL Configuration: set **Site URL** to the `https://…run.app` address.
- Check `https://…run.app/api/health` returns `{"status":"ok"}`.
