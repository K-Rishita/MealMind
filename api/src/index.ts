import { serve } from '@hono/node-server';
import { createApp } from './app.js';

const port = Number(process.env.PORT) || 8080; // Cloud Run provides PORT
const app = createApp({ staticDir: process.env.STATIC_DIR });

serve({ fetch: app.fetch, port }, () => {
  console.log(`MealMind API listening on :${port}`);
});
