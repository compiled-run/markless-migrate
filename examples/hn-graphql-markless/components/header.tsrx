import { computed } from '@markless/core';
import { Link } from '@markless/router';
import type { Session } from '../lib/session.ts';
import HeaderNav from './header-nav.tsrx';

// The page reads the session: a @try inside a child component never gets its streamed answer (repros/child-try-never-streams).
export default function Header({ session, currentUrl, isNavVisible, title }: { session: Session; currentUrl: string; isNavVisible: boolean; title: string }) @{
	const loginHref = computed(() => `/login?goto=${currentUrl}`);
	const logoutHref = computed(() => `/logout?auth=d78ccc2c6120ffe08f32451519c2ff46d34c51ab&amp;goto=${currentUrl}`);
	<tr>
		<td style="background-color:#ff6600;padding:0px">
			<table style="border:0px;padding:2px;border-spacing:0px;width:100%">
				<tbody>
					<tr>
						<td style="width:18px;padding:0px;padding-right:4px">
							<a href="/">
								<img src="/static/y18.gif" style="border:1px;border-color:white;border-style:solid;height:18px;width:18px" />
							</a>
						</td>
						<td style="line-height:12px;height:10px;padding:0px">
							<HeaderNav currentUrl={currentUrl} isNavVisible={isNavVisible} title={title} />
						</td>
						<td style="text-align:right;padding:0px;padding-right:4px">
							@if (session.signedIn) {
								<span class="pagetop">
									<a href={session.userHref}>{session.id}</a>
									{session.karma}
									<Link href={logoutHref} prefetch={false}>logout</Link>
								</span>
							} @else {
								<span class="pagetop">
									<a href={loginHref}>login</a>
								</span>
							}
						</td>
					</tr>
				</tbody>
			</table>
		</td>
	</tr>
}
