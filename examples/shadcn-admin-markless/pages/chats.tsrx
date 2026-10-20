import { computed, element, state } from '@markless/core';
import type { PageProps } from '@markless/router';
import { Shell } from '../components/layout/shell.tsrx';
import { layoutPrefs } from '../components/layout/prefs.ts';
import { DialogClose, DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from '../lib/ports/radix-ui-react-dialog/dialog.tsrx';
import { DURATION, expired, message, type Toast } from '../lib/parity/sonner/index.ts';
import { Toaster } from '../lib/parity/sonner/toaster.tsrx';
import { hideScrollbar, markActive, markChat, markChosen, placeThumb, showScrollbar } from '../lib/chats-dom.ts';
import { chatList, chatUser, chosenUsers, commandOrder, commandUsers, conversation, firstOf, initials, moveActive, submitted, toggleChosen } from '../lib/chats.ts';

export default function Chats({ http }: PageProps) @{
	const prefs = layoutPrefs(http.request.headers.get('cookie'));
	let search = state('');
	let selected = state('');
	let mobile = state(false);
	let newChatOpen = state(false);
	let query = state('');
	let order = state(commandOrder('', ''));
	let active = state(firstOf(commandOrder('', '')));
	let chosen = state('');
	let toasts = state<Toast[]>([]);
	const commandList = element<HTMLDivElement>();
	const chatListEl = element<HTMLDivElement>();
	const scrollRoot = element<HTMLDivElement>();

	const list = computed(() => chatList(search));
	const user = computed(() => chatUser(selected));
	const hasUser = computed(() => selected !== '');
	const userName = computed(() => (user ? user.fullName : ''));
	const userTitle = computed(() => (user ? user.title : ''));
	const userProfile = computed(() => (user ? user.profile : ''));
	const userHandle = computed(() => (user ? user.username : ''));
	const paneClass = computed(() => (mobile ? 'absolute inset-0 z-50 w-full flex-1 flex-col border bg-background shadow-xs sm:static sm:z-auto sm:flex sm:rounded-md inset-s-0 flex' : 'absolute inset-0 start-full z-50 hidden w-full flex-1 flex-col border bg-background shadow-xs sm:static sm:z-auto sm:flex sm:rounded-md'));
	const items = computed(() => conversation(selected));
	const people = computed(() => commandUsers(order));
	const picked = computed(() => chosenUsers(chosen));
	const noPeople = computed(() => order === '');
	const noChosen = computed(() => chosen === '');
	const activeId = computed(() => (active && order.split(',').includes(active) ? `new-chat-item-${active}` : undefined));

	<Shell active="/chats" header="search" fixed={false} prefs={prefs}>
		<main data-layout="fixed" class="px-4 py-6 flex grow flex-col overflow-hidden @7xl/content:mx-auto @7xl/content:w-full @7xl/content:max-w-7xl">
			<section class="flex h-full gap-6">
				<div class="flex w-full flex-col gap-2 sm:w-56 lg:w-72 2xl:w-80">
					<div class="sticky top-0 z-10 -mx-4 bg-background px-4 pb-3 shadow-md sm:static sm:z-auto sm:mx-0 sm:p-0 sm:shadow-none">
						<div class="flex items-center justify-between py-2">
							<div class="flex gap-2">
								<h1 class="text-2xl font-bold">Inbox</h1>
								<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-messages-square" aria-hidden="true"><path d="M16 10a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 14.286V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /><path d="M20 9a2 2 0 0 1 2 2v10.286a.71.71 0 0 1-1.212.502l-2.202-2.202A2 2 0 0 0 17.172 19H10a2 2 0 0 1-2-2v-1" /></svg>
							</div>
							<button data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 size-9 rounded-lg" onClick={() => {
								newChatOpen = true;
								query = '';
								order = commandOrder('', '');
								active = firstOf(order);
								chosen = '';
								markActive(commandList, active);
								markChosen(commandList, chosen);
								setTimeout(() => markActive(commandList, active));
							}}>
								<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-square-pen stroke-muted-foreground" aria-hidden="true"><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z" /></svg>
							</button>
						</div>
						<label class="focus-within:ring-1 focus-within:ring-ring focus-within:outline-hidden flex h-10 w-full items-center space-x-0 rounded-md border border-border ps-2">
							<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-search me-2 stroke-slate-500" aria-hidden="true"><path d="m21 21-4.34-4.34" /><circle cx="11" cy="11" r="8" /></svg>
							<span class="sr-only">Search</span>
							<input class="w-full flex-1 bg-inherit text-sm focus-visible:outline-hidden" placeholder="Search chat..." type="text" value={search} onInput={(event) => {
								search = (event.target as HTMLInputElement).value;
								setTimeout(() => markChat(chatListEl, selected));
							}} />
						</label>
					</div>
					<div el={scrollRoot} onPointerenter={() => showScrollbar(scrollRoot)} onPointerleave={() => hideScrollbar(scrollRoot)} dir="ltr" data-slot="scroll-area" class="relative -mx-3 h-full overflow-scroll p-3" style="position: relative; --radix-scroll-area-corner-width: 0px; --radix-scroll-area-corner-height: 0px;">
						<div onScroll={() => placeThumb(scrollRoot)} data-radix-scroll-area-viewport="" data-slot="scroll-area-viewport" class="size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1" style="overflow: hidden scroll;">
							<div style="min-width: 100%; display: table;" el={chatListEl}>
								@for (const chat of list; key chat.id) {
									<div class="contents">
									<button type="button" data-chat={chat.id} class="group hover:bg-accent hover:text-accent-foreground flex w-full rounded-md px-2 py-2 text-start text-sm" onClick={() => {
										selected = chat.id;
										mobile = true;
										markChat(chatListEl, chat.id);
									}}>
										<div class="flex gap-2">
											<span data-slot="avatar" class="relative flex size-8 shrink-0 overflow-hidden rounded-full">
												<img data-slot="avatar-image" class="aspect-square size-full" alt={chat.username} src={chat.profile} />
											</span>
											<div>
												<span class="col-start-2 row-span-2 font-medium">{chat.fullName}</span>
												<span class="col-start-2 row-span-2 row-start-2 line-clamp-2 text-ellipsis text-muted-foreground group-hover:text-accent-foreground/90">{chat.lastMsg}</span>
											</div>
										</div>
									</button>
									<div data-orientation="horizontal" role="none" data-slot="separator" class="shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-px my-1"></div>
									</div>
								}
							</div>
						</div>
						<div hidden data-orientation="vertical" data-state="visible" data-slot="scroll-area-scrollbar" class="flex touch-none p-px transition-colors select-none h-full w-2.5 border-l border-l-transparent" style="position: absolute; top: 0px; right: 0px; bottom: var(--radix-scroll-area-corner-height);">
							<div data-state="visible" data-slot="scroll-area-thumb" class="relative flex-1 rounded-full bg-border" style="width: var(--radix-scroll-area-thumb-width); height: var(--radix-scroll-area-thumb-height); transform: translate3d(0px, 0px, 0px);"></div>
						</div>
					</div>
				</div>
					<div class={paneClass} hidden={!hasUser}>
						<div class="mb-1 flex flex-none justify-between bg-card p-4 shadow-lg sm:rounded-t-md">
							<div class="flex gap-3">
								<button data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 size-9 -ms-2 h-full sm:hidden" onClick={() => (mobile = false)}>
									<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-left rtl:rotate-180" aria-hidden="true"><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></svg>
								</button>
								<div class="flex items-center gap-2 lg:gap-4">
									<span data-slot="avatar" class="relative flex shrink-0 overflow-hidden rounded-full size-9 lg:size-11">
										<img data-slot="avatar-image" class="aspect-square size-full" alt={userHandle} src={userProfile || undefined} />
									</span>
									<div>
										<span class="col-start-2 row-span-2 text-sm font-medium lg:text-base">{userName}</span>
										<span class="col-start-2 row-span-2 row-start-2 line-clamp-1 block max-w-32 text-xs text-nowrap text-ellipsis text-muted-foreground lg:max-w-none lg:text-sm">{userTitle}</span>
									</div>
								</div>
							</div>
							<div class="-me-1 flex items-center gap-1 lg:gap-2">
								<button data-slot="button" class="items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 hidden size-8 rounded-full sm:inline-flex lg:size-10">
									<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-video stroke-muted-foreground" aria-hidden="true"><path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" /><rect x="2" y="6" width="14" height="12" rx="2" /></svg>
								</button>
								<button data-slot="button" class="items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 hidden size-8 rounded-full sm:inline-flex lg:size-10">
									<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-phone stroke-muted-foreground" aria-hidden="true"><path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384" /></svg>
								</button>
								<button data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 size-9 h-10 rounded-md sm:h-8 sm:w-4 lg:h-10 lg:w-6">
									<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-ellipsis-vertical stroke-muted-foreground sm:size-5" aria-hidden="true"><circle cx="12" cy="12" r="1" /><circle cx="12" cy="5" r="1" /><circle cx="12" cy="19" r="1" /></svg>
								</button>
							</div>
						</div>
						<div class="flex flex-1 flex-col gap-2 rounded-md px-4 pt-0 pb-4">
							<div class="flex size-full flex-1">
								<div class="chat-text-container relative -me-4 flex flex-1 flex-col overflow-y-hidden">
									<div class="chat-flex flex h-40 w-full grow flex-col-reverse justify-start gap-4 overflow-y-auto py-2 pe-4 pb-4">
										@for (const item of items; key item.key) {
											<div class={item.cls}>{item.text}<span class={item.timeCls} hidden={item.day}>{item.time}</span></div>
										}
									</div>
								</div>
							</div>
							<form class="flex w-full flex-none gap-2">
								<div class="flex flex-1 items-center gap-2 rounded-md border border-input bg-card px-2 py-1 focus-within:ring-1 focus-within:ring-ring focus-within:outline-hidden lg:gap-4">
									<div class="space-x-1">
										<button data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 size-9 h-8 rounded-md" type="button">
											<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-plus stroke-muted-foreground" aria-hidden="true"><path d="M5 12h14" /><path d="M12 5v14" /></svg>
										</button>
										<button data-slot="button" class="items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 size-9 hidden h-8 rounded-md lg:inline-flex" type="button">
											<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-image-plus stroke-muted-foreground" aria-hidden="true"><path d="M16 5h6" /><path d="M19 2v6" /><path d="M21 11.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7.5" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /><circle cx="9" cy="9" r="2" /></svg>
										</button>
										<button data-slot="button" class="items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 size-9 hidden h-8 rounded-md lg:inline-flex" type="button">
											<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-paperclip stroke-muted-foreground" aria-hidden="true"><path d="m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551" /></svg>
										</button>
									</div>
									<label class="flex-1">
										<span class="sr-only">Chat Text Box</span>
										<input placeholder="Type your messages..." class="h-8 w-full bg-inherit focus-visible:outline-hidden" type="text" />
									</label>
									<button data-slot="button" class="items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 size-9 hidden sm:inline-flex">
										<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-send" aria-hidden="true"><path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" /><path d="m21.854 2.147-10.94 10.939" /></svg>
									</button>
								</div>
								<button data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 px-4 py-2 has-[>svg]:px-3 h-full sm:hidden">
									<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-send" aria-hidden="true"><path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" /><path d="m21.854 2.147-10.94 10.939" /></svg>
									 Send
								</button>
							</form>
						</div>
					</div>
					<div hidden={hasUser} class="absolute inset-0 start-full z-50 hidden w-full flex-1 flex-col justify-center rounded-md border bg-card shadow-xs sm:static sm:z-auto sm:flex">
						<div class="flex flex-col items-center space-y-6">
							<div class="flex size-16 items-center justify-center rounded-full border-2 border-border">
								<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-messages-square size-8" aria-hidden="true"><path d="M16 10a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 14.286V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /><path d="M20 9a2 2 0 0 1 2 2v10.286a.71.71 0 0 1-1.212.502l-2.202-2.202A2 2 0 0 0 17.172 19H10a2 2 0 0 1-2-2v-1" /></svg>
							</div>
							<div class="space-y-2 text-center">
								<h1 class="text-xl font-semibold">Your messages</h1>
								<p class="text-sm text-muted-foreground">Send a message to start a chat.</p>
							</div>
							<button data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 h-9 px-4 py-2 has-[>svg]:px-3" onClick={() => {
								newChatOpen = true;
								query = '';
								order = commandOrder('', '');
								active = firstOf(order);
								chosen = '';
								markActive(commandList, active);
								markChosen(commandList, chosen);
								setTimeout(() => markActive(commandList, active));
							}}>Send message</button>
						</div>
					</div>
			</section>
		</main>
		<DialogRoot open={newChatOpen} onOpenChange={(next: boolean) => { newChatOpen = next; if (!next) chosen = ''; }}>
			<DialogPortal>
				<DialogOverlay data-slot="dialog-overlay" class="fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"></DialogOverlay>
				<DialogContent data-slot="dialog-content" class="fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-background p-6 shadow-lg duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:max-w-150">
					<div data-slot="dialog-header" class="flex flex-col gap-2 text-center sm:text-start">
						<DialogTitle data-slot="dialog-title" class="text-lg leading-none font-semibold">New message</DialogTitle>
					</div>
					<div class="flex flex-col gap-4">
						<div class="flex flex-wrap items-baseline-last gap-2">
							<span class="min-h-6 text-sm text-muted-foreground">To:</span>
							@for (const person of picked; key person.id) {
								<span data-slot="badge" class="inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90">{person.fullName}<button class="ms-1 rounded-full ring-offset-background outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2" onKeydown={(event) => {
									if (event.key === 'Enter') {
										chosen = toggleChosen(chosen, person.id);
										markChosen(commandList, chosen);
									}
								}} onClick={() => {
									chosen = toggleChosen(chosen, person.id);
									markChosen(commandList, chosen);
								}}><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x h-3 w-3 text-muted-foreground hover:text-foreground" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg></button></span>
							}
						</div>
						<div tabindex="-1" data-slot="command" class="flex h-full w-full flex-col overflow-hidden bg-popover text-popover-foreground rounded-lg border" cmdk-root="" onKeydown={(event) => {
							if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End' || event.key === 'Enter') event.preventDefault();
							if (event.key === 'Enter') {
								if (active && order.split(',').includes(active)) {
									chosen = toggleChosen(chosen, active);
									markChosen(commandList, chosen);
								}
							} else if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
								active = moveActive(order, active, event.key);
								markActive(commandList, active);
							}
						}}>
							<label cmdk-label="" for="new-chat-input" id="new-chat-label" style="position: absolute; width: 1px; height: 1px; padding: 0px; margin: -1px; overflow: hidden; clip: rect(0px, 0px, 0px, 0px); white-space: nowrap; border-width: 0px;"></label>
							<div data-slot="command-input-wrapper" class="flex h-9 items-center gap-2 border-b px-3">
								<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-search size-4 shrink-0 opacity-50" aria-hidden="true"><path d="m21 21-4.34-4.34" /><circle cx="11" cy="11" r="8" /></svg>
								<input data-slot="command-input" class="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-hidden placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 text-foreground" placeholder="Search people..." cmdk-input="" autocomplete="off" autocorrect="off" spellcheck="false" aria-autocomplete="list" role="combobox" aria-expanded="true" aria-controls="new-chat-list" aria-labelledby="new-chat-label" aria-activedescendant={activeId} id="new-chat-input" type="text" value={query} onInput={(event) => {
									query = (event.target as HTMLInputElement).value;
									order = commandOrder(order, query);
									active = firstOf(order);
									markActive(commandList, active);
									setTimeout(() => {
										markActive(commandList, active);
										markChosen(commandList, chosen);
									});
								}} />
							</div>
							<div data-slot="command-list" class="max-h-75 scroll-py-1 overflow-x-hidden overflow-y-auto" cmdk-list="" role="listbox" tabindex="-1" aria-label="Suggestions" id="new-chat-list" el={commandList}>
								<div cmdk-list-sizer="">
									<div data-slot="command-empty" class="py-6 text-center text-sm" cmdk-empty="" role="presentation" hidden={!noPeople}>No people found.</div>
									<div data-slot="command-group" class="overflow-hidden p-1 text-foreground **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:py-1.5 **:[[cmdk-group-heading]]:text-xs **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:text-muted-foreground" cmdk-group="" role="presentation" data-value="undefined" hidden={noPeople}>
										<div cmdk-group-items="" role="group">
											@for (const person of people; key person.id) {
												<div data-slot="command-item" class="relative cursor-default rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground flex items-center justify-between gap-2 hover:bg-accent hover:text-accent-foreground" id={person.domId} cmdk-item="" role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false" data-value={person.value} onPointermove={() => {
													active = person.id;
													markActive(commandList, active);
												}} onClick={() => {
													chosen = toggleChosen(chosen, person.id);
													markChosen(commandList, chosen);
												}}>
													<div class="flex items-center gap-2">
														<img alt={person.fullName} class="h-8 w-8 rounded-full" src={person.profile} />
														<div class="flex flex-col">
															<span class="text-sm font-medium">{person.fullName}</span>
															<span class="text-xs text-accent-foreground/70">{person.username}</span>
														</div>
													</div>
													<svg style="display: none" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check h-4 w-4" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
												</div>
											}
										</div>
									</div>
								</div>
							</div>
						</div>
						<button data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 h-9 px-4 py-2 has-[>svg]:px-3" disabled={noChosen} onClick={() => {
							const id = `chat-${Date.now()}`;
							toasts = message(toasts, id, 'You submitted the following values:', submitted(chosen));
							setTimeout(() => {
								toasts = expired(toasts, id);
							}, DURATION);
						}}>Chat</button>
					</div>
					<DialogClose data-slot="dialog-close" class="absolute inset-e-4 top-4 rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4">
						<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
						<span class="sr-only">Close</span>
					</DialogClose>
				</DialogContent>
			</DialogPortal>
		</DialogRoot>
		<Toaster toasts={toasts} extra={true} />
	</Shell>
}
