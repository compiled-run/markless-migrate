import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { scanSource } from '../src/source/index.ts';
import { view } from './source/view.ts';

const fixture = (name: string) => join(import.meta.dirname, 'source-fixtures', name);

const EXPECTED: Record<string, ReturnType<typeof view>> = {
	'next': {
		framework: 'next',
		routes: [
			'page / app/page.tsx:3',
			'endpoint /api/cart GET,POST app/api/cart/route.ts:3',
			'endpoint /api/subscribe pages/api/subscribe.ts:1',
			'page /blog/:slug app/blog/[slug]/page.tsx:3',
			'page /dashboard auth=admin,signed-in app/dashboard/page.tsx:8',
			'page /legacy pages/legacy.tsx:1',
		],
		nondeterminism: [
			'personalisation cookies() server app/api/cart/route.ts:4',
			'analytics <Analytics> client app/layout.tsx:10',
			'time Date.now() server app/page.tsx:8',
			'flag flag() both flags.ts:3',
			'personalisation request.cookies.get server middleware.ts:4',
			'random Math.random() both pages/legacy.tsx:2',
		],
		writes: [
			'POST - server-action touches=stripe app/actions.ts:4',
			'POST /api/cart route-handler app/api/cart/route.ts:8',
			'POST - server-action touches=prisma app/dashboard/page.tsx:3',
			'POST /api/subscribe route-handler pages/api/subscribe.ts:1',
			'POST https://api.example.com/subscribers fetch pages/api/subscribe.ts:2',
		],
		clients: [
			'contentful ["content_type=post"] fields=body,title app/blog/[slug]/page.tsx:5',
		],
		guards: [
			'admin auth() routes=/dashboard login=/login app/dashboard/layout.tsx:5',
			'signed-in request.cookies.get() routes=/dashboard login=/login middleware.ts:4',
		],
		components: [
			'route app/blog/[slug]/page.tsx#Post',
			'layout app/dashboard/layout.tsx#DashboardLayout',
			'route app/dashboard/page.tsx#Dashboard',
			'layout app/layout.tsx#RootLayout uses components/header.tsx#Header',
			'route app/page.tsx#Home',
			'component components/header.tsx#Header uses components/nav-link.tsx#NavLink',
			'component components/nav-link.tsx#NavLink',
			'route pages/legacy.tsx#Legacy',
		],
		order: [
			'DashboardLayout',
			'NavLink',
			'Header',
			'RootLayout',
			'Post',
			'Dashboard',
			'Home',
			'Legacy',
		],
		limits: [],
	},
	'react-router': {
		framework: 'react-router',
		routes: [
			'page / app/routes/home.tsx:1',
			'page /about app/routes/about.tsx:1',
			'endpoint /api/search app/routes/search.ts:1',
			'page /login app/routes/login.tsx:8',
			'page /shop app/routes/shop.tsx:1',
			'page /shop/:handle app/routes/product.tsx:31',
			'page /shop/*splat? app/routes/shop-missing.tsx:1',
		],
		nondeterminism: [],
		writes: [
			'POST /login form app/routes/login.tsx:3',
			'POST https://demo.myshopify.com/api/2025-01/graphql.json graphql-mutation app/routes/product.tsx:16',
		],
		clients: [
			'shopify-storefront https://demo.myshopify.com ["query Product($handle: String!) { product(handle: $handle) { title priceRange { minVariantPrice { amount } } } }"] fields=product.title,product.priceRange.minVariantPrice.amount app/routes/product.tsx:3',
			'shopify-storefront https://demo.myshopify.com ["mutation Add($lines: [CartLineInput!]!) { cartCreate(input: { lines: $lines }) { cart { id } } }"] fields=cartCreate.cart.id app/routes/product.tsx:16',
		],
		guards: [],
		components: [
			'route app/routes/about.tsx#About',
			'component app/routes/auth-layout.tsx#AuthLayout',
			'route app/routes/home.tsx#Home',
			'route app/routes/login.tsx#Login',
			'route app/routes/product.tsx#Product',
			'route app/routes/shop-missing.tsx#Missing',
			'route app/routes/shop.tsx#Shop',
		],
		order: [
			'AuthLayout',
			'About',
			'Home',
			'Login',
			'Product',
			'Missing',
			'Shop',
		],
		limits: [],
	},
	'remix': {
		framework: 'remix',
		routes: [
			'page / app/routes/_index.tsx:1',
			'page /:lang?/pricing app/routes/($lang).pricing.tsx:1',
			'page /blog/:slug app/routes/blog.$slug.tsx:1',
			'page /files/*splat app/routes/files.$.tsx:1',
			'endpoint /healthz app/routes/healthz.ts:1',
			'page /settings auth=signed-in app/routes/_auth.settings.tsx:6',
		],
		nondeterminism: [
			'personalisation request.headers.get server app/session.server.ts:2',
		],
		writes: [
			'DELETE /settings form app/routes/_auth.settings.tsx:1',
			'POST /settings form app/routes/_auth.settings.tsx:1',
		],
		clients: [],
		guards: [
			'signed-in getUser() routes=/settings login=/login app/routes/_auth.tsx:6',
		],
		components: [
			'layout app/root.tsx#App',
			'route app/routes/_auth.settings.tsx#Settings',
			'layout app/routes/_auth.tsx#AuthLayout',
			'layout app/routes/_index.tsx#Index',
			'route app/routes/($lang).pricing.tsx#Pricing',
			'route app/routes/blog.$slug.tsx#Post',
			'route app/routes/files.$.tsx#Files',
		],
		order: [
			'App',
			'AuthLayout',
			'Index',
			'Settings',
			'Pricing',
			'Post',
			'Files',
		],
		limits: [],
	},
	'sveltekit': {
		framework: 'sveltekit',
		routes: [
			'page / src/routes/+page.svelte:1',
			'page /account auth=signed-in src/routes/(app)/account/+page.svelte:1',
			'endpoint /api/items GET,DELETE src/routes/api/items/+server.ts:1',
			'page /blog/:slug src/routes/blog/[slug]/+page.svelte:1',
			'page /docs/*path? src/routes/docs/[...path]/+page.svelte:1',
		],
		nondeterminism: [
			'random Math.random() both src/lib/Card.svelte:5',
		],
		writes: [
			'POST /account?/rename form src/routes/(app)/account/+page.server.ts:2',
			'DELETE /api/items route-handler src/routes/api/items/+server.ts:5',
		],
		clients: [
			'sanity ["*[_type == \\"post\\"]{ title, \\"slug\\": slug.current, author->{ name } }"] fields=author.name,slug,title src/routes/+page.server.ts:4',
		],
		guards: [
			'signed-in locals.user routes=/account login=/login src/routes/(app)/account/+layout.server.ts:4',
		],
		components: [
			'component src/lib/Card.svelte#Card',
			'route src/routes/(app)/account/+page.svelte#AccountPage',
			'route src/routes/+page.svelte#RootPage uses src/lib/Card.svelte#Card',
			'route src/routes/blog/[slug]/+page.svelte#SlugPage',
			'route src/routes/docs/[...path]/+page.svelte#PathPage',
		],
		order: [
			'Card',
			'AccountPage',
			'RootPage',
			'SlugPage',
			'PathPage',
		],
		limits: [],
	},
	'nuxt': {
		framework: 'nuxt',
		routes: [
			'page / pages/index.vue:1',
			'page /*slug? pages/[...slug].vue:1',
			'endpoint /api/health ALL server/api/health.ts:1',
			'endpoint /api/subscribe POST server/api/subscribe.post.ts:1',
			'page /users/:id auth=signed-in pages/users/[id].vue:1',
		],
		nondeterminism: [
			'personalisation useCookie() both pages/users/[id].vue:3',
		],
		writes: [
			'POST /api/subscribe route-handler server/api/subscribe.post.ts:1',
		],
		clients: [
			'strapi ${useRuntimeConfig().public.strapi} ["/api/articles?fields[0]=title&fields[1]=slug"] fields=slug,title pages/index.vue:2',
		],
		guards: [
			'signed-in route middleware auth routes=/users/:id login=/login middleware/auth.ts:2',
		],
		components: [
			'component components/base/Button.vue#Button',
			'component components/SiteHeader.vue#SiteHeader uses components/base/Button.vue#Button',
			'route pages/[...slug].vue#Slug',
			'route pages/index.vue#Root uses components/SiteHeader.vue#SiteHeader',
			'route pages/users/[id].vue#Id',
		],
		order: [
			'Button',
			'SiteHeader',
			'Slug',
			'Root',
			'Id',
		],
		limits: [],
	},
	'astro': {
		framework: 'astro',
		routes: [
			'page / src/pages/index.astro:1',
			'page /account auth=signed-in src/pages/account.astro:1',
			'page /blog/*slug? src/pages/blog/[...slug].astro:1',
			'endpoint /rss.xml GET src/pages/rss.xml.ts:1',
		],
		nondeterminism: [
			'analytics googletagmanager.com client src/layouts/Base.astro:5',
			'time new Date() server src/pages/blog/[...slug].astro:2',
		],
		writes: [],
		clients: [
			'wordpress-rest ${WP_URL} ["/wp-json/wp/v2/posts?_fields=title,link"] fields=link,title src/pages/index.astro:3',
		],
		guards: [
			'signed-in Astro.locals.user routes=/account login=/login src/pages/account.astro:2',
		],
		components: [
			'layout src/layouts/Base.astro#Base',
			'component src/pages/_draft.astro#Draft',
			'route src/pages/account.astro#Account',
			'route src/pages/blog/[...slug].astro#Slug',
			'route src/pages/index.astro#Root uses src/layouts/Base.astro#Base',
		],
		order: [
			'Base',
			'Draft',
			'Account',
			'Slug',
			'Root',
		],
		limits: [],
	},
	'angular': {
		framework: 'angular',
		routes: [
			'page / src/app/app.routes.ts:6',
			'page /*splat? src/app/app.routes.ts:9',
			'page /admin auth=admin src/app/admin/admin.routes.ts:4',
			'page /admin/users/:id auth=admin src/app/admin/admin.routes.ts:5',
			'page /products/:id src/app/app.routes.ts:7',
		],
		nondeterminism: [],
		writes: [],
		clients: [],
		guards: [
			'admin canActivate: [authGuard] routes=/admin,/admin/users/:id src/app/app.routes.ts:8',
		],
		components: [
			'component src/app/hero.component.ts#HeroComponent',
			'component src/app/home.component.ts#HomeComponent uses src/app/hero.component.ts#HeroComponent',
		],
		order: [
			'HeroComponent',
			'HomeComponent',
		],
		limits: [],
	},
	'solid-start': {
		framework: 'solid-start',
		routes: [
			'page / src/routes/index.tsx:1',
			'page /about src/routes/(marketing)/about.tsx:1',
			'endpoint /api/feed GET src/routes/api/feed.ts:3',
			'page /users/:id src/routes/users/[id].tsx:8',
		],
		nondeterminism: [],
		writes: [
			'POST - server-action src/routes/users/[id].tsx:3',
		],
		clients: [
			'graphql https://cms.example.com ["query Feed { posts(first: 5) { nodes { title uri } } }"] fields=posts.nodes.title,posts.nodes.uri src/routes/api/feed.ts:1',
		],
		guards: [],
		components: [
			'route src/routes/(marketing)/about.tsx#About',
			'route src/routes/index.tsx#Home',
			'route src/routes/users/[id].tsx#User',
		],
		order: [
			'About',
			'Home',
			'User',
		],
		limits: [],
	},
	'tanstack': {
		framework: 'tanstack-router',
		routes: [
			'page / src/routes/index.tsx:3',
			'page /posts/:postId src/routes/posts.$postId.tsx:4',
			'page /settings auth=signed-in src/routes/_authed/settings.tsx:3',
			'page /users src/routes/users.tsx:4',
		],
		nondeterminism: [],
		writes: [
			'SDK - sdk touches=supabase src/routes/posts.$postId.tsx:10',
		],
		clients: [],
		guards: [
			'signed-in context.auth routes=/settings login=/login src/routes/_authed.tsx:5',
		],
		components: [
			'component src/features/users/index.tsx#Users uses src/features/users/table.tsx#UsersTable',
			'component src/features/users/table.tsx#UsersTable',
			'component src/routes/-components/helper.tsx#Helper',
			'route src/routes/posts.$postId.tsx#Post',
			'route src/routes/users.tsx#Route uses src/features/users/index.tsx#Users',
		],
		order: [
			'UsersTable',
			'Users',
			'Helper',
			'Post',
			'Route',
		],
		limits: [],
	},
	'vue': {
		framework: 'vue',
		routes: [
			'page / src/router.ts:5',
			'page /*pathMatch? src/router.ts:13',
			'page /admin auth=admin src/router.ts:7',
			'page /admin/logs auth=admin src/router.ts:11',
			'page /user/:id auth=signed-in src/router.ts:6',
		],
		nondeterminism: [
			'flag posthog.isFeatureEnabled() client src/views/Home.vue:7',
		],
		writes: [
			'POST /api/drafts fetch src/views/Home.vue:9',
		],
		clients: [
			'rest https://api.example.com ["/posts"] fields=title src/views/Home.vue:6',
		],
		guards: [
			'signed-in meta.requiresAuth routes=/user/:id src/router.ts:6',
			'admin meta.requiresAuth routes=/admin,/admin/logs src/router.ts:7',
		],
		components: [
			'component src/components/PostList.vue#PostList',
			'component src/views/Home.vue#Home uses src/components/PostList.vue#PostList',
		],
		order: [
			'PostList',
			'Home',
		],
		limits: [],
	},
	'express': {
		framework: 'express',
		routes: [
			'page / GET src/app.ts:7',
			'endpoint /contact POST src/app.ts:9',
			'endpoint /items/:id DELETE,GET src/app.ts:10',
			'endpoint /users/:id GET,PATCH auth=admin,signed-in src/users.ts:6',
		],
		nondeterminism: [
			'personalisation req.headers both src/app.ts:7',
		],
		writes: [
			'POST /contact route src/app.ts:9',
			'DELETE /items/:id route src/app.ts:10',
			'PATCH /users/:id route src/users.ts:7',
		],
		clients: [],
		guards: [
			'signed-in requireAuth routes=/users/:id src/app.ts:8',
			'admin requireRole routes=/users/:id src/users.ts:7',
		],
		components: [],
		order: [],
		limits: [],
	},
	'hono': {
		framework: 'hono',
		routes: [
			'page / GET src/index.ts:11',
			'endpoint /api/me GET,PUT auth=signed-in src/index.ts:8',
		],
		nondeterminism: [],
		writes: [
			'PUT /api/me route src/index.ts:9',
		],
		clients: [],
		guards: [
			'signed-in jwt routes=/api/me src/index.ts:7',
		],
		components: [],
		order: [],
		limits: [],
	},
	'rails': {
		framework: 'rails',
		routes: [
			'page / GET config/routes.rb:3',
			'page /:locale?/pricing GET config/routes.rb:18',
			'page /about GET config/routes.rb:4',
			'page /admin/reports GET auth=admin config/routes.rb:12',
			'page /ops GET auth=admin config/routes.rb:15',
			'page /posts GET config/routes.rb:5',
			'page /posts/:id GET config/routes.rb:5',
			'page /users/password/new GET config/routes.rb:2',
			'page /users/sign_in GET config/routes.rb:2',
			'page /users/sign_up GET config/routes.rb:2',
		],
		nondeterminism: [
			'personalisation cookies server app/controllers/admin/reports_controller.rb:3',
			'time Time.current server app/controllers/pages_controller.rb:3',
			'random Post.all.sample server app/controllers/posts_controller.rb:5',
		],
		writes: [
			'POST /posts route app/controllers/posts_controller.rb:8',
			'POST /posts/:id/publish route app/controllers/posts_controller.rb:11',
			'DELETE /users/sign_out route config/routes.rb:2',
			'POST /users/sign_in route config/routes.rb:2',
			'POST /users/password route config/routes.rb:2',
			'POST /users route config/routes.rb:2',
			'POST /posts/:post_id/comments route config/routes.rb:9',
		],
		clients: [],
		guards: [
			'admin before_action :require_admin routes=/admin/reports login=/users/sign_in app/controllers/admin/base_controller.rb:2',
			'signed-in before_action :authenticate_user! routes= writes=POST /posts,POST /posts/:id/publish login=/users/sign_in app/controllers/posts_controller.rb:2',
			'admin authenticate :user, ->(u) { u.admin? } routes=/ops login=/users/sign_in config/routes.rb:14',
		],
		components: [],
		order: [],
		limits: [],
	},
	'laravel': {
		framework: 'laravel',
		routes: [
			'page / GET routes/web.php:7',
			'page /about GET routes/web.php:10',
			'page /admin/photos GET auth=admin routes/web.php:19',
			'endpoint /api/status GET routes/api.php:5',
			'page /login GET routes/web.php:11',
			'page /profile/:id? GET auth=signed-in routes/web.php:14',
		],
		nondeterminism: [
			'random random_int server app/Http/Controllers/PhotoController.php:9',
			'time date server routes/web.php:8',
		],
		writes: [
			'POST /admin/photos route app/Http/Controllers/PhotoController.php:12',
			'DELETE /admin/photos/:photo route app/Http/Controllers/PhotoController.php:16',
			'PUT /profile route app/Http/Controllers/ProfileController.php:12',
		],
		clients: [],
		guards: [
			'signed-in middleware auth routes=/profile/:id? writes=PUT /profile login=/login routes/web.php:13',
			'admin middleware role:admin routes=/admin/photos writes=POST /admin/photos,DELETE /admin/photos/:photo login=/login routes/web.php:18',
		],
		components: [],
		order: [],
		limits: [],
	},
	'django': {
		framework: 'django',
		routes: [
			'page /admin/*rest? auth=staff mysite/urls.py:5',
			'page /blog/ blog/urls.py:6',
			'page /blog/:pk/ blog/urls.py:7',
			'page /blog/archive/:year/ auth=signed-in blog/urls.py:9',
			'page /blog/comment/ auth=blog.add_comment blog/urls.py:10',
			'page /blog/new/ auth=signed-in blog/urls.py:8',
		],
		nondeterminism: [
			'time timezone.now server blog/views.py:8',
			'personalisation request.COOKIES.get server blog/views.py:27',
		],
		writes: [
			'POST /blog/new/ route blog/views.py:15',
			'POST /blog/comment/ route blog/views.py:24',
		],
		clients: [],
		guards: [
			'signed-in login_required() routes=/blog/archive/:year/ login=/accounts/login/ blog/urls.py:9',
			'signed-in LoginRequiredMixin routes=/blog/new/ login=/accounts/login/ blog/views.py:15',
			'blog.add_comment @permission_required routes=/blog/comment/ login=/accounts/login/ blog/views.py:23',
			'staff django admin routes=/admin/*rest? login=/admin/login/ mysite/urls.py:5',
		],
		components: [],
		order: [],
		limits: [],
	},
	'wordpress': {
		framework: 'wordpress',
		routes: [
			'page / wp-content/themes/harbour/front-page.php:1',
			'page /:slug/ wp-content/themes/harbour/single.php:1',
			'page /contact/ wp-content/themes/harbour/page-contact.php:1',
			'page /events/ wp-content/themes/harbour/functions.php:3',
			'page /events/:slug/ wp-content/themes/harbour/functions.php:3',
			'page /members/ auth=signed-in wp-content/themes/harbour/page-members.php:1',
			'endpoint /wp-json/harbour/v1/rsvp/:id POST wp-content/themes/harbour/functions.php:6',
		],
		nondeterminism: [
			'time date server wp-content/themes/harbour/front-page.php:2',
			'analytics googletagmanager.com client wp-content/themes/harbour/header.php:1',
			'personalisation is_user_logged_in server wp-content/themes/harbour/page-members.php:2',
		],
		writes: [
			'POST /wp-json/harbour/v1/rsvp/:id route wp-content/themes/harbour/functions.php:6',
			'POST /wp-admin/admin-post.php form wp-content/themes/harbour/page-contact.php:1',
		],
		clients: [],
		guards: [
			'signed-in is_user_logged_in routes=/members/ login=/wp-login.php wp-content/themes/harbour/page-members.php:2',
		],
		components: [],
		order: [],
		limits: [
			'WordPress: routes come from the theme template hierarchy and assume /%postname%/ permalinks; the real permalink structure, pages and posts live in the database, so sample URLs come from the crawl.',
		],
	},
};

test('a TanStack route file that names an imported component puts it, and what it renders, in that route\'s migration step', async () => {
	const { scanSource } = await import('../src/source/index.ts');
	const { stepRoutes } = await import('../src/plan/source.ts');
	const facts = await scanSource(new URL('./source-fixtures/tanstack', import.meta.url).pathname);
	const table = facts.components.find((c) => c.name === 'UsersTable')!;
	assert.deepEqual(stepRoutes(facts, table), ['/users']);
});

for (const [name, expected] of Object.entries(EXPECTED)) {
	test(`source scan of the ${name} fixture finds exactly its routes, nondeterminism, writes, clients, guards and components`, async () => {
		assert.deepEqual(view(await scanSource(fixture(name))), expected);
	});
}
