import { computed } from '@markless/core';
import type { PageProps } from '@markless/router';
import App from '../../components/App.tsrx';
import UserProfile from '../../components/UserProfile.tsrx';
import { fetchUser } from '../../lib/rest.ts';

export default function UserPage({ url, params }: PageProps<{ id: string }>) @{
	const user = computed(async () => fetchUser(params.id));

	<App path={url.pathname} search={url.search}>
		@try {
			<UserProfile user={user} />
		} @pending {
			<div class="UserProfile UserProfile--loading">
				<h4>{params.id}</h4>
				<div class="Spinner" style="width: 66px;">
					<div class="bounce1" style="height: 20px; width: 20px; margin-right: 2px;"></div>
					<div class="bounce2" style="height: 20px; width: 20px; margin-right: 2px;"></div>
					<div class="bounce3" style="height: 20px; width: 20px; margin-right: 2px;"></div>
				</div>
			</div>
		} @catch {
			<div class="UserProfile UserProfile--loading">
				<h4>{params.id}</h4>
				<div class="Spinner" style="width: 66px;">
					<div class="bounce1" style="height: 20px; width: 20px; margin-right: 2px;"></div>
					<div class="bounce2" style="height: 20px; width: 20px; margin-right: 2px;"></div>
					<div class="bounce3" style="height: 20px; width: 20px; margin-right: 2px;"></div>
				</div>
			</div>
		}
	</App>
}
