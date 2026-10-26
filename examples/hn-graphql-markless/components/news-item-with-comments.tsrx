import { hide, pushLogin, upvote } from '../lib/feed.ts';
import type { ItemView } from '../lib/item.ts';
import { CommentText } from './rich-text.tsrx';

export default function NewsItemWithComments({ view, onAnswered }: { view: ItemView; onAnswered: () => void }) @{
	<tr>
		<td style="padding:0px">
			<table style="border:0px;padding:0px;border-collapse:collapse;border-spacing:0px" class="itemlist">
				<tbody>
					<tr class="athing">
						<td style="text-align:right;vertical-align:top" class="title">
							<span class="rank"></span>
						</td>
						<td style="vertical-align:top" class="votelinks">
							<div style="text-align:center">
								<a
									class={view.head.voteClass}
									style="cursor:pointer"
									onClick={async () => {
										const login = await upvote(view.head.id);
										if (login) await pushLogin(login);
										else onAnswered();
									}}
								>
									<div class="votearrow" title="upvote"></div>
								</a>
							</div>
						</td>
						<td class="title">
							<a class="storylink" href={view.head.href}>{view.head.title}</a>
							@if (view.head.host) {
								<span class="sitebit comhead">
									{' ('}
									<a href={view.head.siteHref}>
										<span class="sitestr">{view.head.host}</span>
									</a>
									{')'}
								</span>
							}
						</td>
					</tr>
					<tr>
						<td colspan="2"></td>
						<td class="subtext">
							<span class="score">{view.head.score}</span>
							{' by '}
							<a class="hnuser" href={view.head.userHref}>{view.head.submitterId}</a>
							{' '}
							<span class="age">
								<a href={view.head.itemHref}>{view.head.ago}</a>
							</span>
							{' | '}
							<a
								style="cursor:pointer"
								onClick={async () => {
									if (view.head.hidden) return;
									const login = await hide(view.head.id);
									if (login) await pushLogin(login);
									else onAnswered();
								}}
							>
								{view.head.hideLabel}
							</a>
							<span>
								{' | '}
								<a href="https://hn.algolia.com/?query=Sublime%20Text%203.0&sort=byDate&dateRange=all&type=story&storyText=false&prefix&page=0">past</a>
								{' | '}
								<a href="https://www.google.com/search?q=Sublime%20Text%203.0">web</a>
							</span>
							{' | '}
							<a href={view.head.itemHref}>{view.head.comments}</a>
							{' | favorite'}
						</td>
					</tr>
					<tr class="morespace" style="height:10px"></tr>
					<tr>
						<td colspan="2"></td>
						<td>
							<form method="post" action="comment">
								<input type="hidden" name="parent" value="15237896" />
								<input type="hidden" name="goto" value="item?id=15237896" />
								<input type="hidden" name="hmac" value="02641d0660c89c1a83ccf0d171e42497d10d2135" />
								<textarea name="text" rows="6" cols="60"></textarea>
								<br />
								<br />
								<input type="submit" value="add comment" />
							</form>
						</td>
					</tr>
				</tbody>
			</table>
			<br />
			<br />
			<table class="comment-tree" style="border:0">
				<tbody>
					@for (const comment of view.comments; key comment.key) {
						<tr class="athing comtr " id="15238246">
							<td>
								<table style="border:0">
									<tbody>
										<tr>
											<td class="ind">
												<img alt="" src="/static/s.gif" height="1" width={comment.width} />
											</td>
											<td style="vertical-align:top" class="votelinks">
												<div style="text-align:center">
													<a id="up_15238246" href="vote?id=15238246&how=up&auth=4eb97bf0d2568aa743691210b904f0c5182bb0fc&goto=item%3Fid%3D15237896#15238246">
														<div class="votearrow" title="upvote"></div>
													</a>
												</div>
											</td>
											<td class="default">
												<div style="margin-top:2px;margin-bottom:-10px">
													<span class="comhead">
														<a class="hnuser" href="/user?id=mstade">{comment.submitterId}</a>
														<span class="age">
															{' '}
															<a href={comment.itemHref}>{comment.ago}</a>
														</span>
														{' '}
														<span id="unv_15238246"></span>
														<span class="par"></span>
														{' '}
														<a class="togg" id="24">[-]</a>
														<span class="storyon"></span>
													</span>
												</div>
												<br />
												<div class="comment">
													<span class="c00">
														<CommentText blocks={comment.blocks} />
														<div class="reply">
															<p style="font-size:1">
																<u>
																	<a href={comment.replyHref}>reply</a>
																</u>
															</p>
														</div>
													</span>
												</div>
											</td>
										</tr>
									</tbody>
								</table>
							</td>
						</tr>
					}
				</tbody>
			</table>
			<br />
			<br />
		</td>
	</tr>
}
