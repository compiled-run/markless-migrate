import type { NextConfig } from 'next';

const config: NextConfig = {
	poweredByHeader: false,
	productionBrowserSourceMaps: true,
	experimental: { authInterrupts: true },
};

export default config;
