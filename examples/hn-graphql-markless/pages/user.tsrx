import { computed } from '@markless/core';
import type { PageProps } from '@markless/router';
import Header from '../components/header.tsrx';
import { AboutCell } from '../components/rich-text.tsrx';
import { loadUser } from '../lib/user.ts';

export default function UserPage({ url }: PageProps) @{
	const view = computed(async () => loadUser(url.search));
	@try {
		@switch (view.kind) {
			@case 'own': {
				<div>
					<title>Hacker News Clone</title>
					<link rel="stylesheet" type="text/css" href="/static/news.css" />
					<table id="hnmain" style="background-color:#f6f6ef;border:0px;border-collapse:collapse;border-spacing:0px;margin-left:auto;margin-right:auto;padding:0px;width:85%">
						<tbody>
							<Header session={view.session} currentUrl="/user" isNavVisible={true} title="Hacker News" />
							<tr style="height:10px"></tr>
								<tr>
									<td>
										<form class="profileform" method="post" action="/xuser">
											<input type="hidden" name="id" value="clintonwoo" />
											<input type="hidden" name="hmac" value="71104445c3c41b4167c38db67a656e610d5fbad9" />
											<table style="border:0px">
												<tbody>
													<tr class="athing">
														<td style="vertical-align:top">user:</td>
														<td>
															<a href="/user?id=clintonwoo" class="hnuser" style="color:#3c963c">{view.id}</a>
														</td>
													</tr>
													<tr>
														<td style="vertical-align:top">created:</td>
														<td>{view.created}</td>
													</tr>
													<tr>
														<td style="vertical-align:top">karma:</td>
														<td>{view.karma}</td>
													</tr>
													<tr>
														<td style="vertical-align:top">about:</td>
														<td>
															<textarea cols="60" name="about" rows="5" style="font-size:-2" wrap="virtual">{view.aboutText}</textarea>
															<a href="/formatdoc" tabindex="-1" style="color:#afafaf">help</a>
														</td>
													</tr>
													<tr>
														<td style="vertical-align:top">email:</td>
														<td>
															<input type="text" name="uemail" value={view.email} size="60" />
														</td>
													</tr>
													<tr>
														<td style="vertical-align:top">showdead:</td>
														<td>
															<select name="showd">
																<option value="yes">yes</option>
																<option value="no" selected>no</option>
															</select>
														</td>
													</tr>
													<tr>
														<td style="vertical-align:top">noprocrast:</td>
														<td>
															<select name="nopro">
																<option value="yes">yes</option>
																<option value="no" selected>no</option>
															</select>
														</td>
													</tr>
													<tr>
														<td style="vertical-align:top">maxvisit:</td>
														<td>
															<input type="text" name="maxv" value="20" size="16" />
														</td>
													</tr>
													<tr>
														<td style="vertical-align:top">minaway:</td>
														<td>
															<input type="text" name="mina" value="180" size="16" />
														</td>
													</tr>
													<tr>
														<td style="vertical-align:top">delay:</td>
														<td>
															<input type="text" name="delay" value="0" size="16" />
														</td>
													</tr>
													<tr>
														<td></td>
														<td>
															<a href="/changepw"><u>change password</u></a>
														</td>
													</tr>
													<tr>
														<td></td>
														<td>
															<a href="/submitted?id=clintonwoo"><u>submissions</u></a>
														</td>
													</tr>
													<tr>
														<td></td>
														<td>
															<a href="/threads?id=clintonwoo"><u>comments</u></a>
														</td>
													</tr>
													<tr>
														<td></td>
														<td>
															<a href="/hidden"><u>hidden</u></a>
														</td>
													</tr>
													<tr>
														<td></td>
														<td>
															<a href="/upvoted?id=clintonwoo"><u>upvoted submissions</u></a>
															{' / '}
															<a href="/upvoted?id=clintonwoo&comments=t"><u>comments</u></a>
															{'  '}
															<span style="font-style:italic">(private)</span>
														</td>
													</tr>
													<tr>
														<td></td>
														<td>
															<a href="/favorites?id=clintonwoo"><u>favorite submissions</u></a>
															{' / '}
															<a href="/favorites?id=clintonwoo&comments=t"><u>comments</u></a>
															{'  '}
															<span style="font-style:italic">(shared)</span>
														</td>
													</tr>
												</tbody>
											</table>
											<br />
											<input type="submit" value="update" />
										</form>
										<br />
										<br />
									</td>
								</tr>
						</tbody>
					</table>
				</div>
			}
			@case 'public': {
				<div>
					<title>Hacker News Clone</title>
					<link rel="stylesheet" type="text/css" href="/static/news.css" />
					<table id="hnmain" style="background-color:#f6f6ef;border:0px;border-collapse:collapse;border-spacing:0px;margin-left:auto;margin-right:auto;padding:0px;width:85%">
						<tbody>
							<Header session={view.session} currentUrl="/user" isNavVisible={true} title="Hacker News" />
							<tr style="height:10px"></tr>
								<tr>
									<td>
										<table style="border:0">
											<tbody>
												<tr class="athing">
													<td style="vertical-align:top">user:</td>
													<td>
														<a href={view.userHref} class="hnuser">{view.id}</a>
													</td>
												</tr>
												<tr>
													<td style="vertical-align:top">created:</td>
													<td>{view.created}</td>
												</tr>
												<tr>
													<td style="vertical-align:top">karma:</td>
													<td>{view.karma}</td>
												</tr>
												<tr>
													<td style="vertical-align:top">about:</td>
													<AboutCell blocks={view.about} />
												</tr>
												<tr>
													<td></td>
													<td>
														<a href={view.submittedHref}><u>submissions</u></a>
													</td>
												</tr>
												<tr>
													<td></td>
													<td>
														<a href={view.threadsHref}><u>comments</u></a>
													</td>
												</tr>
												<tr>
													<td></td>
													<td>
														<a href={view.favoritesHref}><u>favorites</u></a>
													</td>
												</tr>
											</tbody>
										</table>
										<br />
										<br />
									</td>
								</tr>
						</tbody>
					</table>
				</div>
			}
			@default: {
				<>
					<title>Hacker News Clone</title>
					<div class="WordSection1">No such user.</div>
				</>
			}
		}
	} @pending {
		<>
					<title>Hacker News Clone</title>
					<div class="WordSection1">No such user.</div>
				</>
	}
}
