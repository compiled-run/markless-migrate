import { graphql } from './graphql.ts';
import { SUBMIT_NEWS_ITEM_MUTATION } from './queries.ts';

// The old onCompleted read res.data, which Apollo's onCompleted never has, so a submit never navigated; onError logged.
// Apollo sends only the variables the operation declares, so the text box never left the page.
export async function submitNewsItem(title: string, url: string): Promise<void> {
	const result = await graphql(SUBMIT_NEWS_ITEM_MUTATION, { title, url });
	if (result.errors?.length) console.error(new Error(result.errors[0]!.message));
}
