import type { PageProps } from '@markless/router';
import Auth from '../components/auth.tsrx';

export default function Register({ url }: PageProps) @{
	<Auth pathname={url.pathname} register={true} />
}
