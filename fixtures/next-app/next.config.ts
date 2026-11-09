import type { NextConfig } from 'next';

const config: NextConfig = {
	poweredByHeader: false,
	productionBrowserSourceMaps: true,
	// Next's default, a worker per core but one, times the mutants the suite builds at once, started 48 workers.
	experimental: { authInterrupts: true, cpus: 3 },
};

export default config;
