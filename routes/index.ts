import { Hono } from 'hono';
import mediaRoutes from './media';
import listRoutes from './list';
import processRoutes from './process';
import talksRoutes from './talks';
import streamsRoutes from './streams';
import activitiesRoutes from './activities';

// Create API app
export const api = new Hono();

// Mount all routes
api.route('/', mediaRoutes);
api.route('/', listRoutes);
api.route('/', processRoutes);
api.route('/', talksRoutes);
api.route('/', streamsRoutes);
api.route('/', activitiesRoutes);

export default api;
