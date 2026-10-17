// Seeds a RealWorld API through its own endpoints: `node deploy/realworld/seed.ts http://127.0.0.1:4100`.
const api = `${(process.argv[2] ?? 'http://127.0.0.1:4100').replace(/\/$/, '')}/api`;

export const DEMO_USERS = [
	{ username: 'demo', email: 'demo@conduit.test', password: 'demo-password-1', bio: 'I read Conduit so you do not have to.' },
	{ username: 'ada', email: 'ada@conduit.test', password: 'ada-password-1', bio: 'Engines, notes and analytical asides.' },
	{ username: 'grace', email: 'grace@conduit.test', password: 'grace-password-1', bio: 'Compilers, bugs and nanoseconds.' },
	{ username: 'linus', email: 'linus@conduit.test', password: 'linus-password-1', bio: '' },
];

const topics = [
	['How to train your dragon', 'Ever wonder how?', ['dragons', 'training']],
	['Writing a compiler in a weekend', 'Lexers, parsers and too much coffee', ['compilers', 'programming']],
	['The analytical engine, revisited', 'What Babbage got right', ['history', 'programming']],
	['Debugging with a moth', 'A short history of the first bug', ['history', 'debugging']],
	['Why I still use plain CSS', 'Cascades are a feature', ['css', 'web']],
	['Signals, explained slowly', 'State that knows who reads it', ['web', 'javascript']],
	['Ten tips for code review', 'Be kind, be specific', ['programming', 'teams']],
	['A field guide to dragons', 'Wings, scales and fire', ['dragons']],
	['Keyboards I have loved', 'Clicky, tactile, linear', ['hardware']],
	['Shipping on a Friday', 'Calculated risk or folly?', ['teams', 'devops']],
	['Markdown is enough', 'Most docs need nothing more', ['writing', 'web']],
	['The art of the commit message', 'Write for the next reader', ['git', 'writing']],
	['Testing in production', 'Observability first', ['devops', 'debugging']],
	['Learning Rust as a JavaScript developer', 'The borrow checker is your friend', ['rust', 'javascript']],
	['Why accessibility matters', 'Everyone gets to use the web', ['web', 'a11y']],
	['On naming things', 'The second hard problem', ['programming', 'writing']],
	['Dragons in the machine', 'When legacy code breathes fire', ['dragons', 'legacy']],
	['A tour of HTTP caching', 'Cache-Control, ETag and friends', ['web', 'devops']],
	['Pair programming, remotely', 'Two people, one cursor', ['teams']],
	['Small functions, big programs', 'Composition over cleverness', ['programming', 'javascript']],
	['Fonts on the web', 'Loading, swapping and subsetting', ['css', 'web']],
	['The quiet joy of refactoring', 'Leave the campsite cleaner', ['legacy', 'programming']],
	['Notes from a hackathon', 'Forty-eight hours, one demo', ['teams', 'hardware']],
] as const;

async function call<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
	const response = await fetch(`${api}${path}`, {
		method,
		headers: { 'content-type': 'application/json', ...(token ? { authorization: `Token ${token}` } : {}) },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`);
	return (await response.json()) as T;
}

const tokens: Record<string, string> = {};
for (const user of DEMO_USERS) {
	const { user: created } = await call<{ user: { token: string } }>('POST', '/users', { user: { username: user.username, email: user.email, password: user.password } });
	tokens[user.username] = created.token;
	if (user.bio) await call('PUT', '/user', { user: { bio: user.bio } }, created.token);
}

const authors = ['ada', 'grace', 'linus', 'ada', 'demo'];
const slugs: string[] = [];
for (const [index, [title, description, tags]] of topics.entries()) {
	const author = authors[index % authors.length]!;
	const body = `## ${title}\n\n${description}. This is article ${index + 1} of the seeded Conduit demo.\n\n- one point\n- another point\n\n\`\`\`js\nconsole.log(${JSON.stringify(title)});\n\`\`\`\n\nThanks for reading, **${author}**.`;
	const { article } = await call<{ article: { slug: string } }>('POST', '/articles', { article: { title, description, body, tagList: [...tags] } }, tokens[author]);
	slugs.push(article.slug);
}

const comments = ['Great read, thanks!', 'I disagree with the second point.', 'Bookmarked for later.'];
for (const [index, slug] of slugs.slice(-6).entries()) {
	for (const [n, who] of ['grace', 'demo', 'linus'].slice(0, (index % 3) + 1).entries()) {
		await call('POST', `/articles/${slug}/comments`, { comment: { body: comments[n] } }, tokens[who]);
	}
}

for (const [index, slug] of slugs.entries()) {
	if (index % 2 === 0) await call('POST', `/articles/${slug}/favorite`, undefined, tokens.demo);
	if (index % 3 === 0) await call('POST', `/articles/${slug}/favorite`, undefined, tokens.grace);
}
await call('POST', '/profiles/ada/follow', undefined, tokens.demo);
await call('POST', '/profiles/grace/follow', undefined, tokens.ada);

process.stdout.write(`seeded ${DEMO_USERS.length} users, ${slugs.length} articles at ${api}\n`);
