import { type RouteConfig, index, layout, prefix, route } from '@react-router/dev/routes';

export default [
	index('routes/home.tsx'),
	route('about', 'routes/about.tsx'),
	layout('routes/auth-layout.tsx', [route('login', 'routes/login.tsx')]),
	...prefix('shop', [index('routes/shop.tsx'), route(':handle', 'routes/product.tsx'), route('*', 'routes/shop-missing.tsx')]),
	route('api/search', 'routes/search.ts'),
] satisfies RouteConfig;
