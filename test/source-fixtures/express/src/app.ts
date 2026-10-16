import express from 'express';
import { requireAuth } from './auth';
import users from './users';

const app = express();

app.get('/', (req, res) => res.render('home', { ua: req.headers['user-agent'] }));
app.use('/users', requireAuth, users);
app.post('/contact', (req, res) => res.redirect('/thanks'));
app.route('/items/:id').get((req, res) => res.json({})).delete((req, res) => res.status(204).end());

export default app;
