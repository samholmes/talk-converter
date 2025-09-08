import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { api } from './routes';

// Create main app
const app = new Hono();

// Mount API routes
app.route('/', api);

// Serve static files from dist directory (Vite build output)
app.use('/*', serveStatic({ root: './dist' }));

// Fallback to index.html for client-side routing
app.get('/*', serveStatic({ path: './dist/index.html' }));

const port = Number(process.env.PORT || 3000);
console.log(`Production server listening on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};