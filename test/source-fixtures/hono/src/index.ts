import { Hono } from 'hono';
import { jwt } from 'hono/jwt';

const app = new Hono();
const api = new Hono();

app.use('/api/*', jwt({ secret: 'x' }));
api.get('/me', (c) => c.json({}));
api.put('/me', (c) => c.json({}));
app.route('/api', api);
app.get('/', (c) => c.html('<h1>Hi</h1>'));

export default app;
