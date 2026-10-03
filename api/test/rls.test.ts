/**
 * Row level security tests against a running Supabase (local or CI).
 * Requires SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY.
 * Run: npm run test:rls
 *
 * Two throwaway users are created with the service role; every check then runs
 * as a normal signed-in user, exactly like the browser would.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const url = process.env.SUPABASE_URL!;
const anonKey = process.env.SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !anonKey || !serviceKey) throw new Error('Set SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY');

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const password = 'rls-test-password-1';
const userIds: string[] = [];

async function signedInClient(label: string): Promise<{ client: SupabaseClient; id: string }> {
  const email = `rls-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: label } });
  if (error) throw error;
  userIds.push(data.user.id);
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  return { client, id: data.user.id };
}

let alice: { client: SupabaseClient; id: string };
let bob: { client: SupabaseClient; id: string };
const anon = createClient(url, anonKey, { auth: { persistSession: false } });

beforeAll(async () => {
  alice = await signedInClient('alice');
  bob = await signedInClient('bob');
});

afterAll(async () => {
  for (const id of userIds) await admin.auth.admin.deleteUser(id); // cascades to all their rows
});

describe('recipes', () => {
  it('are readable by signed-in users', async () => {
    const { count, error } = await alice.client.from('recipes').select('*', { count: 'exact', head: true });
    expect(error).toBeNull();
    expect(count).toBe(124);
  });

  it('are not readable anonymously', async () => {
    // Either an empty result (RLS) or a privilege error (no grant) is fine; no rows may leak.
    const { data, error } = await anon.from('recipes').select('id').limit(1);
    expect(error !== null || (data ?? []).length === 0).toBe(true);
    expect(data ?? []).toEqual([]);
  });

  it('cannot be modified by users', async () => {
    const insert = await alice.client.from('recipes').insert({ id: 'x', name: 'x', cost: 'low', skill: 'beginner', minutes: 1 });
    expect(insert.error).not.toBeNull();
    const update = await alice.client.from('recipes').update({ name: 'Hacked' }).eq('id', 'dal-tadka-yellow-lentil-curry').select();
    expect(update.data ?? []).toEqual([]);
  });
});

describe('profiles', () => {
  it('are created on sign-up with the display name', async () => {
    const { data } = await alice.client.from('profiles').select('id, display_name').single();
    expect(data).toEqual({ id: alice.id, display_name: 'alice' });
  });

  it("are invisible and unchangeable to other users", async () => {
    const read = await bob.client.from('profiles').select('id').eq('id', alice.id);
    expect(read.data).toEqual([]);
    const update = await bob.client.from('profiles').update({ diet: 'vegan' }).eq('id', alice.id).select();
    expect(update.data ?? []).toEqual([]);
  });
});

describe.each(['pantry_items', 'shopping_list_items'] as const)('%s', (table) => {
  let aliceItemId: string;

  beforeAll(async () => {
    const { data, error } = await alice.client.from(table).insert({ name: 'Rice', quantity: 2, unit: 'cups' }).select('id, user_id').single();
    expect(error).toBeNull();
    expect(data!.user_id).toBe(alice.id); // user_id defaults to the signed-in user
    aliceItemId = data!.id;
  });

  it('are visible to their owner only', async () => {
    expect((await alice.client.from(table).select('id').eq('id', aliceItemId)).data).toHaveLength(1);
    expect((await bob.client.from(table).select('id').eq('id', aliceItemId)).data).toEqual([]);
  });

  it("cannot be changed or deleted by another user", async () => {
    const update = await bob.client.from(table).update({ name: 'Stolen' }).eq('id', aliceItemId).select();
    expect(update.data ?? []).toEqual([]);
    const del = await bob.client.from(table).delete().eq('id', aliceItemId).select();
    expect(del.data ?? []).toEqual([]);
    expect((await alice.client.from(table).select('name').eq('id', aliceItemId).single()).data!.name).toBe('Rice');
  });

  it("cannot be created on another user's behalf", async () => {
    const { error } = await bob.client.from(table).insert({ name: 'Spam', user_id: alice.id });
    expect(error).not.toBeNull();
  });
});

describe('meal plans', () => {
  let alicePlanId: string;

  beforeAll(async () => {
    const plan = await alice.client.from('meal_plans').insert({ request: { cost: 'all' } }).select('id').single();
    alicePlanId = plan.data!.id;
    const entry = await alice.client.from('meal_plan_entries').insert({ plan_id: alicePlanId, day: 'Monday', slot: 'dinner', recipe_id: 'dal-tadka-yellow-lentil-curry' });
    expect(entry.error).toBeNull();
  });

  it("hide other users' plans and entries", async () => {
    expect((await bob.client.from('meal_plans').select('id').eq('id', alicePlanId)).data).toEqual([]);
    expect((await bob.client.from('meal_plan_entries').select('id').eq('plan_id', alicePlanId)).data).toEqual([]);
  });

  it("reject entries added to another user's plan", async () => {
    const { error } = await bob.client.from('meal_plan_entries').insert({ plan_id: alicePlanId, day: 'Tuesday', slot: 'lunch', recipe_id: 'dal-tadka-yellow-lentil-curry' });
    expect(error).not.toBeNull();
  });

  it('reject entries that point at recipes which do not exist', async () => {
    const { error } = await alice.client.from('meal_plan_entries').insert({ plan_id: alicePlanId, day: 'Tuesday', slot: 'lunch', recipe_id: 'invented-recipe' });
    expect(error).not.toBeNull();
  });
});
