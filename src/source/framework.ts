import type { Project } from './files.ts';

const BY_DEPENDENCY: [string, string][] = [
	['@docusaurus/core', 'docusaurus'],
	['vitepress', 'vitepress'],
	['next', 'next'],
	['nuxt', 'nuxt'],
	['@sveltejs/kit', 'sveltekit'],
	['astro', 'astro'],
	['@solidjs/start', 'solid-start'],
	['@remix-run/react', 'remix'],
	['@remix-run/node', 'remix'],
	['@react-router/dev', 'react-router'],
	['@tanstack/react-start', 'tanstack-start'],
	['@tanstack/solid-start', 'tanstack-start'],
	['@tanstack/react-router', 'tanstack-router'],
	['@tanstack/solid-router', 'tanstack-router'],
	['@angular/core', 'angular'],
	['vue-router', 'vue'],
	['react-router-dom', 'react-router'],
	['react-router', 'react-router'],
	['hono', 'hono'],
	['express', 'express'],
	['vite', 'vite'],
];

/** The app's framework, from its manifests; null when nothing is recognised. */
export async function detectFramework(project: Project): Promise<string | null> {
	for (const [dep, name] of BY_DEPENDENCY) if (dep in project.deps) return name;
	const gemfile = await project.read('Gemfile');
	if (/^\s*gem\s+["']rails["']/m.test(gemfile) || project.has('config/routes.rb')) return 'rails';
	const composer = await project.read('composer.json');
	if (/"laravel\/framework"/.test(composer) || (project.has('routes/web.php') && project.has('artisan'))) return 'laravel';
	if (project.has('manage.py') || /^django\b/im.test(await project.read('requirements.txt')) || /django/i.test(await project.read('pyproject.toml'))) return 'django';
	if (project.has('wp-config.php') || project.files.some((f) => /(^|\/)wp-content\/themes\//.test(f)) || (await isWordPressTheme(project))) return 'wordpress';
	if (project.has('routes/web.php')) return 'laravel';
	return null;
}

export async function isWordPressTheme(project: Project): Promise<boolean> {
	return project.files.some((f) => /(^|\/)style\.css$/.test(f)) && /Theme Name:/i.test(await project.read(project.files.find((f) => /(^|\/)style\.css$/.test(f)) ?? ''));
}
