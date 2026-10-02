#!/usr/bin/env bash
# Runs the RLS tests against the local Supabase started with `supabase start`.
set -euo pipefail
eval "$(supabase status -o env | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=')"
SUPABASE_URL="$API_URL" SUPABASE_ANON_KEY="$ANON_KEY" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
  npx vitest run --config vitest.rls.config.ts
