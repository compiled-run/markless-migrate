import { computed } from '@markless/core';
import type { PageProps } from '@markless/router';
import CommentForm from '../../components/comment-form.tsrx';
import Comment from '../../components/comment.tsrx';
import Footer from '../../components/footer.tsrx';
import Layout from '../../components/layout.tsrx';
import ServerInfo from '../../components/server-info.tsrx';
import Skeletons from '../../components/skeletons.tsrx';
import Story from '../../components/story.tsrx';
import { itemWithComments } from '../../lib/hn.ts';

// One boundary for the story and its comments: a @try nested in another never streams the outer one (repros/pages/nested-try.tsrx).
export default function ItemPage({ params, http }: PageProps<{ id: string }>) @{
	// Next serves these ISR pages with revalidate: 10.
	http.response.headers.set('cache-control', 's-maxage=10, stale-while-revalidate');
	const thread = computed(async () => itemWithComments(params.id));
	<Layout>
		@try {
			<>
				<div class="item">
					<Story id={thread.story.id} title={thread.story.title} url={thread.story.url} host={thread.story.host} hostLabel={thread.story.hostLabel} user={thread.story.user} score={thread.story.score} pointWord={thread.story.pointWord} ago={thread.story.ago} count={thread.story.count} commentWord={thread.story.commentWord} />
					<div class="form">
						<CommentForm />
					</div>
					<div class="comments">
						@for (const comment of thread.comments; key comment.id) {
							<Comment user={comment.user} ago={comment.ago} text={comment.text} collapsed={comment.collapsed} comments={comment.comments} />
						}
					</div>
				</div>
				<Footer />
				<ServerInfo />
			</>
		} @pending {
			<div class="item">
				<Skeletons />
			</div>
		} @catch {
			<>
				<span>Application error: a server-side exception has occurred</span>
				<Footer />
				<ServerInfo />
			</>
		}
		<style>
			.item {
				padding: 10px 20px;
			}
			.form {
				padding: 15px 0 30px 0;
			}
			.comments {
				padding: 10px 0 20px;
			}
			@media (max-width: 750px) {
				.item {
					padding: 8px 0px;
				}
			}
		</style>
	</Layout>
}
