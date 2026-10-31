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
	readonly runner: { readonly kind: 'playwright'; readonly config: string; readonly browsers: readonly string[] } | { readonly kind: 'cypress'; readonly specs: readonly string[] };
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
		runner: { kind: 'playwright', config: 'playwright.config.ts', browsers: ['webkit'] },
	},
	vaul: {
		name: 'vaul',
		repo: 'https://github.com/emilkowalski/vaul.git',
		ref: 'v1.1.2',
		pm: 'pnpm@8.15.9',
		build: ['pnpm build', 'cd test && npx next build'],
		serve: (port) => `npx next start -p ${port}`,
		serveIn: 'test',
		source: 'test',
		runner: { kind: 'playwright', config: 'playwright.config.ts', browsers: ['chromium', 'webkit'] },
	},
	// radix-ui 1.4.3 (@radix-ui/react-context-menu 2.2.16, react-dropdown-menu 2.1.16) was released from this commit. Its
	// browser suite at that commit is Cypress's against Storybook; the Playwright e2e came later.
	radix: {
		name: 'radix',
		repo: 'https://github.com/radix-ui/primitives.git',
		ref: 'a34698ccf1ea956317e5e9b01f0da0b6a2c7d5c1',
		pm: 'pnpm@10.2.0',
		build: [`node ${ROOT}test/upstream/radix-stories.ts apps/storybook`, 'cd apps/storybook && npx -y vite@6.3.5 build -c upstream-vite.config.mjs', 'pnpm exec cypress install'],
		serve: (port) => `node ${ROOT}test/upstream/serve.ts static apps/storybook/upstream-dist ${port}`,
		serveIn: '.',
		source: 'apps/storybook',
		runner: { kind: 'cypress', specs: ['ContextMenu', 'DropdownMenu', 'Menubar', 'Select', 'Dialog', 'Form', 'Toast'] },
		stories: true,
	},
};
