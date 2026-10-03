/**
 * Measures meal-plan latency against a deployed MealMind, as a real signed-in user.
 * Run: npx tsx scripts/bench-live.ts https://your-app.run.app [requests=20]
 *
 * Asks for your email and password (the password is not shown or stored), signs in
 * with Supabase, then sends sequential POST /api/meal-plan requests and prints p50/p95.
 * Each request is a real AI call and counts toward the per-user hourly limit (default 30).
 */
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';

const base = (process.argv[2] ?? '').replace(/\/$/, '');
const count = Number(process.argv[3] ?? 20);
if (!base.startsWith('https://')) {
  console.error('Usage: npx tsx scripts/bench-live.ts https://your-app.run.app [requests=20]');
  process.exit(1);
}

function ask(question: string, hidden = false): Promise<string> {
  let muted = false;
  const output = new Writable({
    write(chunk, _enc, cb) {
      if (!muted) process.stdout.write(chunk);
      cb();
    },
  });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer.trim());
    });
    muted = hidden;
  });
}

const percentile = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
};

async function main() {
  // The deployed app publishes its public Supabase URL and key at /config.js.
  const configJs = await (await fetch(`${base}/config.js`)).text();
  const match = configJs.match(/__MEALMIND_CONFIG__ = (\{.*\});/);
  if (!match) throw new Error(`No runtime config at ${base}/config.js`);
  const { supabaseUrl, supabaseAnonKey } = JSON.parse(match[1]) as { supabaseUrl: string; supabaseAnonKey: string };

  const email = await ask('Email: ');
  const password = await ask('Password (hidden): ', true);
  const auth = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: supabaseAnonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const session = (await auth.json()) as { access_token?: string; error_description?: string; msg?: string };
  if (!session.access_token) throw new Error(`Sign-in failed: ${session.error_description ?? session.msg ?? auth.status}`);

  const filters = { cost: 'all', time: 'all', skill: 'all' };
  const times: number[] = [];
  const sources: Record<string, number> = {};
  console.log(`\nSending ${count} meal-plan requests to ${base} ...`);

  for (let i = 1; i <= count; i++) {
    const t0 = performance.now();
    const res = await fetch(`${base}/api/meal-plan`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(filters),
    });
    const ms = Math.round(performance.now() - t0);
    const body = (await res.json().catch(() => ({}))) as { status?: string; source?: string; error?: string };
    if (!res.ok) {
      console.log(`  #${i}: HTTP ${res.status} ${body.error ?? ''} (stopping)`);
      break;
    }
    times.push(ms);
    const key = body.status === 'ok' ? body.source ?? 'ok' : body.status ?? 'unknown';
    sources[key] = (sources[key] ?? 0) + 1;
    console.log(`  #${i}: ${ms} ms (${key})`);
  }

  if (!times.length) return;
  console.log(`\n${times.length} requests: p50 ${percentile(times, 50)} ms, p95 ${percentile(times, 95)} ms, max ${Math.max(...times)} ms`);
  console.log('Plan sources:', sources, '(model = AI first try, model-retry = after one retry, fallback = rules)');
  console.log('Note: the first request after idle includes Cloud Run cold start.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
