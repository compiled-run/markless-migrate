// The settings forms' data (features/settings/*) that renders without the schemas.
export const fonts = ['inter', 'manrope', 'system'] as const;

export const languages = [
	{ label: 'English', value: 'en' },
	{ label: 'French', value: 'fr' },
	{ label: 'German', value: 'de' },
	{ label: 'Spanish', value: 'es' },
	{ label: 'Portuguese', value: 'pt' },
	{ label: 'Russian', value: 'ru' },
	{ label: 'Japanese', value: 'ja' },
	{ label: 'Korean', value: 'ko' },
	{ label: 'Chinese', value: 'zh' },
] as const;

export function cookieValue(header: string | null | undefined, name: string): string | undefined {
	const parts = `; ${header ?? ''}`.split(`; ${name}=`);
	return parts.length === 2 ? parts.pop()?.split(';').shift() : undefined;
}

export function languageLabel(value: string): string {
	return languages.find((language) => language.value === value)?.label ?? '';
}

export function toggled(items: readonly string[], id: string): string[] {
	return items.includes(id) ? items.filter((value) => value !== id) : [...items, id];
}
