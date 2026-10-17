import { state } from '@markless/core';
import { focusError, go, submit } from '../lib/forms.ts';

export default function NewNoteForm() @{
	let titleError = state('');
	let bodyError = state('');
	<form
		method="post"
		action="/notes/new"
		style="display:flex;flex-direction:column;gap:8px;width:100%"
		onSubmit={(event) => {
			event.preventDefault();
			const form = event.target as HTMLFormElement;
			void submit(form).then((result) => {
				if (result.redirect) return go(result.redirect);
				titleError = result.errors?.title ?? '';
				bodyError = result.errors?.body ?? '';
				focusError(form, result.errors, ['title', 'body']);
			});
		}}
	>
		<div>
			<label class="flex w-full flex-col gap-1">
				<span>Title: </span>
				<input name="title" class="flex-1 rounded-md border-2 border-blue-500 px-3 text-lg leading-loose" aria-invalid={titleError ? 'true' : undefined} aria-errormessage={titleError ? 'title-error' : undefined} />
			</label>
			@if (titleError) {
					<div class="pt-1 text-red-700" id="title-error">{titleError}</div>
				}
		</div>
		<div>
			<label class="flex w-full flex-col gap-1">
				<span>Body: </span>
				<textarea name="body" rows="8" class="w-full flex-1 rounded-md border-2 border-blue-500 px-3 py-2 text-lg leading-6" aria-invalid={bodyError ? 'true' : undefined} aria-errormessage={bodyError ? 'body-error' : undefined}></textarea>
			</label>
			@if (bodyError) {
					<div class="pt-1 text-red-700" id="body-error">{bodyError}</div>
				}
		</div>
		<div class="text-right">
			<button type="submit" class="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 focus:bg-blue-400">Save</button>
		</div>
	</form>
}
