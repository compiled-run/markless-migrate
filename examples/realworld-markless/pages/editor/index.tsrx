import type { PageProps } from '@markless/router';
import Editor from '../../components/editor.tsrx';

export default function NewArticle({ url }: PageProps) @{
	<Editor pathname={url.pathname} />
}
