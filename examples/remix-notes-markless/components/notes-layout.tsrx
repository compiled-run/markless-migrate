import type { Children } from '@markless/core';
import { computed } from '@markless/core';
import { loadNotes } from '../lib/load.ts';
import { go, submit } from '../lib/forms.ts';
import { noteLinkClass, noteLinkCurrent } from '../lib/nav.ts';

export default function NotesLayout({ pathname, children }: { readonly pathname: string; readonly children?: Children }) @{
	const email = computed(async () => (await loadNotes()).email);
	const data = computed(async () => {
		const path = pathname;
		const notes = await loadNotes();
		return { ...notes, listHidden: notes.notes.length === 0, links: notes.notes.map((note) => ({ id: note.id, title: note.title, href: `/notes/${note.id}`, className: noteLinkClass(path, note.id), current: noteLinkCurrent(path, note.id) })) };
	});
	<div class="flex h-full min-h-screen flex-col">
		<header class="flex items-center justify-between bg-slate-800 p-4 text-white">
			<h1 class="text-3xl font-bold">
				<a href="/notes">Notes</a>
			</h1>
			@try {
				<p>{email}</p>
			} @pending {
				<p></p>
			}
			<form
				action="/logout"
				method="post"
				onSubmit={(event) => {
					event.preventDefault();
					void submit(event.target as HTMLFormElement, '/logout').then((result) => {
						if (result.redirect) go(result.redirect);
					});
				}}
			>
				<button type="submit" class="rounded bg-slate-600 px-4 py-2 text-blue-100 hover:bg-blue-500 active:bg-blue-600">Logout</button>
			</form>
		</header>
		<main class="flex h-full bg-white">
			<div class="h-full w-80 border-r bg-gray-50">
				<a href="/notes/new" class="block p-4 text-xl text-blue-500">+ New Note</a>
				<hr />
				@try {
					<>
						@for (const message of data.empty; key message) {
							<p class="p-4">{message}</p>
						}
						<ol hidden={data.listHidden}>
							@for (const link of data.links; key link.id) {
								<li>
									<a class={link.className} aria-current={link.current} href={link.href}>📝 {link.title}</a>
								</li>
							}
						</ol>
					</>
				} @pending {
					<ol></ol>
				}
			</div>
			<div class="flex-1 p-6">{children}</div>
		</main>
	</div>
}
