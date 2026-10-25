import type { StoryView } from '../lib/hn.ts';
import Story from './story.tsrx';

export default function Stories({ offset, stories, more }: { readonly offset: number; readonly stories: readonly StoryView[]; readonly more: string }) @{
	<div>
		@for (const story of stories; index i; key story.id) {
			<div class="item">
				<span class="count">{i + offset + 1}</span>
				<Story id={story.id} title={story.title} url={story.url} host={story.host} hostLabel={story.hostLabel} user={story.user} score={story.score} pointWord={story.pointWord} ago={story.ago} count={story.count} commentWord={story.commentWord} />
			</div>
		}
		<div class="footer">
			<a href={more}>More</a>
		</div>
		<style>
			.item {
				display: flex;
				margin: 10px 0;
			}
			.count {
				flex-basis: auto;
				flex-grow: 1;
				font-size: 14px;
				padding-right: 5px;
				display: block;
				width: 12px;
				text-align: right;
			}
			.count::after {
				content: '.';
			}
			.footer {
				padding: 10px 0 0 32px;
			}
			.footer a {
				color: #000;
				font-size: 14px;
				display: inline-block;
				text-decoration: none;
			}
		</style>
	</div>
}
