import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { commandLine, migratedReadme, writeMigratedReadme, type Manifest } from '../src/convert/readme.ts';

const FIXTURE = new URL('./readme-fixtures/next-invoices.md', import.meta.url);
const OLD: Manifest = { name: 'acme-invoices', dependencies: { next: '15.3.0', react: '19.1.0', 'react-dom': '19.1.0' }, scripts: { dev: 'next dev', build: 'next build', start: 'next start', lint: 'next lint', test: 'jest', storybook: 'storybook dev' } };
// The scripts `npm create markless` writes.
const NEW: Manifest = { name: 'acme-invoices', scripts: { dev: 'vp dev', build: 'vp build', preview: 'vp preview', check: 'vp check && markless-tsc', doctor: 'node scripts/markless-doctor.mjs', fmt: 'vp fmt', test: 'vp test' } };

test("a Next.js app's README keeps every line but the stack, the commands and the editor setup", async () => {
	const original = await readFile(FIXTURE, 'utf8');
	const out = migratedReadme({ original, oldManifest: OLD, newManifest: NEW, pluginConfigured: true });
	const kept = (line: string) => assert.ok(out.includes(line), `kept: ${line}`);

	assert.ok(out.includes('It is built with [Markless](https://markless.dev) (TSRX) and Tailwind CSS, and was bootstrapped with [`create-markless`](https://markless.dev/start/new-app).'));
	assert.ok(out.includes('## Tech stack\n\n- [Markless](https://markless.dev) (TSRX)\n- React Hook Form for the invoice editor\n- Tailwind CSS\n'), 'Next.js becomes Markless, React goes, React Hook Form stays');
	assert.ok(!out.includes('React 19'));
	assert.ok(out.includes('```bash\nnpm install\nnpx prisma migrate dev\nnpm run dev\n# or\nyarn dev\n# or\npnpm dev\n```'), 'scripts the new app has are left as written');
	assert.ok(out.includes('- `npm run preview` serves the production build.'), 'start becomes preview');
	assert.ok(out.includes('- `npm run check` runs ESLint.'), 'lint becomes check');
	kept('- `npm test` runs the unit tests with Jest.');
	kept('- `npm run storybook` opens the component library.');
	kept('![Dashboard screenshot](./docs/screenshot.png)');
	kept('| `AUTH_SECRET` | The secret Auth.js signs sessions with |');
	kept('## Deploy on Vercel\n\nPush to `main` and Vercel deploys it.');

	const editor = out.indexOf('## Editor setup');
	assert.ok(editor > out.indexOf('## Environment variables') && editor < out.indexOf('## Deploy on Vercel'), 'editor setup goes before the deploy notes');
	assert.ok(out.includes('[TSRX Syntax for VS Code](https://marketplace.visualstudio.com/items?itemName=TSRX.tsrx-vscode-plugin) (`TSRX.tsrx-vscode-plugin`)'));
	assert.ok(out.includes('[Open VSX](https://open-vsx.org/extension/TSRX/tsrx-vscode-plugin)'));
	assert.ok(!out.includes('"compilerOptions"'), 'no plugin steps when the app already loads it');

	const untouched = original.split('## Environment variables')[1]!.split('## Deploy on Vercel')[0]!;
	assert.ok(out.includes(untouched), 'a section with nothing to change is byte for byte the same');
	assert.ok(out.endsWith('## License\n\nMIT, see [LICENSE](./LICENSE).\n'));
});

test('the plugin steps appear only when the app does not load the plugin', () => {
	const out = migratedReadme({ original: '# App\n\nAn app.\n', newManifest: NEW, pluginConfigured: false });
	assert.ok(out.startsWith('# App\n\nAn app.\n\n## Editor setup\n'));
	assert.ok(out.includes('"plugins": [{ "name": "@markless/typescript-plugin" }]'));
});

