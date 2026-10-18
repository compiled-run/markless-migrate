export async function post<T>(action: string, form: HTMLFormElement): Promise<T> {
	const response = await fetch(action, { method: 'POST', body: new FormData(form) });
	return (await response.json()) as T;
}

// Next follows a server action's redirect in place; a click on a link to the page does the same through the router.
export function go(path: string) {
	const link = document.createElement('a');
	link.href = path;
	link.hidden = true;
	document.body.append(link);
	link.click();
	link.remove();
}

let timer: ReturnType<typeof setTimeout> | undefined;

export function debounce(run: () => void, ms: number) {
	clearTimeout(timer);
	timer = setTimeout(run, ms);
}

export function replaceSearch(params: Record<string, string | undefined>) {
	const url = new URL(window.location.href);
	for (const [key, value] of Object.entries(params)) {
		if (value === undefined) url.searchParams.delete(key);
		else url.searchParams.set(key, value);
	}
	history.replaceState(history.state, '', url.pathname + url.search);
}

export async function deleteInvoice(id: string) {
	await fetch(`/api/invoices/${id}/delete`, { method: 'POST' });
}
