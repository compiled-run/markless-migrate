import type { PageProps } from '@markless/router';
import Profile from '../../../components/profile.tsrx';

export default function ProfileFavorites({ url }: PageProps<{ username: string }>) @{
	<Profile pathname={url.pathname} />
}
