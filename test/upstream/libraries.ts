// The upstream libraries whose own browser suites run against the converted parts, pinned to the versions the original
// ui.shadcn.com build resolves (deploy/shadcn-ui/fetch-old.sh's commit, apps/v4 in its pnpm-lock.yaml).

export interface Library {
	readonly name: string;
	readonly repo: string;
	readonly tag: string;
	/** A pnpm that reads the tag's lockfile version (cmdk's is 9.0 under a pnpm@8 packageManager field). */
	readonly pm: string;
	/** Run in the checkout after the install: what builds the library the test app imports. */
	readonly build: readonly string[];
	/** The test app the suite drives, relative to the checkout. */
	readonly app: string;
	readonly appBuild: string;
	readonly appStart: (port: number) => string;
	/** The checkout's Playwright config, which the run extends with its own origin, reporter and no web server. */
	readonly config: string;
	/** The Playwright browsers the config's projects use. */
	readonly browsers: readonly string[];
}

export const LIBRARIES: Readonly<Record<string, Library>> = {
	cmdk: {
		name: 'cmdk',
		repo: 'https://github.com/dip/cmdk.git',
		tag: 'v1.1.1',
		pm: 'pnpm@9.15.9',
		build: ['pnpm -F cmdk build'],
		app: 'test',
		appBuild: 'npx next build',
		appStart: (port) => `npx next start -p ${port}`,
		config: 'playwright.config.ts',
		browsers: ['webkit'],
	},
	vaul: {
		name: 'vaul',
		repo: 'https://github.com/emilkowalski/vaul.git',
		tag: 'v1.1.2',
		pm: 'pnpm@8.15.9',
		build: ['pnpm build'],
		app: 'test',
		appBuild: 'npx next build',
		appStart: (port) => `npx next start -p ${port}`,
		config: 'playwright.config.ts',
		browsers: ['chromium', 'webkit'],
	},
};
