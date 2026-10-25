import express from 'express';
import session from 'express-session';
import passport from 'passport';
import { Strategy } from 'passport-local';
import { ensureLoggedIn } from 'connect-ensure-login';
import { UserService } from './users';

// As a custom Next.js server: the routes are set up inside the callback that runs once the framework is ready.
export async function start(ready: Promise<void>) {
	await ready;
	const userService = new UserService();
	const app = express();
	passport.use(
		new Strategy(async (username, password, done) => {
			const user = await userService.getUser(username);
			if (!user) return done(null, false, { message: 'Incorrect username.' });
			return done(null, user);
		}),
	);
	app.use(session({ secret: 'secret', resave: false, saveUninitialized: false }));
	app.use(passport.initialize());
	app.use(passport.session());
	app.post('/login', passport.authenticate('local', { failureRedirect: '/login?how=unsuccessful', successReturnToOrRedirect: '/' }));
	app.get('/logout', (req, res) => {
		req.logout();
		res.redirect('/');
	});
	app.get('/account', ensureLoggedIn('/login'), (req, res) => res.render('account'));
	app.get('/', (req, res) => res.render('home'));
	return app;
}
