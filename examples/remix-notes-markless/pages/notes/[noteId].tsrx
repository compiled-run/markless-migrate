import { computed } from '@markless/core';
import type { PageProps } from '@markless/router';
import NotesLayout from '../../components/notes-layout.tsrx';
import { loadNote } from '../../lib/load.ts';

export default function NoteDetailsPage({ url, params }: PageProps<{ noteId: string }>) @{
	const note = computed(async () => {
		const id = params.noteId;
		return loadNote(id);
	});
	<NotesLayout pathname={url.pathname}>
		@try {
			@if (note.found) {
				<div>
					<h3 class="text-2xl font-bold">{note.title}</h3>
					<p class="py-6">{note.body}</p>
					<hr class="my-4" />
					<form method="post">
						<button type="submit" class="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 focus:bg-blue-400">Delete</button>
					</form>
				</div>
			} @else {
				<div>Note not found</div>
			}
		} @pending {
			<div></div>
		}
	</NotesLayout>
}
