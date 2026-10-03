-- Explicit table privileges.
-- Some Supabase projects grant the API roles access to every new table by default and
-- some don't, so relying on defaults works locally and fails in the cloud
-- ("permission denied for table ..."). Start from nothing and grant exactly what the
-- app uses. Row level security still decides which rows each user can touch.

revoke all on public.recipes, public.profiles, public.pantry_items, public.shopping_list_items,
  public.meal_plans, public.meal_plan_entries from anon, authenticated;

grant usage on schema public to anon, authenticated;

-- Shared, read-only reference data (signed-in users only; anon gets nothing).
grant select on public.recipes to authenticated;

-- Profiles are created by the sign-up trigger; users only read and edit their own.
grant select, update on public.profiles to authenticated;

-- Everything else is per-user data the app reads and writes.
grant select, insert, update, delete on public.pantry_items, public.shopping_list_items,
  public.meal_plans, public.meal_plan_entries to authenticated;