test('an existing editor section is replaced, the rest kept', () => {
	const original = '# App\n\n## Editor setup\n\nInstall the ESLint extension.\n\n## License\n\nMIT\n';
	const out = migratedReadme({ original, newManifest: NEW, pluginConfigured: true });
	assert.ok(!out.includes('ESLint extension'));
	assert.ok(out.includes('## Editor setup\n\nInstall [TSRX Syntax for VS Code]'));
	assert.ok(out.endsWith('editor-setup).\n\n## License\n\nMIT\n'));
});

test('"an Angular app" reads "a Markless app"; names that only start with a framework stay', () => {
	const out = migratedReadme({ original: 'This is an Angular app.\n\nIt is built with React Aria.\n', oldManifest: { dependencies: { '@angular/core': '19' } }, newManifest: NEW, pluginConfigured: true });
	assert.ok(out.startsWith('This is a [Markless](https://markless.dev) (TSRX) app.\n\nIt is built with React Aria.\n'));
});

test('a command for a script the new app lacks is dropped from a shell block, with its "# or"', () => {
	const scripts = NEW.scripts!;
	assert.equal(commandLine('npm run dev -- --turbopack', scripts, OLD.scripts), 'npm run dev');
	assert.equal(commandLine('pnpm start', scripts, OLD.scripts), 'pnpm preview');
	assert.equal(commandLine('npx next build', scripts, OLD.scripts), 'npm run build');
	assert.equal(commandLine('npm run storybook', scripts, OLD.scripts), null);
	assert.equal(commandLine('pnpm prisma generate', scripts, OLD.scripts), 'pnpm prisma generate', 'a package binary is not a script');
	assert.equal(commandLine('yarn install', scripts, OLD.scripts), 'yarn install');
	const out = migratedReadme({ original: '# App\n\n```sh\nnpm run dev\n# or\nnpm run storybook\n```\n', oldManifest: OLD, newManifest: NEW, pluginConfigured: true });
	assert.ok(out.startsWith('# App\n\n```sh\nnpm run dev\n```\n'));
});

test('an app without a README gets one with the same sections', () => {
	const out = migratedReadme({ oldManifest: OLD, newManifest: NEW, pluginConfigured: true, packageManager: 'pnpm' });
	assert.ok(out.startsWith('# acme-invoices\n\nBuilt with [Markless](https://markless.dev) (TSRX).\n\n## Getting started\n\n```bash\npnpm install\npnpm dev\n```\n'));
	assert.ok(out.includes('- `pnpm build`: `vp build`'));
	assert.ok(out.includes('## Editor setup'));
});

test('convert writes the README once, and leaves it alone after someone edits it', async () => {
	const root = await mkdtemp(join(tmpdir(), 'migrate-readme-'));
	try {
		const [app, source, state] = ['app', 'old', '.migrate'].map((d) => join(root, d)) as [string, string, string];
		await mkdir(join(state, 'convert'), { recursive: true });
		await mkdir(source);
		await mkdir(app);
		await writeFile(join(source, 'README.md'), await readFile(FIXTURE, 'utf8'));
		await writeFile(join(source, 'package.json'), JSON.stringify(OLD));
		await writeFile(join(app, 'package.json'), JSON.stringify(NEW));
		await writeFile(join(app, 'tsconfig.json'), JSON.stringify({ compilerOptions: { plugins: [{ name: '@markless/typescript-plugin' }] } }));
		await writeFile(join(app, 'README.md'), '# acme-invoices\n\nMarkless Router app generated by `create-markless`.\n');

		assert.equal(await writeMigratedReadme({ app, source, state }), 'written');
		assert.ok((await readFile(join(app, 'README.md'), 'utf8')).startsWith('# Acme Invoices\n'));
		assert.equal(await writeMigratedReadme({ app, source, state }), 'unchanged');
		await writeFile(join(app, 'README.md'), '# Edited by hand\n');
		assert.equal(await writeMigratedReadme({ app, source, state }), 'kept');
		assert.equal(await readFile(join(app, 'README.md'), 'utf8'), '# Edited by hand\n');
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
