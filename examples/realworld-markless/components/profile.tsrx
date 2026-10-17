import { element } from '@markless/core';
import { bootProfile, profileClick } from '../lib/pages.ts';
import Layout from './layout.tsrx';

export default function Profile({ pathname }: { pathname: string }) @{
	const root = element<HTMLDivElement>();

	<Layout>
		<app-profile-page>
			<div
				el={root}
				class="profile-page"
				onVisible={() => {
					const node = root;
					void bootProfile(node);
				}}
				onClick={(event) => void profileClick(event)}
			></div>
		</app-profile-page>
	</Layout>
}
