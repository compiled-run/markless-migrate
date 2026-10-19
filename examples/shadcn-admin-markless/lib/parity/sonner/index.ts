// Parity port of sonner for the ported routes: <Toaster duration={5000}> and toast.promise(loading, success, error).
// The page owns its toasts (`let toasts = state<Toast[]>([])`), raises them from the handler that starts the work,
// and hands them to <Toaster toasts={toasts} />, which renders sonner's own markup for styles.css.
export const DURATION = 5000;

export type ToastType = 'loading' | 'success' | 'error' | 'default';

export interface Toast {
	readonly id: string;
	readonly title: string;
	readonly type: ToastType;
	readonly description?: string;
}

function put(toasts: readonly Toast[], next: Toast): Toast[] {
	return toasts.some((t) => t.id === next.id) ? toasts.map((t) => (t.id === next.id ? next : t)) : [next, ...toasts];
}

/** toast.promise's first state: the spinner and the loading message, until the promise settles. */
export function promiseLoading(toasts: readonly Toast[], id: string, title: string): Toast[] {
	return put(toasts, { id, title, type: 'loading' });
}

/** The same toast once the promise resolved. */
export function promiseSuccess(toasts: readonly Toast[], id: string, title: string): Toast[] {
	return put(toasts, { id, title, type: 'success' });
}

export function promiseError(toasts: readonly Toast[], id: string, title: string): Toast[] {
	return put(toasts, { id, title, type: 'error' });
}

/** The toasts once this one's time is up: the handler that raised it awaits DURATION and writes this back. */
export function expired(toasts: readonly Toast[], id: string): Toast[] {
	return toasts.filter((t) => t.id !== id);
}

/** toast.message(title, { description }): showSubmittedData's toast, the data as indented JSON. */
export function message(toasts: readonly Toast[], id: string, title: string, description?: string): Toast[] {
	return put(toasts, { id, title, type: 'default', ...(description ? { description } : {}) });
}
