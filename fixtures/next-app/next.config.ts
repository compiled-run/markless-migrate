import type { NextConfig } from 'next';

const config: NextConfig = {
	poweredByHeader: false,
	experimental: { authInterrupts: true },
};

export default config;
