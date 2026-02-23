import { Hono } from 'hono';
import { api } from './routes';

// Create the API server
const app = new Hono();
app.route('/', api);

// Start API server on port 8000
const port = 8000;
console.log(`API server listening on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
  maxRequestBodySize: 1024 * 1024 * 1024 * 5, // 5GB
};