import type { PageProps } from '@markless/router';
import Auth from '../components/auth.tsrx';

export default function Login({ url }: PageProps) @{
	<Auth pathname={url.pathname} register={false} />
}
