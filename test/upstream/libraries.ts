// The upstream libraries whose own browser suites run against the converted parts, pinned to the versions the original
// ui.shadcn.com build resolves (deploy/shadcn-ui/fetch-old.sh's commit, apps/v4 in its pnpm-lock.yaml).

export interface Library {
	readonly name: string;
	readonly repo: string;
	/** A tag, or a commit (fetched by itself). */
	readonly ref: string;
	/** A pnpm that reads the ref's lockfile version (cmdk's is 9.0 under a pnpm@8 packageManager field). */
	readonly pm: string;
	/** Run in the checkout after the install: what builds the library and the site the suite drives. */
	readonly build: readonly string[];
	/** What serves that site on a port, and where it runs, relative to the checkout. */
	readonly serve: (port: number) => string;
	readonly serveIn: string;
	/** The source convert and usage read, relative to the checkout. */
	readonly source: string;
	readonly runner: { readonly kind: 'playwright'; readonly config: string; readonly browsers: readonly string[] } | { readonly kind: 'cypress'; readonly specs: readonly string[] } | { readonly kind: 'shim'; readonly script: string };
	/** The library's JSX roots (Command, ContextMenu) whose elements get shadcn's data-slot in this source dir (slots.ts). */
	readonly slots?: { readonly dir: string; readonly roots: readonly string[] };
	/** A newer @playwright/test than the ref's, when the ref's browsers do not run on the runner. */
	readonly playwright?: string;
	/** Where the site serves static files: plan crawls from / and a sitemap there lists the pages no link reaches. */
	readonly sitemap?: string;
	/** The address the suite visits stands for a page of the site (serve.ts stories), on both sides. */
	readonly stories?: true;
}

const ROOT = new URL('../..', import.meta.url).pathname;

export const LIBRARIES: Readonly<Record<string, Library>> = {
	cmdk: {
		name: 'cmdk',
		repo: 'https://github.com/dip/cmdk.git',
		ref: 'v1.1.1',
		pm: 'pnpm@9.15.9',
		build: ['pnpm -F cmdk build', 'cd test && npx next build'],
		serve: (port) => `npx next start -p ${port}`,
		serveIn: 'test',
		source: 'test',
		sitemap: 'test/public',
		slots: { dir: 'test/pages', roots: ['Command'] },
		runner: { kind: 'playwright', config: 'playwright.config.ts', browsers: ['webkit'] },
	},
	vaul: {
		name: 'vaul',
		repo: 'https://github.com/emilkowalski/vaul.git',
		ref: 'v1.1.2',
		pm: 'pnpm@8.15.9',
		// The test app only ever ran under next dev, which skips the type check its pages fail.
		build: ['pnpm build', `cd test && mv next.config.js next.config.upstream.js && echo "module.exports = { ...require('./next.config.upstream.js'), typescript: { ignoreBuildErrors: true }, eslint: { ignoreDuringBuilds: true } };" > next.config.js && npx next build`],
		serve: (port) => `npx next start -p ${port}`,
		serveIn: 'test',
		source: 'test',
		sitemap: 'test/public',
		slots: { dir: 'test/src', roots: ['Drawer'] },
		// Its 1.41 WebKit needs libraries Ubuntu 24.04 dropped (libffi7, libx264-163), and 22.04 is too old for yuku-tsrx.
		playwright: '1.51.0',
		runner: { kind: 'playwright', config: 'playwright.config.ts', browsers: ['chromium', 'webkit'] },
	},
	// radix-ui 1.4.3 (@radix-ui/react-context-menu 2.2.16, react-dropdown-menu 2.1.16) was released from this commit. Its
	// browser suite at that commit is Cypress's against Storybook; the Playwright e2e came later.
	radix: {
		name: 'radix',
		repo: 'https://github.com/radix-ui/primitives.git',
		ref: 'a34698ccf1ea956317e5e9b01f0da0b6a2c7d5c1',
		pm: 'pnpm@10.2.0',
		// convert lists a git checkout's files with git, so the generated pages are added to its index.
		build: [
			`node ${ROOT}test/upstream/radix-stories.ts apps/storybook && git add -A apps/storybook/upstream-pages && ln -s ../node_modules apps/storybook/upstream-pages/node_modules`,
			'cd apps/storybook && npx -y vite@6.3.5 build -c upstream-vite.config.mjs',
			'pnpm exec cypress install',
			// The port keeps a closed layer in the page as a hidden template where Radix unmounts it, so a query by text
			// would find it beside the open copy. Testing Library skips hidden subtrees on both sides.
			`echo "import { configure } from '@testing-library/cypress'; configure({ defaultIgnore: 'script, style, [hidden], [hidden] *' });" >> cypress/support/e2e.js`,
		],
		serve: (port) => `node ${ROOT}test/upstream/serve.ts static apps/storybook/upstream-dist ${port}`,
		serveIn: '.',
		source: 'apps/storybook/upstream-pages',
		slots: { dir: 'apps/storybook/stories', roots: ['ContextMenu', 'DropdownMenu', 'Menubar', 'Select', 'Dialog', 'Form', 'Toast'] },
		runner: { kind: 'cypress', specs: ['ContextMenu', 'DropdownMenu', 'Menubar', 'Select', 'Dialog', 'Form', 'Toast'] },
		stories: true,
	},
	// react-day-picker's tests are Jest's on jsdom; day-picker-shim.ts runs the keyboard tests on real pages instead.
	'day-picker': {
		name: 'day-picker',
		repo: 'https://github.com/gpbl/react-day-picker.git',
		ref: 'v9.8.1',
		pm: 'pnpm@9.15.9',
		build: [`node ${ROOT}test/upstream/day-picker-pages.ts . && git add -A examples-app/upstream-pages`, 'cd examples-app && npx vite build -c upstream-vite.config.mjs'],
		serve: (port) => `node ${ROOT}test/upstream/serve.ts static examples-app/upstream-dist ${port}`,
		serveIn: '.',
		source: 'examples-app',
		runner: { kind: 'shim', script: 'day-picker-run.ts' },
	},
};
