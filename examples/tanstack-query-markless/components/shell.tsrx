import type { Children } from '@markless/core';
import { state } from '@markless/core';
import { isActive, linkClass } from '../lib/active.ts';
import type { SandboxKey } from '../lib/context.ts';
import { here, onServer, storedSandbox } from '../lib/where.ts';
import { Spinner } from './spinner.tsrx';

const NAV = [
	['/', 'Home'],
	['/dashboard', 'Dashboard'],
	['/expensive', 'Expensive'],
	['/route-a', 'Pathless Layout A'],
	['/route-b', 'Pathless Layout B'],
	['/profile', 'Profile'],
	['/login', 'Login'],
] as const;

// The old panel's useSessionStorage writes; the cookie lets the server's mock API wait as long as the browser's did.
function keep(key: SandboxKey, value: number) {
	sessionStorage.setItem(key, JSON.stringify(value));
	document.cookie = `${key}=${value}; Path=/; SameSite=Lax`;
}

export function Shell({
	url,
	sandbox,
	children,
}: {
	url: { readonly pathname: string; readonly search: string };
	sandbox: Record<SandboxKey, number>;
	children?: Children;
}) @{
	let loaderDelay = state(onServer ? sandbox.loaderDelay : storedSandbox().loaderDelay);
	let pendingMs = state(onServer ? sandbox.pendingMs : storedSandbox().pendingMs);
	let pendingMinMs = state(onServer ? sandbox.pendingMinMs : storedSandbox().pendingMinMs);
	const links = NAV.map(([to, label]) => ({ to, label, active: isActive(here(url), to) }));

	<div id="app">
		<div class="text-xs fixed w-52 shadow-md shadow-black/20 rounded-sm bottom-2 left-2 bg-white dark:bg-gray-800 bg-opacity-75 border-b flex flex-col gap-1 flex-wrap items-left divide-y">
			<div class="p-2 space-y-2">
				<div class="flex gap-2">
					<button class="bg-blue-500 text-white rounded-sm p-1 px-2" onClick={() => {
						loaderDelay = 150;
						keep('loaderDelay', 150);
					}}>Fast</button>
					<button class="bg-blue-500 text-white rounded-sm p-1 px-2" onClick={() => {
						loaderDelay = 500;
						keep('loaderDelay', 500);
					}}>Fast 3G</button>
					<button class="bg-blue-500 text-white rounded-sm p-1 px-2" onClick={() => {
						loaderDelay = 2000;
						keep('loaderDelay', 2000);
					}}>Slow 3G</button>
				</div>
				<div>
					<div>{`Loader Delay: ${loaderDelay}ms`}</div>
					<input
						min="0"
						max="5000"
						step="100"
						class="w-full"
						type="range"
						value={loaderDelay}
						onInput={(event) => {
							const value = (event.target as HTMLInputElement).valueAsNumber;
							loaderDelay = value;
							keep('loaderDelay', value);
						}}
					/>
				</div>
			</div>
			<div class="p-2 space-y-2">
				<div class="flex gap-2">
					<button
						class="bg-blue-500 text-white rounded-sm p-1 px-2"
						onClick={() => {
							pendingMs = 1000;
							pendingMinMs = 500;
							keep('pendingMs', 1000);
							keep('pendingMinMs', 500);
						}}
					>
						Reset to Default
					</button>
				</div>
				<div>
					<div>{`defaultPendingMs: ${pendingMs}ms`}</div>
					<input
						min="0"
						max="5000"
						step="100"
						class="w-full"
						type="range"
						value={pendingMs}
						onInput={(event) => {
							const value = (event.target as HTMLInputElement).valueAsNumber;
							pendingMs = value;
							keep('pendingMs', value);
						}}
					/>
				</div>
				<div>
					<div>{`defaultPendingMinMs: ${pendingMinMs}ms`}</div>
					<input
						min="0"
						max="5000"
						step="100"
						class="w-full"
						type="range"
						value={pendingMinMs}
						onInput={(event) => {
							const value = (event.target as HTMLInputElement).valueAsNumber;
							pendingMinMs = value;
							keep('pendingMinMs', value);
						}}
					/>
				</div>
			</div>
		</div>
		<div class="min-h-screen flex flex-col">
			<div class="flex items-center border-b gap-2">
				<h1 class="text-3xl p-2">Kitchen Sink</h1>
				<div class="text-3xl">
					<Spinner show={false} />
				</div>
			</div>
			<div class="flex-1 flex">
				<div class="divide-y w-56">
					@for (const link of links; key link.to) {
						<div>
							<a
								class={linkClass('block py-2 px-3 text-blue-700', link.active)}
								href={link.to}
								data-markless-router-prefetch={link.to === '/profile' ? 'none' : undefined}
								data-status={link.active ? 'active' : undefined}
								aria-current={link.active ? 'page' : undefined}
							>
								{link.label}
							</a>
						</div>
					}
				</div>
				<div class="flex-1 border-l">{children}</div>
			</div>
		</div>
	</div>
}
