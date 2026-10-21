// The profile form's values and errors (features/settings/profile/profile-form.tsx's useForm), shared by the page and
// its URL field array, in a module of their own so a field's first input loads no component code with them.
import { shared, state } from '@markless/core';
import type { ProfileValues } from '../../lib/settings/profile.ts';

export const profileForm = shared(
	() => {
		const cells = state({ values: { username: undefined, email: undefined, bio: 'I own a computer.', urls: ['https://shadcn.com', 'http://twitter.com/shadcn'] } as ProfileValues, errors: {} as Record<string, string> });
		return { ...cells };
	},
	{ scope: 'page' },
);
