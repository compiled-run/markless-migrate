import { computed } from '@markless/core';
import Footer from '../components/footer.tsrx';
import Header from '../components/header.tsrx';
import { loadSession, signedOut } from '../lib/session.ts';

// The old page asks for the comment and draws none of it: this fixed markup is all it ever shows.

function Content() @{
	<>
		<tr>
			<td>
				<table class="fatitem" style="border:0">
					<tbody>
						<tr class="athing" id="15260438">
							<td class="ind" />
							<td style="vertical-align:top" class="votelinks">
								<div style="text-align:center">
									<a
										id="up_15260438"
										onClick={() => console.log('onclick')}
										href="vote?id=15260438&how=up&auth=82a0b28fffc36f0d2f3e733c3a339bb29315dd10&goto=reply%3Fgoto%3Ditem%3Fid%3D15260384%2315260438%26id%3D15260438#15260438"
									>
										<div class="votearrow" title="upvote" />
									</a>
								</div>
							</td>
							<td class="default">
								<div style="margin-top:2px;margin-bottom:-10px">
									<span class="comhead">
										<a href="user?id=philipkglass" class="hnuser">
											philipkglass
										</a>
										<span class="age">
											<a href="item?id=15260438">2 hours ago</a>
										</span>
										<span id="unv_15260438" />
										<span class="par">
											{' '}
											| <a href="item?id=15260384">parent</a>
										</span>
										<a class="togg" onClick={() => console.log('toggle')} />
										<span class="storyon">
											{' '}
											| on:{' '}
											<a href="item?id=15260384">
												Electric dump truck stores as much energy as 8 Mod...
											</a>
										</span>
									</span>
								</div>
								<br />
								<div class="comment">
									<span class="c00">
										<i>
											Because the vehicle is electric, there is no need to “heat up” the brakes
											when descending. This is because the enormous electric engine acts as a
											generator and recharges the battery pack. That same energy is then used to
											help the vehicle travel back up the hill. Phys reports, “If all goes as
											planned, the electric dumper truck will even harvest more electricity while
											traveling downhill than it needs for the ascent. Instead of consuming fossil
											fuels, it would then feed surplus electricity into the grid.”
										</i>
										<p>
											Clever. It can do this because it travels uphill empty and comes downhill
											full.
											<span />
										</p>
										<div class="reply" />
									</span>
								</div>
							</td>
						</tr>
						<tr style="height:10px" />
						<tr>
							<td colspan="2" />
							<td>
								<form method="post" action="comment">
									<input type="hidden" name="parent" value="15260438" />
									<input type="hidden" name="goto" value="item?id=15260384#15260438" />
									<input
										type="hidden"
										name="hmac"
										value="d4cda96b7000a0e0cd578dde21feb6c9070cda8a"
									/>
									<textarea name="text" rows="6" cols="60" />
									<br />
									<br />
									<input type="submit" value="reply" />
								</form>
							</td>
						</tr>
					</tbody>
				</table>
			</td>
		</tr>
	</>
}

export default function Page() @{
	const session = computed(async () => loadSession());
	<div>
		<title>Hacker News Clone</title>
		<link rel="stylesheet" type="text/css" href="/static/news.css" />
		<table id="hnmain" style="background-color:#f6f6ef;border:0px;border-collapse:collapse;border-spacing:0px;margin-left:auto;margin-right:auto;padding:0px;width:85%">
			<tbody>
				@try {
					<Header session={session} currentUrl="/reply" isNavVisible={false} title="Add Comment" />
				} @pending {
					<Header session={signedOut} currentUrl="/reply" isNavVisible={false} title="Add Comment" />
				}
				<tr style="height:10px"></tr>
				<Content />
				<Footer />
			</tbody>
		</table>
	</div>
}
