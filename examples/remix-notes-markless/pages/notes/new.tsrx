import type { PageProps } from '@markless/router';
import NotesLayout from '../../components/notes-layout.tsrx';
import NewNoteForm from '../../components/new-note-form.tsrx';

export default function NewNotePage({ url }: PageProps) @{
	<NotesLayout pathname={url.pathname}>
		<NewNoteForm />
	</NotesLayout>
}
