export interface ProfileValues {
	readonly username: string | undefined;
	readonly email: string | undefined;
	readonly bio: string;
	readonly urls: readonly string[];
}

export interface UrlRow {
	readonly id: string;
	readonly name: string;
	readonly value: string;
	readonly error: string;
	readonly noError: boolean;
	readonly invalid: string;
	readonly describedBy: string;
	readonly labelClass: string;
	readonly descClass: string;
	readonly inputClass: string;
}

const LABEL = 'flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 data-[error=true]:text-destructive';
const INPUT = 'flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40';

export const shape = (v: ProfileValues) => ({ username: v.username, email: v.email, bio: v.bio, urls: v.urls.map((value) => ({ value })) });

export function urlRows(urls: readonly string[], errors: Record<string, string>): UrlRow[] {
	return urls.map((value, i) => {
		const error = errors[`urls.${i}.value`] ?? '';
		// The two URLs the page starts with keep the ids React's useId gave them on the old page.
		const base = i === 0 ? '_r_14_-form-item' : i === 1 ? '_r_15_-form-item' : `profile-url-${i}-form-item`;
		return {
			id: String(i),
			name: `urls.${i}.value`,
			value,
			error,
			noError: !error,
			invalid: error ? 'true' : 'false',
			describedBy: error ? `${base}-description ${base}-message` : `${base}-description`,
			labelClass: i === 0 ? LABEL : `${LABEL} sr-only`,
			descClass: i === 0 ? 'text-sm text-muted-foreground' : 'text-sm text-muted-foreground sr-only',
			inputClass: i === 0 ? INPUT : `${INPUT} mt-1.5`,
		};
	});
}

/** Fields in the order react-hook-form registered them, for focusing the first invalid one (the email Select takes no ref). */
export function firstInvalid(errors: Record<string, string>, urls: number): string | undefined {
	return ['username', 'bio', ...Array.from({ length: urls }, (_, i) => `urls.${i}.value`)].find((name) => errors[name]);
}

export function withUrl(urls: readonly string[], index: number, value: string): string[] {
	return urls.map((v, i) => (i === index ? value : v));
}

export function errorOf(errors: Record<string, string>, name: string): string {
	return errors[name] ?? '';
}

/** The field array's row at `index`, or a blank one past its end. */
export function urlRowAt(urls: readonly string[], errors: Record<string, string>, index: number): UrlRow {
	return urlRows(urls.length > index ? urls : [...urls, ...Array.from({ length: index + 1 - urls.length }, () => '')], errors)[index]!;
}
