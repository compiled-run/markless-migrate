import type { PageProps } from '@markless/router';
import NotesLayout from '../../components/notes-layout.tsrx';

export default function NoteIndexPage({ url }: PageProps) @{
	<NotesLayout pathname={url.pathname}>
		<p>
			No note selected. Select a note on the left, or{' '}
			<a href="/notes/new" class="text-blue-500 underline">create a new note.</a>
		</p>
	</NotesLayout>
}
