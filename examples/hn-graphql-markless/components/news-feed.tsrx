import type { Children } from '@markless/core';
import { feedAction, hide, pushLogin, upvote, type Feed } from '../lib/feed.ts';

// One handler on the <tbody>, not one per row: a row that is a fragment of <tr>s loses its handlers (repros/pages/fragment-row-handlers).
/** `onAnswered` runs after a mutation answers, so the page asks for its data again. */
export default function NewsFeed({ feed, onAnswered, children }: { feed: Feed; onAnswered: () => void; children?: Children }) @{
	<tr>
		<td style="padding:0px">
			<table style="border:0px;padding:0px;border-collapse:collapse;border-spacing:0px" class="itemlist">
				<tbody
					onClick={async (event) => {
						const action = feedAction(event.target);
						if (!action) return;
						const login = await (action.kind === 'upvote' ? upvote(action.id) : hide(action.id));
						if (login) await pushLogin(login);
						else onAnswered();
					}}
				>
					{children}
					@for (const row of feed.rows; key row.id) {
						<>
							<tr class="athing">
								<td style="text-align:right;vertical-align:top" class="title">
									<span class="rank">{row.rank}</span>
								</td>
								<td style="vertical-align:top" class="votelinks">
									<div style="text-align:center">
										<a class={row.voteClass} style="cursor:pointer">
											<div class="votearrow" title="upvote"></div>
										</a>
									</div>
								</td>
								<td class="title">
									<a class="storylink" href={row.href}>{row.title}</a>
									@if (row.host) {
										<span class="sitebit comhead">
											{' ('}
											<a href={row.siteHref}>
												<span class="sitestr">{row.host}</span>
											</a>
											{')'}
										</span>
									}
								</td>
							</tr>
							<tr>
								<td colspan="2"></td>
								<td class="subtext">
									<span class="score">{row.score}</span>
									{' by '}
									<a class="hnuser" href={row.userHref}>{row.submitterId}</a>
									{' '}
									<span class="age">
										<a href={row.itemHref}>{row.ago}</a>
									</span>
									{' | '}
									<a style="cursor:pointer">hide</a>
									{' | '}
									<a href={row.itemHref}>{row.comments}</a>
								</td>
							</tr>
							<tr class="spacer" style="height:5px"></tr>
						</>
					}
					<tr class="morespace" style="height:10px"></tr>
					<tr>
						<td colspan="2"></td>
						<td class="title">
							<a href={feed.more} class="morelink" rel="nofollow">
								More
							</a>
						</td>
					</tr>
				</tbody>
			</table>
		</td>
	</tr>
}
