import { pageTitle, timeAgo, isoTime, timeTitle, type User } from '../lib/hn.ts';
import { showMarkup } from '../lib/markup.ts';

export default function UserProfile({ user }: { user: User }) @{
	<div
		class="UserProfile"
		data-title={pageTitle(`Profile: ${user.id}`)}
		data-created={String(user.created * 1000)}
		attach={(element) => {
			document.title = element.getAttribute('data-title') ?? document.title;
			const created = element.querySelector('time');
			const then = Number(element.getAttribute('data-created'));
			if (created) {
				created.textContent = timeAgo(then, Date.now());
				const date = created.nextSibling;
				// React 15 renders " (", the date and ")" as three text nodes, and text breaks at their edges.
				if (date?.nodeType === Node.TEXT_NODE) date.replaceWith(' (', new Date(then).toDateString(), ')');
			}
			return showMarkup(element);
		}}
		onVisible={() => {}}
	>
		<h4>{user.id}</h4>
		<dl>
			<dt>Created</dt>
			<dd><time datetime={isoTime(user.created * 1000)} title={timeTitle(user.created * 1000)}>{timeAgo(user.created * 1000, Date.now())}</time>{` (${new Date(user.created * 1000).toDateString()})`}</dd>
			<dt>Karma</dt>
			<dd>{user.karma}</dd>
			<dt>Delay</dt>
			<dd>{user.delay}</dd>
			<dt hidden={!user.about}>About</dt>
			<dd hidden={!user.about}><div class="UserProfile__about" data-html={user.about ?? ''}></div></dd>
		</dl>
	</div>
}
