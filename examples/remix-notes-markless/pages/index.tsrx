import { computed } from '@markless/core';
import { loadUser } from '../lib/load.ts';

export default function Index() @{
	const user = computed(async () => loadUser());
	<main class="relative min-h-screen bg-white sm:flex sm:items-center sm:justify-center">
		<div class="relative sm:pb-16 sm:pt-8">
			<div class="mx-auto max-w-7xl sm:px-6 lg:px-8">
				<div class="relative shadow-xl sm:overflow-hidden sm:rounded-2xl">
					<div class="absolute inset-0">
						<img class="h-full w-full object-cover" src="https://user-images.githubusercontent.com/1500684/157774694-99820c51-8165-4908-a031-34fc371ac0d6.jpg" alt="Sonic Youth On Stage" />
						<div class="absolute inset-0 bg-[color:rgba(254,204,27,0.5)] mix-blend-multiply"></div>
					</div>
					<div class="relative px-4 pb-8 pt-16 sm:px-6 sm:pb-14 sm:pt-24 lg:px-8 lg:pb-20 lg:pt-32">
						<h1 class="text-center text-6xl font-extrabold tracking-tight sm:text-8xl lg:text-9xl">
							<span class="block uppercase text-yellow-500 drop-shadow-md">Indie Stack</span>
						</h1>
						<p class="mx-auto mt-6 max-w-lg text-center text-xl text-white sm:max-w-3xl">
							Check the README.md file for instructions on how to get this
							project deployed.
						</p>
						<div class="mx-auto mt-10 max-w-sm sm:flex sm:max-w-none sm:justify-center">
							@try {
								@if (user.email) {
									<a href="/notes" class="flex items-center justify-center rounded-md border border-transparent bg-white px-4 py-3 text-base font-medium text-yellow-700 shadow-sm hover:bg-yellow-50 sm:px-8">View Notes for {user.email}</a>
								} @else {
									<div class="space-y-4 sm:mx-auto sm:inline-grid sm:grid-cols-2 sm:gap-5 sm:space-y-0">
										<a href="/join" class="flex items-center justify-center rounded-md border border-transparent bg-white px-4 py-3 text-base font-medium text-yellow-700 shadow-sm hover:bg-yellow-50 sm:px-8">Sign up</a>
										<a href="/login" class="flex items-center justify-center rounded-md bg-yellow-500 px-4 py-3 font-medium text-white hover:bg-yellow-600">Log In</a>
									</div>
								}
							} @pending {
								<div></div>
							}
						</div>
						<a href="https://remix.run">
							<img src="https://user-images.githubusercontent.com/1500684/158298926-e45dafff-3544-4b69-96d6-d3bcc33fc76a.svg" alt="Remix" class="mx-auto mt-16 w-full max-w-[12rem] md:max-w-[16rem]" />
						</a>
					</div>
				</div>
			</div>
			<div class="mx-auto max-w-7xl px-4 py-2 sm:px-6 lg:px-8">
				<div class="mt-6 flex flex-wrap justify-center gap-8">
						<a href="https://fly.io" class="flex h-16 w-32 justify-center p-1 grayscale transition hover:grayscale-0 focus:grayscale-0">
							<img alt="Fly.io" src="https://user-images.githubusercontent.com/1500684/157764397-ccd8ea10-b8aa-4772-a99b-35de937319e1.svg" class="object-contain" />
						</a>
						<a href="https://sqlite.org" class="flex h-16 w-32 justify-center p-1 grayscale transition hover:grayscale-0 focus:grayscale-0">
							<img alt="SQLite" src="https://user-images.githubusercontent.com/1500684/157764395-137ec949-382c-43bd-a3c0-0cb8cb22e22d.svg" class="object-contain" />
						</a>
						<a href="https://prisma.io" class="flex h-16 w-32 justify-center p-1 grayscale transition hover:grayscale-0 focus:grayscale-0">
							<img alt="Prisma" src="https://user-images.githubusercontent.com/1500684/157764484-ad64a21a-d7fb-47e3-8669-ec046da20c1f.svg" class="object-contain" />
						</a>
						<a href="https://tailwindcss.com" class="flex h-16 w-32 justify-center p-1 grayscale transition hover:grayscale-0 focus:grayscale-0">
							<img alt="Tailwind" src="https://user-images.githubusercontent.com/1500684/157764276-a516a239-e377-4a20-b44a-0ac7b65c8c14.svg" class="object-contain" />
						</a>
						<a href="https://www.cypress.io" class="flex h-16 w-32 justify-center p-1 grayscale transition hover:grayscale-0 focus:grayscale-0">
							<img alt="Cypress" src="https://user-images.githubusercontent.com/1500684/157764454-48ac8c71-a2a9-4b5e-b19c-edef8b8953d6.svg" class="object-contain" />
						</a>
						<a href="https://mswjs.io" class="flex h-16 w-32 justify-center p-1 grayscale transition hover:grayscale-0 focus:grayscale-0">
							<img alt="MSW" src="https://user-images.githubusercontent.com/1500684/157772386-75444196-0604-4340-af28-53b236faa182.svg" class="object-contain" />
						</a>
						<a href="https://vitest.dev" class="flex h-16 w-32 justify-center p-1 grayscale transition hover:grayscale-0 focus:grayscale-0">
							<img alt="Vitest" src="https://user-images.githubusercontent.com/1500684/157772447-00fccdce-9d12-46a3-8bb4-fac612cdc949.svg" class="object-contain" />
						</a>
						<a href="https://testing-library.com" class="flex h-16 w-32 justify-center p-1 grayscale transition hover:grayscale-0 focus:grayscale-0">
							<img alt="Testing Library" src="https://user-images.githubusercontent.com/1500684/157772662-92b0dd3a-453f-4d18-b8be-9fa6efde52cf.png" class="object-contain" />
						</a>
						<a href="https://prettier.io" class="flex h-16 w-32 justify-center p-1 grayscale transition hover:grayscale-0 focus:grayscale-0">
							<img alt="Prettier" src="https://user-images.githubusercontent.com/1500684/157772934-ce0a943d-e9d0-40f8-97f3-f464c0811643.svg" class="object-contain" />
						</a>
						<a href="https://eslint.org" class="flex h-16 w-32 justify-center p-1 grayscale transition hover:grayscale-0 focus:grayscale-0">
							<img alt="ESLint" src="https://user-images.githubusercontent.com/1500684/157772990-3968ff7c-b551-4c55-a25c-046a32709a8e.svg" class="object-contain" />
						</a>
						<a href="https://typescriptlang.org" class="flex h-16 w-32 justify-center p-1 grayscale transition hover:grayscale-0 focus:grayscale-0">
							<img alt="TypeScript" src="https://user-images.githubusercontent.com/1500684/157773063-20a0ed64-b9f8-4e0b-9d1e-0b65a3d4a6db.svg" class="object-contain" />
						</a>
				</div>
			</div>
		</div>
	</main>
}
