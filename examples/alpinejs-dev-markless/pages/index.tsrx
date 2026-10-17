import type { PageProps } from '@markless/router';
import { computed, state } from '@markless/core';
import SearchButton from '../components/search-button.tsrx';

const STEP_ORDER = ['directives', 'magics', 'methods'];

export default function Home(_props: PageProps) @{
	let step = state('directives');
	let direction = state('');
	// Alpine's x-transition slides the new panel in from the side its tab sits on; home.css plays that enter once.
	const entering = computed(() => (direction ? `enter-from-${direction}` : ''));

	<div style="display: contents">
		<nav class="absolute flex w-full items-center justify-end gap-4 px-6 py-4 font-medium text-gray-800">
			<div id="docsearch">
			<SearchButton />
		</div>
			<a href="/start-here" class="hover:text-gray-600">Docs</a>
			<a href="/components" class="hover:text-gray-600">Components</a>
			<a href="https://github.com/alpinejs/alpine" class="block hover:text-gray-600" target="_blank">
				<svg class="h-5 w-5 fill-current" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
					<title>GitHub</title>
					<path d="M10 0a10 10 0 0 0-3.16 19.49c.5.1.68-.22.68-.48l-.01-1.7c-2.78.6-3.37-1.34-3.37-1.34-.46-1.16-1.11-1.47-1.11-1.47-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.1-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.1.39-1.99 1.03-2.69a3.6 3.6 0 0 1 .1-2.64s.84-.27 2.75 1.02a9.58 9.58 0 0 1 5 0c1.91-1.3 2.75-1.02 2.75-1.02.55 1.37.2 2.4.1 2.64.64.7 1.03 1.6 1.03 2.69 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85l-.01 2.75c0 .26.18.58.69.48A10 10 0 0 0 10 0"></path>
				</svg>
			</a>
		</nav>
		<div class="m-auto flex flex-col items-center px-8 pt-32 pb-24 text-center text-gray-800 md:w-[650px]">
			<img src="/alpine_long.svg" alt="" />
			<h2 class="font-title pt-6 text-2xl">Your new, lightweight, JavaScript framework.</h2>
			<a href="/start-here" class="mx-auto mt-10 flex items-center justify-center rounded-xl border border-transparent bg-gray-900 px-8 py-3 text-lg tracking-wide text-white transition-colors hover:bg-gray-700"> Get started → </a>
		</div>
		<div class="m-auto px-4 text-gray-800 md:w-[775px] md:px-0">
			<div class="relative rounded-xl border-4 border-gray-800 bg-white md:text-xl">
				<div class="flex flex-col space-y-2 overflow-x-auto px-8 py-6 md:overflow-hidden">
					<code class="whitespace-pre">&lt;script src="//unpkg.com/alpinejs" defer&gt;&lt;/script&gt;</code>
					<code class="whitespace-pre">{" "}</code>
					<code class="whitespace-pre"></code>
					<code class="whitespace-pre">&lt;div x-data="&#123; open: false &#125;"&gt;</code>
					<code class="whitespace-pre">{"    <button @click=\"open = true\">Expand</button>"}</code>
					<code class="whitespace-pre">{" "}</code>
					<code class="whitespace-pre">{"    <span x-show=\"open\">"}</code>
					<code class="whitespace-pre">{"        Content..."}</code>
					<code class="whitespace-pre">{"    </span>"}</code>
					<code class="whitespace-pre">&lt;/div&gt;</code>
				</div>
				<div class="absolute inset-0 flex items-center" style="z-index: -1; margin: 0">
					<div class="left-6 -mr-16 h-full w-full translate-x-4 scale-y-95 transform rounded-xl border-4 border-gray-800"></div>
				</div>
			</div>
		</div>
		<div>
			<div class="m-auto px-8 pt-32 text-gray-800 md:w-[650px]">
				<div class="font-title space-y-2">
					<h2 class="text-6xl font-extrabold">Simple.</h2>
					<h2 class="text-6xl font-extrabold">Lightweight.</h2>
					<h2 class="text-6xl font-extrabold">Powerful as hell.</h2>
				</div>
				<div class="space-y-6 pt-16 text-xl">
					<p> Alpine is a rugged, minimal tool for composing behavior directly in your markup. Think of it like jQuery for the modern web. Plop in a script tag and get going. </p>
					<p> Alpine is a collection of <strong>15 attributes</strong>, <strong>6 properties</strong>, and <strong>2 methods</strong>. </p>
					<p> There is no better way to get a feel for what Alpine is and what it can do, than by seeing it for yourself: </p>
				</div>
				<div class="flex justify-center space-x-2 pt-16">
						<button
						class={step === 'directives' ? 'rounded-xl px-3 py-1 ring-gray-800 focus:outline-none focus:ring-1 bg-gray-800 text-white' : 'rounded-xl px-3 py-1 ring-gray-800 focus:outline-none focus:ring-1'}
						onClick={() => {
							direction = STEP_ORDER.indexOf('directives') > STEP_ORDER.indexOf(step) ? 'right' : 'left';
							step = 'directives';
						}}
					>
						{' '}
						<strong>15</strong>
						{' '}
						<span>Attributes</span>
						{' '}
					</button>
					<button
						class={step === 'magics' ? 'rounded-xl px-3 py-1 ring-gray-800 focus:outline-none focus:ring-1 bg-gray-800 text-white' : 'rounded-xl px-3 py-1 ring-gray-800 focus:outline-none focus:ring-1'}
						onClick={() => {
							direction = STEP_ORDER.indexOf('magics') > STEP_ORDER.indexOf(step) ? 'right' : 'left';
							step = 'magics';
						}}
					>
						{' '}
						<strong>6</strong>
						{' '}
						<span>Properties</span>
						{' '}
					</button>
					<button
						class={step === 'methods' ? 'rounded-xl px-3 py-1 ring-gray-800 focus:outline-none focus:ring-1 bg-gray-800 text-white' : 'rounded-xl px-3 py-1 ring-gray-800 focus:outline-none focus:ring-1'}
						onClick={() => {
							direction = STEP_ORDER.indexOf('methods') > STEP_ORDER.indexOf(step) ? 'right' : 'left';
							step = 'methods';
						}}
					>
						{' '}
						<strong>2</strong>
						{' '}
						<span>Methods</span>
						{' '}
					</button>
				</div>
			</div>
			<div class="relative m-auto px-8 text-gray-800 md:overflow-hidden">
				<div class="absolute bottom-0 left-0 right-0 z-10" style="display: none;">
					<div class="h-[150px] bg-gradient-to-t from-white to-transparent"></div>
					<div class="flex items-end justify-center bg-white py-12">
						<button>Show More ↓</button>
					</div>
				</div>
				<div class="m-auto pt-12 pb-16 md:w-[750px] md:px-0 md:pb-0 lg:w-[1000px]">
					<div style={step === 'directives' ? '' : 'display: none;'} class={step === 'directives' ? entering : ''} onAnimationEnd={() => (direction = '')}>
						<div class="flex flex-col md:flex-row">
							<div class="md:w-[30%] pt-8 pb-4 md:pb-8">
								{" "}
								<span class="text-2xl font-bold">x-data</span>
								{" "}
								<p>Declare a new Alpine component and its data for a block of HTML</p>
							</div>
							<div class="hidden md:block md:w-[10%]"></div>
							<div class="relative bg-white md:w-[60%] border-b-4 md:border-b-0 rounded-b-xl md:rounded-b-none border-l-4 border-r-4 border-t-4 rounded-t-xl border-gray-800">
								<div class="flex h-full flex-col justify-center overflow-x-hidden py-8 px-4 hover:overflow-x-auto">
									<code class="block whitespace-pre">&lt;div <span class="text-[#48a9c1]">x-data</span>="&#123; open: false &#125;"&gt;</code>
									<code class="block whitespace-pre">{"    ..."}</code>
									<code class="block whitespace-pre">&lt;/div&gt;</code>
								</div>
								<div class="absolute left-3 top-3 box-content hidden h-full w-full rounded-t-xl border-t-4 border-r-4 border-gray-800 md:block" style="z-index: -1; margin: 0"></div>
							</div>
						</div>
						<div class="flex flex-col md:flex-row">
							<div class="md:w-[30%] pt-8 pb-4 md:pb-8">
								{" "}
								<span class="text-2xl font-bold">x-bind</span>
								{" "}
								<p>Dynamically set HTML attributes on an element</p>
							</div>
							<div class="hidden md:block md:w-[10%]"></div>
							<div class="relative bg-white md:w-[60%] border-l-4 border-r-4 border-gray-800 rounded-b-xl md:rounded-b-none rounded-t-xl md:rounded-t-none border-b-4 md:border-b-0 border-t-4 md:border-t-0">
								<div class="flex h-full flex-col justify-center overflow-x-hidden py-8 px-4 hover:overflow-x-auto">
									<code class="whitespace-pre">&lt;div <span class="text-[#48a9c1]">x-bind</span>:class="! open ? 'hidden' : ''"&gt;</code>
									<code class="whitespace-pre">{"  ..."}</code>
									<code class="whitespace-pre">&lt;/div&gt;</code>
								</div>
								<div class="absolute left-3 top-3 box-content hidden h-full w-full border-r-4 border-gray-800 md:block" style="z-index: -1; margin: 0"></div>
							</div>
						</div>
						<div class="flex flex-col md:flex-row">
							<div class="md:w-[30%] pt-8 pb-4 md:pb-8">
								{" "}
								<span class="text-2xl font-bold">x-on</span>
								{" "}
								<p>Listen for browser events on an element</p>
							</div>
							<div class="hidden md:block md:w-[10%]"></div>
							<div class="relative bg-white md:w-[60%] border-l-4 border-r-4 border-gray-800 rounded-b-xl md:rounded-b-none rounded-t-xl md:rounded-t-none border-b-4 md:border-b-0 border-t-4 md:border-t-0">
								<div class="flex h-full flex-col justify-center overflow-x-hidden py-8 px-4 hover:overflow-x-auto">
									<code class="whitespace-pre">&lt;button <span class="text-[#48a9c1]">x-on</span>:click="open = ! open"&gt;</code>
									<code class="whitespace-pre">{"  Toggle"}</code>
									<code class="whitespace-pre">&lt;/button&gt;</code>
								</div>
								<div class="absolute left-3 top-3 box-content hidden h-full w-full border-r-4 border-gray-800 md:block" style="z-index: -1; margin: 0"></div>
							</div>
						</div>
						<div class="flex flex-col md:flex-row">
							<div class="md:w-[30%] pt-8 pb-4 md:pb-8">
								{" "}
								<span class="text-2xl font-bold">x-text</span>
								{" "}
								<p>Set the text content of an element</p>
							</div>
							<div class="hidden md:block md:w-[10%]"></div>
							<div class="relative bg-white md:w-[60%] border-l-4 border-r-4 border-gray-800 rounded-b-xl md:rounded-b-none rounded-t-xl md:rounded-t-none border-b-4 md:border-b-0 border-t-4 md:border-t-0">
								<div class="flex h-full flex-col justify-center overflow-x-hidden py-8 px-4 hover:overflow-x-auto">
									<code class="whitespace-pre">&lt;div&gt;</code>
									<code class="block whitespace-pre">{"  Copyright ©"}</code>
									<code class="block whitespace-pre">{" "}</code>
									<code class="block whitespace-pre">{"  <span "}<span class="text-[#48a9c1]">x-text</span>="new Date().getFullYear()"&gt;&lt;/span&gt;</code>
									<code class="block whitespace-pre">&lt;/div&gt;</code>
								</div>
								<div class="absolute left-3 top-3 box-content hidden h-full w-full border-r-4 border-gray-800 md:block" style="z-index: -1; margin: 0"></div>
							</div>
						</div>
						<div class="flex flex-col md:flex-row">
							<div class="md:w-[30%] pt-8 pb-4 md:pb-8">
								{" "}
								<span class="text-2xl font-bold">x-html</span>
								{" "}
								<p>Set the inner HTML of an element</p>
							</div>
							<div class="hidden md:block md:w-[10%]"></div>
							<div class="relative bg-white md:w-[60%] border-l-4 border-r-4 border-gray-800 rounded-b-xl md:rounded-b-none rounded-t-xl md:rounded-t-none border-b-4 md:border-b-0 border-t-4 md:border-t-0">
								<div class="flex h-full flex-col justify-center overflow-x-hidden py-8 px-4 hover:overflow-x-auto">
									<code class="whitespace-pre">&lt;div <span class="text-[#48a9c1]">x-html</span>="(await axios.get('/some/html/partial')).data"&gt;</code>
									<code class="whitespace-pre">{"  ..."}</code>
									<code class="block whitespace-pre">&lt;/div&gt;</code>
								</div>
								<div class="absolute left-3 top-3 box-content hidden h-full w-full border-r-4 border-gray-800 md:block" style="z-index: -1; margin: 0"></div>
							</div>
						</div>
						<div class="flex flex-col md:flex-row">
							<div class="md:w-[30%] pt-8 pb-4 md:pb-8">
								{" "}
								<span class="text-2xl font-bold">x-model</span>
								{" "}
								<p>Synchronize a piece of data with an input element</p>
							</div>
							<div class="hidden md:block md:w-[10%]"></div>
							<div class="relative bg-white md:w-[60%] border-l-4 border-r-4 border-gray-800 rounded-b-xl md:rounded-b-none rounded-t-xl md:rounded-t-none border-b-4 md:border-b-0 border-t-4 md:border-t-0">
								<div class="flex h-full flex-col justify-center overflow-x-hidden py-8 px-4 hover:overflow-x-auto">
									<code class="whitespace-pre">&lt;div x-data="&#123; search: '' &#125;"&gt;</code>
									<code class="whitespace-pre">{"  <input type=\"text\" "}<span class="text-[#48a9c1]">x-model</span>="search"&gt;</code>
									<code class="whitespace-pre">{" "}</code>
									<code class="whitespace-pre">{"  Searching for: <span x-text=\"search\"></span>"}</code>
									<code class="block whitespace-pre">&lt;/div&gt;</code>
								</div>
								<div class="absolute left-3 top-3 box-content hidden h-full w-full border-r-4 border-gray-800 md:block" style="z-index: -1; margin: 0"></div>
							</div>
						</div>
						<div class="flex flex-col md:flex-row">
							<div class="md:w-[30%] pt-8 pb-4 md:pb-8">
								{" "}
								<span class="text-2xl font-bold">x-show</span>
								{" "}
								<p>Toggle the visibility of an element</p>
							</div>
							<div class="hidden md:block md:w-[10%]"></div>
							<div class="relative bg-white md:w-[60%] border-l-4 border-r-4 border-gray-800 rounded-b-xl md:rounded-b-none rounded-t-xl md:rounded-t-none border-b-4 md:border-b-0 border-t-4 md:border-t-0">
								<div class="flex h-full flex-col justify-center overflow-x-hidden py-8 px-4 hover:overflow-x-auto">
									<code class="whitespace-pre">&lt;div <span class="text-[#48a9c1]">x-show</span>="open"&gt;</code>
									<code class="whitespace-pre">{"  ..."}</code>
									<code class="whitespace-pre">&lt;/div&gt;</code>
								</div>
								<div class="absolute left-3 top-3 box-content hidden h-full w-full border-r-4 border-gray-800 md:block" style="z-index: -1; margin: 0"></div>
							</div>
						</div>
						<div class="flex flex-col md:flex-row">
							<div class="md:w-[30%] pt-8 pb-4 md:pb-8">
								{" "}
								<span class="text-2xl font-bold">x-transition</span>
								{" "}
								<p>Transition an element in and out using CSS transitions</p>
							</div>
							<div class="hidden md:block md:w-[10%]"></div>
							<div class="relative bg-white md:w-[60%] border-l-4 border-r-4 border-gray-800 rounded-b-xl md:rounded-b-none rounded-t-xl md:rounded-t-none border-b-4 md:border-b-0 border-t-4 md:border-t-0">
								<div class="flex h-full flex-col justify-center overflow-x-hidden py-8 px-4 hover:overflow-x-auto">
									<code class="whitespace-pre">&lt;div x-show="open" <span class="text-[#48a9c1]">x-transition</span>&gt;</code>
									<code class="whitespace-pre">{"  ..."}</code>
									<code class="whitespace-pre">&lt;/div&gt;</code>
								</div>
								<div class="absolute left-3 top-3 box-content hidden h-full w-full border-r-4 border-gray-800 md:block" style="z-index: -1; margin: 0"></div>
							</div>
						</div>
						<div class="flex flex-col md:flex-row">
							<div class="md:w-[30%] pt-8 pb-4 md:pb-8">
								{" "}
								<span class="text-2xl font-bold">x-for</span>
								{" "}
								<p>Repeat a block of HTML based on a data set</p>
							</div>
							<div class="hidden md:block md:w-[10%]"></div>
							<div class="relative bg-white md:w-[60%] border-l-4 border-r-4 border-gray-800 rounded-b-xl md:rounded-b-none rounded-t-xl md:rounded-t-none border-b-4 md:border-b-0 border-t-4 md:border-t-0">
								<div class="flex h-full flex-col justify-center overflow-x-hidden py-8 px-4 hover:overflow-x-auto">
									<code class="whitespace-pre">&lt;template <span class="text-[#48a9c1]">x-for</span>="post in posts"&gt;</code>
									<code class="whitespace-pre">{"  <h2 x-text=\"post.title\"></h2>"}</code>
									<code class="whitespace-pre">&lt;/template&gt;</code>
								</div>
								<div class="absolute left-3 top-3 box-content hidden h-full w-full border-r-4 border-gray-800 md:block" style="z-index: -1; margin: 0"></div>
							</div>
						</div>
						<div class="flex flex-col md:flex-row">
							<div class="md:w-[30%] pt-8 pb-4 md:pb-8">
								{" "}
								<span class="text-2xl font-bold">x-if</span>
								{" "}
								<p>Conditionally add/remove a block of HTML from the page entirely</p>
							</div>
							<div class="hidden md:block md:w-[10%]"></div>
							<div class="relative bg-white md:w-[60%] border-l-4 border-r-4 border-gray-800 rounded-b-xl md:rounded-b-none rounded-t-xl md:rounded-t-none border-b-4 md:border-b-0 border-t-4 md:border-t-0">
								<div class="flex h-full flex-col justify-center overflow-x-hidden py-8 px-4 hover:overflow-x-auto">
									<code class="whitespace-pre">&lt;template <span class="text-[#48a9c1]">x-if</span>="open"&gt;</code>
									<code class="whitespace-pre">{"  <div>...</div>"}</code>
									<code class="whitespace-pre">&lt;/template&gt;</code>
								</div>
								<div class="absolute left-3 top-3 box-content hidden h-full w-full border-r-4 border-gray-800 md:block" style="z-index: -1; margin: 0"></div>
							</div>
						</div>
						<div class="flex flex-col md:flex-row">
							<div class="md:w-[30%] pt-8 pb-4 md:pb-8">
								{" "}
								<span class="text-2xl font-bold">x-init</span>
								{" "}
								<p>Run code when an element is initialized by Alpine</p>
							</div>
							<div class="hidden md:block md:w-[10%]"></div>
							<div class="relative bg-white md:w-[60%] border-l-4 border-r-4 border-gray-800 rounded-b-xl md:rounded-b-none rounded-t-xl md:rounded-t-none border-b-4 md:border-b-0 border-t-4 md:border-t-0">
								<div class="flex h-full flex-col justify-center overflow-x-hidden py-8 px-4 hover:overflow-x-auto">
									<code class="whitespace-pre">&lt;div <span class="text-[#48a9c1]">x-init</span>="date = new Date()"&gt;&lt;/div&gt;</code>
								</div>
								<div class="absolute left-3 top-3 box-content hidden h-full w-full border-r-4 border-gray-800 md:block" style="z-index: -1; margin: 0"></div>
							</div>
						</div>
						<div class="flex flex-col md:flex-row">
							<div class="md:w-[30%] pt-8 pb-4 md:pb-8">
								{" "}
								<span class="text-2xl font-bold">x-effect</span>
								{" "}
								<p>Execute a script each time one of its dependencies change</p>
							</div>
							<div class="hidden md:block md:w-[10%]"></div>
							<div class="relative bg-white md:w-[60%] border-l-4 border-r-4 border-gray-800 rounded-b-xl md:rounded-b-none rounded-t-xl md:rounded-t-none border-b-4 md:border-b-0 border-t-4 md:border-t-0">
								<div class="flex h-full flex-col justify-center overflow-x-hidden py-8 px-4 hover:overflow-x-auto">
									<code class="whitespace-pre">&lt;div <span class="text-[#48a9c1]">x-effect</span>="console.log('Count is '+count)"&gt;&lt;/div&gt;</code>
								</div>
								<div class="absolute left-3 top-3 box-content hidden h-full w-full border-r-4 border-gray-800 md:block" style="z-index: -1; margin: 0"></div>
							</div>
						</div>
						<div class="flex flex-col md:flex-row">
							<div class="md:w-[30%] pt-8 pb-4 md:pb-8">
								{" "}
								<span class="text-2xl font-bold">x-ref</span>
								{" "}
								<p>Reference elements directly by their specified keys using the <code>$refs</code> magic property</p>
							</div>
							<div class="hidden md:block md:w-[10%]"></div>
							<div class="relative bg-white md:w-[60%] border-l-4 border-r-4 border-gray-800 rounded-b-xl md:rounded-b-none rounded-t-xl md:rounded-t-none border-b-4 md:border-b-0 border-t-4 md:border-t-0">
								<div class="flex h-full flex-col justify-center overflow-x-hidden py-8 px-4 hover:overflow-x-auto">
									<code class="block whitespace-pre">&lt;input type="text" <span class="text-[#48a9c1]">x-ref</span>="content"&gt;</code>
									<code class="block whitespace-pre">{" "}</code>
									<code class="block whitespace-pre">&lt;button x-on:click="navigator.clipboard.writeText($refs.content.value)"&gt;</code>
									<code class="block whitespace-pre">{"  Copy"}</code>
									<code class="block whitespace-pre">&lt;/button&gt;</code>
								</div>
								<div class="absolute left-3 top-3 box-content hidden h-full w-full border-r-4 border-gray-800 md:block" style="z-index: -1; margin: 0"></div>
							</div>
						</div>
						<div class="flex flex-col md:flex-row">
							<div class="md:w-[30%] pt-8 pb-4 md:pb-8">
								{" "}
								<span class="text-2xl font-bold">x-cloak</span>
								{" "}
								<p>Hide a block of HTML until after Alpine is finished initializing its contents</p>
							</div>
							<div class="hidden md:block md:w-[10%]"></div>
							<div class="relative bg-white md:w-[60%] border-l-4 border-r-4 border-gray-800 rounded-b-xl md:rounded-b-none rounded-t-xl md:rounded-t-none border-b-4 md:border-b-0 border-t-4 md:border-t-0">
								<div class="flex h-full flex-col justify-center overflow-x-hidden py-8 px-4 hover:overflow-x-auto">
									<code class="whitespace-pre">&lt;div <span class="text-[#48a9c1]">x-cloak</span>&gt;</code>
									<code class="whitespace-pre">{"  ..."}</code>
									<code class="whitespace-pre">&lt;/div&gt;</code>
								</div>
								<div class="absolute left-3 top-3 box-content hidden h-full w-full border-r-4 border-gray-800 md:block" style="z-index: -1; margin: 0"></div>
							</div>
						</div>
						<div class="flex flex-col md:flex-row">
							<div class="md:w-[30%] pt-8 pb-4 md:pb-8">
								{" "}
								<span class="text-2xl font-bold">x-ignore</span>
								{" "}
								<p>Prevent a block of HTML from being initialized by Alpine</p>
							</div>
							<div class="hidden md:block md:w-[10%]"></div>
							<div class="relative bg-white md:w-[60%] border-l-4 border-r-4 border-gray-800 rounded-b-xl md:rounded-b-none rounded-t-xl md:rounded-t-none border-b-4 md:border-b-0 border-t-4 md:border-t-0 md:pb-16">
								<div class="flex h-full flex-col justify-center overflow-x-hidden py-8 px-4 hover:overflow-x-auto">
									<code class="whitespace-pre">&lt;div <span class="text-[#48a9c1]">x-ignore</span>&gt;</code>
									<code class="whitespace-pre">{"  ..."}</code>
									<code class="whitespace-pre">&lt;/div&gt;</code>
								</div>
								<div class="absolute left-3 top-3 box-content hidden h-full w-full border-r-4 border-gray-800 md:block" style="z-index: -1; margin: 0"></div>
							</div>
						</div>
					</div>
					<div style={step === 'magics' ? '' : 'display: none;'} class={step === 'magics' ? entering : ''} onAnimationEnd={() => (direction = '')}>
						<div class="flex flex-col md:flex-row">
							<div class="md:w-[30%] pt-8 pb-4 md:pb-8">
								{" "}
								<span class="text-2xl font-bold">$store</span>
								{" "}
								<p>Access a global store registered using <code>Alpine.store(...)</code></p>
							</div>
							<div class="hidden md:block md:w-[10%]"></div>
							<div class="relative bg-white md:w-[60%] border-b-4 md:border-b-0 rounded-b-xl md:rounded-b-none border-l-4 border-r-4 border-t-4 rounded-t-xl border-gray-800">
								<div class="flex h-full flex-col justify-center overflow-x-hidden py-8 px-4 hover:overflow-x-auto">
									<code class="whitespace-pre">&lt;h1 x-text="<span class="text-[#48a9c1]">$store</span>.site.title"&gt;&lt;/h1&gt;</code>
								</div>
								<div class="absolute left-3 top-3 box-content hidden h-full w-full rounded-t-xl border-t-4 border-r-4 border-gray-800 md:block" style="z-index: -1; margin: 0"></div>
							</div>
						</div>
						<div class="flex flex-col md:flex-row">
							<div class="md:w-[30%] pt-8 pb-4 md:pb-8">
								{" "}
								<span class="text-2xl font-bold">$el</span>
								{" "}
								<p>Reference the current DOM element</p>
							</div>
							<div class="hidden md:block md:w-[10%]"></div>
							<div class="relative bg-white md:w-[60%] border-l-4 border-r-4 border-gray-800 rounded-b-xl md:rounded-b-none rounded-t-xl md:rounded-t-none border-b-4 md:border-b-0 border-t-4 md:border-t-0">
								<div class="flex h-full flex-col justify-center overflow-x-hidden py-8 px-4 hover:overflow-x-auto">
									<code class="whitespace-pre">&lt;div x-init="new Pikaday(<span class="text-[#48a9c1]">$el</span>)"&gt;&lt;/div&gt;</code>
								</div>
								<div class="absolute left-3 top-3 box-content hidden h-full w-full border-r-4 border-gray-800 md:block" style="z-index: -1; margin: 0"></div>
							</div>
						</div>
						<div class="flex flex-col md:flex-row">
							<div class="md:w-[30%] pt-8 pb-4 md:pb-8">
								{" "}
								<span class="text-2xl font-bold">$dispatch</span>
								{" "}
								<p>Dispatch a custom browser event from the current element</p>
							</div>
							<div class="hidden md:block md:w-[10%]"></div>
							<div class="relative bg-white md:w-[60%] border-l-4 border-r-4 border-gray-800 rounded-b-xl md:rounded-b-none rounded-t-xl md:rounded-t-none border-b-4 md:border-b-0 border-t-4 md:border-t-0">
								<div class="flex h-full flex-col justify-center overflow-x-hidden py-8 px-4 hover:overflow-x-auto">
									<code class="whitespace-pre">&lt;div x-on:notify="..."&gt;</code>
									<code class="whitespace-pre">{"  <button x-on:click=\""}<span class="text-[#48a9c1]">$dispatch</span>('notify')"&gt;...&lt;/button&gt;</code>
									<code class="whitespace-pre">&lt;/div&gt;</code>
								</div>
								<div class="absolute left-3 top-3 box-content hidden h-full w-full border-r-4 border-gray-800 md:block" style="z-index: -1; margin: 0"></div>
							</div>
						</div>
						<div class="flex flex-col md:flex-row">
							<div class="md:w-[30%] pt-8 pb-4 md:pb-8">
								{" "}
								<span class="text-2xl font-bold">$watch</span>
								{" "}
								<p>Watch a piece of data and run the provided callback anytime it changes</p>
							</div>
							<div class="hidden md:block md:w-[10%]"></div>
							<div class="relative bg-white md:w-[60%] border-l-4 border-r-4 border-gray-800 rounded-b-xl md:rounded-b-none rounded-t-xl md:rounded-t-none border-b-4 md:border-b-0 border-t-4 md:border-t-0">
								<div class="flex h-full flex-col justify-center overflow-x-hidden py-8 px-4 hover:overflow-x-auto">
									<code class="whitespace-pre">&lt;div x-init="<span class="text-[#48a9c1]">$watch</span>('count', value =&gt; &#123;</code>
									<code class="whitespace-pre">{"  console.log('count is ' + value)"}</code>
									<code class="whitespace-pre">&#125;)"&gt;...&lt;/div&gt;</code>
								</div>
								<div class="absolute left-3 top-3 box-content hidden h-full w-full border-r-4 border-gray-800 md:block" style="z-index: -1; margin: 0"></div>
							</div>
						</div>
						<div class="flex flex-col md:flex-row">
							<div class="md:w-[30%] pt-8 pb-4 md:pb-8">
								{" "}
								<span class="text-2xl font-bold">$refs</span>
								{" "}
								<p>Reference an element by key (specified using <code>x-ref</code>)</p>
							</div>
							<div class="hidden md:block md:w-[10%]"></div>
							<div class="relative bg-white md:w-[60%] border-l-4 border-r-4 border-gray-800 rounded-b-xl md:rounded-b-none rounded-t-xl md:rounded-t-none border-b-4 md:border-b-0 border-t-4 md:border-t-0">
								<div class="flex h-full flex-col justify-center overflow-x-hidden py-8 px-4 hover:overflow-x-auto">
									<code class="whitespace-pre">&lt;div x-init="<span class="text-[#48a9c1]">$refs</span>.button.remove()"&gt;</code>
									<code class="whitespace-pre">{"  <button x-ref=\"button\">Remove Me</button>"}</code>
									<code class="whitespace-pre">&lt;/div&gt;</code>
								</div>
								<div class="absolute left-3 top-3 box-content hidden h-full w-full border-r-4 border-gray-800 md:block" style="z-index: -1; margin: 0"></div>
							</div>
						</div>
						<div class="flex flex-col md:flex-row">
							<div class="md:w-[30%] pt-8 pb-4 md:pb-8">
								{" "}
								<span class="text-2xl font-bold">$nextTick</span>
								{" "}
								<p>Wait until the next "tick" (browser paint) to run a bit of code</p>
							</div>
							<div class="hidden md:block md:w-[10%]"></div>
							<div class="relative bg-white md:w-[60%] border-l-4 border-r-4 border-gray-800 rounded-b-xl md:rounded-b-none rounded-t-xl md:rounded-t-none border-b-4 md:border-b-0 border-t-4 md:border-t-0">
								<div class="flex h-full flex-col justify-center overflow-x-hidden py-8 px-4 hover:overflow-x-auto">
									<code class="whitespace-pre">&lt;div</code>
									<code class="whitespace-pre">{"  x-text=\"count\""}</code>
									<code class="whitespace-pre">{"  x-text=\""}<span class="text-[#48a9c1]">$nextTick</span>(() =&gt; &#123;"</code>
									<code class="whitespace-pre">{"    console.log('count is ' + $el.textContent)"}</code>
									<code class="whitespace-pre">{"  })"}</code>
									<code class="whitespace-pre">&gt;...&lt;/div&gt;</code>
								</div>
								<div class="absolute left-3 top-3 box-content hidden h-full w-full border-r-4 border-gray-800 md:block" style="z-index: -1; margin: 0"></div>
							</div>
						</div>
					</div>
					<div style={step === 'methods' ? '' : 'display: none;'} class={step === 'methods' ? entering : ''} onAnimationEnd={() => (direction = '')}>
						<div class="flex flex-col md:flex-row">
							<div class="md:w-[30%] pt-8 pb-4 md:pb-8">
								{" "}
								<span class="text-2xl font-bold">Alpine.data</span>
								{" "}
								<p>Reuse a data object and reference it using <code>x-data</code></p>
							</div>
							<div class="hidden md:block md:w-[10%]"></div>
							<div class="relative bg-white md:w-[60%] border-b-4 md:border-b-0 rounded-b-xl md:rounded-b-none border-l-4 border-r-4 border-t-4 rounded-t-xl border-gray-800">
								<div class="flex h-full flex-col justify-center overflow-x-hidden py-8 px-4 hover:overflow-x-auto">
									<code class="block whitespace-pre">&lt;div x-data="dropdown"&gt;</code>
									<code class="block whitespace-pre">{"  ..."}</code>
									<code class="block whitespace-pre">&lt;/div&gt;</code>
									<code class="whitespace-pre">{" "}</code>
									<code class="block whitespace-pre">...</code>
									<code class="whitespace-pre">{" "}</code>
									<code class="whitespace-pre"><span class="text-[#48a9c1]">Alpine.data</span>('dropdown', () =&gt; (&#123;</code>
									<code class="whitespace-pre">{"  open: false,"}</code>
									<code class="whitespace-pre">{" "}</code>
									<code class="whitespace-pre">{"  toggle() { "}</code>
									<code class="whitespace-pre">{"    this.open = ! this.open"}</code>
									<code class="whitespace-pre">{"  }"}</code>
									<code class="whitespace-pre">&#125;))</code>
								</div>
								<div class="absolute left-3 top-3 box-content hidden h-full w-full rounded-t-xl border-t-4 border-r-4 border-gray-800 md:block" style="z-index: -1; margin: 0"></div>
							</div>
						</div>
						<div class="flex flex-col md:flex-row">
							<div class="md:w-[30%] pt-8 pb-4 md:pb-8">
								{" "}
								<span class="text-2xl font-bold">Alpine.store</span>
								{" "}
								<p>Declare a piece of global, reactive, data that can be accessed from anywhere using <code>$store</code></p>
							</div>
							<div class="hidden md:block md:w-[10%]"></div>
							<div class="relative bg-white md:w-[60%] border-l-4 border-r-4 border-gray-800 rounded-b-xl md:rounded-b-none rounded-t-xl md:rounded-t-none border-b-4 md:border-b-0 border-t-4 md:border-t-0">
								<div class="flex h-full flex-col justify-center overflow-x-hidden py-8 px-4 hover:overflow-x-auto">
									<code class="block whitespace-pre">&lt;button &#64;click="$store.notifications.notify('...')"&gt;</code>
									<code class="block whitespace-pre">{"  Notify"}</code>
									<code class="block whitespace-pre">&lt;/button&gt;</code>
									<code class="whitespace-pre">{" "}</code>
									<code class="block whitespace-pre">...</code>
									<code class="whitespace-pre">{" "}</code>
									<code class="whitespace-pre"><span class="text-[#48a9c1]">Alpine.store</span>('notifications', &#123;</code>
									<code class="whitespace-pre">{"  items: [],"}</code>
									<code class="whitespace-pre">{" "}</code>
									<code class="whitespace-pre">{"  notify(message) { "}</code>
									<code class="whitespace-pre">{"    this.items.push(message)"}</code>
									<code class="whitespace-pre">{"  }"}</code>
									<code class="whitespace-pre">&#125;)</code>
								</div>
								<div class="absolute left-3 top-3 box-content hidden h-full w-full border-r-4 border-gray-800 md:block" style="z-index: -1; margin: 0"></div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
		<section class="border-t border-gray-200 bg-gray-50/50">
			<div class="m-auto px-8 py-12 text-gray-800 md:w-[650px]">
				<p class="text-center text-xs font-semibold uppercase tracking-[0.18em] text-gray-500"> Ecosystem sponsor </p>
				<a href="https://neon.com" target="_blank" rel="noopener" class="group mt-4 flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-5 transition hover:border-gray-300 sm:flex-row sm:items-center">
					<img src="/images/sponsors/neon-light.svg" alt="Neon" class="h-8 w-auto shrink-0 self-start sm:self-center" />
					<div class="sm:border-l sm:border-gray-200 sm:pl-5">
						<p class="text-sm leading-6 text-gray-600"> Neon is a complete backend built around Lakebase Postgres, for developers, startups, and agent platforms, by Databricks. </p>
						{" "}
						<span class="mt-1.5 inline-block text-sm font-semibold text-gray-800 transition-colors group-hover:text-cyan-600"> neon.com → </span>
						{" "}
					</div>
				</a>
			</div>
		</section>
		<div class="bg-gray-800 text-white" style=" background-image: url(/repeat.svg); background-size: 297px ">
			<div class="m-auto flex flex-col items-center space-y-4 px-8 py-24 md:w-[750px]">
				<p class="font-title text-2xl leading-relaxed"> I hope you find Alpine to be a breath of fresh air. Silence among noise. <br />{" "}<br /> - <a href="https://twitter.com/calebporzio" class="underline">Caleb</a>{" "}</p>
				<p class="port-attribution" style="position: fixed; right: 8px; bottom: 8px; z-index: 50; max-width: 360px; margin: 0; padding: 6px 10px; border-radius: 6px; font: 12px/1.4 system-ui, sans-serif; text-align: left; color: #222; background: #fff; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);">Unofficial demo copy of <a style="color: #1a4fa0; text-decoration: underline;" href="https://alpinejs.dev">alpinejs.dev</a>, moved to <a style="color: #1a4fa0; text-decoration: underline;" href="https://markless.dev">Markless</a> with markless-migrate. Alpine.js and its documentation © Caleb Porzio and contributors, <a style="color: #1a4fa0; text-decoration: underline;" href="https://github.com/alpinejs/alpine/blob/main/LICENSE.md">MIT license</a>.</p>
			</div>
		</div>
	</div>
}
