import type { PageProps } from '@markless/router';
import Profile from '../../../components/profile.tsrx';

export default function ProfilePage({ url }: PageProps<{ username: string }>) @{
	<Profile pathname={url.pathname} />
}
