import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';

describe('api', () => {
  const app = createApp();

  it('reports health', async () => {
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('returns JSON 404 for unknown API routes', async () => {
    const res = await app.request('/api/nope');
    expect(res.status).toBe(404);
  });
});
