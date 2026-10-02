import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';

/**
 * Builds the HTTP app. API routes live under /api; everything else is the
 * built React frontend, with unknown paths falling back to index.html.
 */
export function createApp({ staticDir }: { staticDir?: string } = {}) {
  const app = new Hono();

  app.get('/api/health', (c) => c.json({ status: 'ok' }));

  app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404));

  if (staticDir) {
    app.use('/*', serveStatic({ root: staticDir }));
    app.get('*', serveStatic({ root: staticDir, path: 'index.html' }));
  }

  return app;
}
