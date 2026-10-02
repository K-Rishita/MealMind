-- MealMind initial schema.
-- Recipes are shared, read-only reference data. Everything else belongs to one
-- user and is protected by row level security so users only ever see their own rows.

-- ---------------------------------------------------------------------------
-- Recipes
-- ---------------------------------------------------------------------------
create table public.recipes (
  id          text primary key,                       -- slug of the name, stable across re-imports
  name        text not null unique,
  cost        text not null check (cost in ('low', 'medium', 'high')),
  skill       text not null check (skill in ('beginner', 'intermediate', 'advanced')),
  minutes     integer not null check (minutes > 0),
  diets       text[] not null default '{}'
              check (diets <@ array['vegetarian','vegan','pescatarian','keto','paleo','gluten-free','dairy-free']),
  meal_types  text[] not null default '{}'
              check (meal_types <@ array['breakfast','lunch','dinner','snack','dessert','side']),
  ingredients jsonb not null default '[]'::jsonb,     -- [{ "quantity": 1, "unit": "cup", "name": "Rice" }]
  steps       text[] not null default '{}',
  created_at  timestamptz not null default now()
);

create index recipes_filters_idx on public.recipes (cost, skill, minutes);
create index recipes_diets_idx on public.recipes using gin (diets);
create index recipes_meal_types_idx on public.recipes using gin (meal_types);

alter table public.recipes enable row level security;

-- Signed-in users can read recipes. There are no write policies, so only the
-- service role (used by the import script) can change them.
create policy "Recipes are readable by signed-in users"
  on public.recipes for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Profiles (one per auth user, created automatically on sign-up)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  age          integer check (age between 1 and 130),
  gender       text,
  height       text,
  weight       text,
  calorie_goal integer check (calorie_goal between 500 and 10000),
  diet         text check (diet in ('none','vegetarian','vegan','pescatarian','keto','paleo','gluten-free','dairy-free')),
  updated_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can read their own profile"
  on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'display_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Pantry and shopping list
-- ---------------------------------------------------------------------------
create table public.pantry_items (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (length(trim(name)) > 0),
  quantity   numeric check (quantity >= 0),
  unit       text,
  created_at timestamptz not null default now()
);

create table public.shopping_list_items (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (length(trim(name)) > 0),
  quantity   numeric check (quantity >= 0),
  unit       text,
  checked    boolean not null default false,
  created_at timestamptz not null default now()
);

create index pantry_items_user_idx on public.pantry_items (user_id);
create index shopping_list_items_user_idx on public.shopping_list_items (user_id);

alter table public.pantry_items enable row level security;
alter table public.shopping_list_items enable row level security;

create policy "Users manage their own pantry"
  on public.pantry_items for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users manage their own shopping list"
  on public.shopping_list_items for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Meal plans: each entry points at a real recipe
-- ---------------------------------------------------------------------------
create table public.meal_plans (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  request    jsonb not null,               -- the filters the plan was generated for
  model      text,                         -- LLM used, for traceability
  created_at timestamptz not null default now()
);

create table public.meal_plan_entries (
  id        uuid primary key default gen_random_uuid(),
  plan_id   uuid not null references public.meal_plans (id) on delete cascade,
  day       text not null check (day in ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday')),
  slot      text not null check (slot in ('breakfast','lunch','dinner','snack')),
  recipe_id text not null references public.recipes (id),
  unique (plan_id, day, slot)
);

create index meal_plans_user_idx on public.meal_plans (user_id, created_at desc);
create index meal_plan_entries_plan_idx on public.meal_plan_entries (plan_id);

alter table public.meal_plans enable row level security;
alter table public.meal_plan_entries enable row level security;

create policy "Users manage their own meal plans"
  on public.meal_plans for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "Users manage entries of their own meal plans"
  on public.meal_plan_entries for all to authenticated
  using (exists (select 1 from public.meal_plans p where p.id = plan_id and p.user_id = (select auth.uid())))
  with check (exists (select 1 from public.meal_plans p where p.id = plan_id and p.user_id = (select auth.uid())));
