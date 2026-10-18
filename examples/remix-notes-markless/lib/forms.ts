type Result = { readonly redirect?: string; readonly errors?: Record<string, string | null> };

// Posts the form to the page's own URL, query included, as Remix's <Form> does (urlencoded), asking for JSON instead of a redirect.
export async function submit(form: HTMLFormElement, action = window.location.pathname + window.location.search): Promise<Result> {
	const response = await fetch(action, {
		method: 'POST',
		headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
		body: new URLSearchParams(new FormData(form) as unknown as Record<string, string>),
	});
	return (await response.json()) as Result;
}

// Remix follows an action's redirect in place; a click on a link to the page does the same through the router.
export function go(path: string) {
	const link = document.createElement('a');
	link.href = path;
	link.hidden = true;
	document.body.append(link);
	link.click();
	link.remove();
}

// The old pages focus the first field with an error after an action answers.
export function focusError(form: HTMLFormElement, errors: Record<string, string | null> | undefined, order: readonly string[]) {
	const name = order.find((field) => errors?.[field]);
	if (name) (form.elements.namedItem(name) as HTMLElement | null)?.focus();
}
