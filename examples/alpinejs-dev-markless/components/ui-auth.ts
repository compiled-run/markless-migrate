// The site's "show-auth-modal" window event: the buttons that offer access open the sign-in dialog with it.
export const AUTH_EVENT = 'show-auth-modal';
let pending = false;

export function openAuth(): void {
	pending = true;
	window.dispatchEvent(new CustomEvent(AUTH_EVENT));
}

// A click that came before the dialog was listening still opens it once it is.
export function takePendingAuth(): boolean {
	const was = pending;
	pending = false;
	return was;
}
