import type { PageProps } from '@markless/router';
import Editor from '../../components/editor.tsrx';

export default function EditArticle({ url }: PageProps<{ slug: string }>) @{
	<Editor pathname={url.pathname} />
}
