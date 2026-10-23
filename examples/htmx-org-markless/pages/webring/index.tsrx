import { element, state } from '@markless/core';
import SiteFooter from '../../components/site-footer.tsrx';
import SiteHeader from '../../components/site-header.tsrx';
import { hide, queueLast, randomOther, ringLinks, show, step, transition, visit } from '../../components/webring.ts';

// Ported by hand from htmx.org's page (www/content/webring.md): what its _hyperscript did is components/webring.ts, with
// each link's own :index as state here. The _ attributes stay as the old page's markup has them; nothing reads them.
export default function Page() @{
	const webring = element<HTMLIFrameElement>();
	const ringTable = element<HTMLElement>();
	const siteTable = element<HTMLElement>();
	const showSites = element<HTMLElement>();
	const returnToWebring = element<HTMLElement>();
	const navigator = element<HTMLElement>();
	let prevIndex = state<number | undefined>(undefined);
	let randomIndex = state<number | undefined>(undefined);
	let nextIndex = state<number | undefined>(undefined);
	<div style="display: contents">
		<SiteHeader />
		<main class="c content ">
			<h1>htmx webring</h1>
			{" "}
			{" "}
			<div id="webring-div">{" "}<table id="nav-table" style="border: black 4px double; text-align: center">{" "}<tbody><tr>{" "}<td class="built-with-tds" style="border: 1px black solid">{" "}<img width="200px" src="/img/createdwith.jpeg" alt="Site created with htmx, The Right Way." />{" "}</td>{" "}<td width="70%" style="text-align: center; font-size: 20px; border: 1px black solid">{" This Great "}<a href="https://htmx.org">htmx</a>{" Webring site is owned by "}<a href="https://bigsky.software">Your Name Here</a>{". "}</td>{" "}<td class="built-with-tds" style="; border: 1px black solid">{" "}<img width="200px" src="/img/createdwith.jpeg" alt="Site created with htmx, The Right Way." />{" "}</td>{" "}</tr>{" "}<tr>{" "}<td colspan="3" style="text-align: center; ; border: 1px black solid; position: relative">{" ["}<a class="nav-link" href="#" onClick={() => {
				const count = ringLinks(ringTable!).length;
				prevIndex = step(prevIndex, -1, count);
				console.log(prevIndex);
				visit(webring!, ringTable!, navigator!, prevIndex);
			}} _={"on click\n             set links to <a/> in the #ring-table\n             decrement :index\n             if :index is -1\n                get the length of the links\n                set :index to the result - 1 \n             end\n             log :index\n             get links[:index]\n             set the #webring's src to the result's @href\n             "}>Prev</a>][<a href="#" class="nav-link" onClick={() => {
				randomIndex = randomOther(randomIndex, ringLinks(ringTable!).length);
				visit(webring!, ringTable!, navigator!, randomIndex);
			}} _={"on click\n             set links to <a/> in the #ring-table\n             get the :index\n             repeat until the result is not :index\n                get Math.floor(Math.random() * length of the links)\n             end\n             set the :index to the result\n             get links[:index]\n             set the #webring's src to the result's @href\n             "}>Random</a>][<a href="#" class="nav-link" onClick={() => {
				nextIndex = step(nextIndex, 1, ringLinks(ringTable!).length);
				visit(webring!, ringTable!, navigator!, nextIndex);
			}} _={"on click\n             set links to <a/> in the #ring-table\n             increment :index\n             if :index is length of the links\n                set :index to 0\n             end\n             get links[:index]\n             set the #webring's src to the result's @href\n             "}>Next</a>]<br />{" ["}<a href="#" id="show-sites" el={showSites} onClick={() => {
				const me = showSites!;
				queueLast(me, 'click', async () => {
					await transition(webring!, 'opacity', '0');
					hide(webring!);
					await transition(siteTable!, 'height', '100%', 300);
					hide(me);
					show(returnToWebring!);
				});
			}} _={"on click \n             transition the #webring's opacity to 0\n             hide the #webring\n             transition #site-table's height to 100% over 300ms then \n             hide me then\n             show #return-to-webring"}>List Sites</a><a href="#" id="return-to-webring" style="display: none" el={returnToWebring} onClick={() => {
				const me = returnToWebring!;
				queueLast(me, 'click', async () => {
					await transition(siteTable!, 'height', '0px', 800);
					show(webring!);
					await transition(webring!, 'opacity', '100%');
					hide(me);
					show(showSites!);
				});
			}} _={"on click \n             transition #site-table's height to 0px over 800ms then\n             show the #webring\n             transition the #webring's opacity to 100%\n             hide me then\n             show #show-sites"}>Return To Webring</a>{"] "}<img src="/img/navigator.gif" alt="" el={navigator} _={"on click from .nav-link\n              log 'here'\n              transition my opacity to 100%\n            on load from #webring\n              transition my opacity to 0%"} style="opacity: 0; float: right; width: 38px; position:absolute; right:2px; bottom: 2px" />{" "}</td>{" "}</tr>{" "}</tbody></table>{" "}<div id="site-table" el={siteTable} style="height: 0px; overflow: hidden">{" "}<table>{" "}<thead>{" "}<tr><th>Name</th><th>Description</th></tr>{" "}</thead>{" "}<tbody id="ring-table" el={ringTable}>{" "}<tr><td><a rel="nofollow" target="_blank" href="https://www.commspace.co.za/">Commspace</a></td><td>The ultimate solution for managing, tracking, splitting and analysing Financial Adviser revenue.</td></tr>{" "}<tr><td><a rel="noopener" target="_blank" href="https://zorro.management">Zorro Management</a></td><td>Manage your projects, time, and progress!</td></tr>{" "}<tr><td><a rel="nofollow" target="_blank" href="https://www.contexte.com/">Contexte</a></td><td>L’écosystème politique, au-delà des politiques publiques sectorielles : les métiers, les gens, les textes, les institutions</td></tr>{" "}<tr><td><a rel="nofollow" target="_blank" href="https://ocaml.org/">ocaml.org</a></td><td>An industrial-strength functional programming language with an emphasis on expressiveness and safety</td></tr>{" "}<tr><td><a rel="nofollow" target="_blank" href="https://www.nikevision.com/">Nike Vision</a></td><td>Eye-wear</td></tr>{" "}<tr><td><a rel="nofollow" target="_blank" href="https://vanillaweather.com/">Vanilla Weather</a></td><td>No ads. No tracking. Just the weather.</td></tr>{" "}<tr><td><a rel="nofollow" target="_blank" href="https://turboscribe.ai/">TurboScribe</a></td><td>TurboScribe’s mission is to deliver world-class AI transcription at an unbeatable price.</td></tr>{" "}<tr><td><a rel="nofollow" target="_blank" href="https://xrss.infogulch.com">XRSS</a></td><td>A simple RSS reader inspired by Google Reader</td></tr>{" "}<tr><td><a rel="nofollow" target="_blank" href="https://openunited.com/">OpenUnited</a></td><td>A Digital Talent match-making platform</td></tr>{" "}<tr><td><a rel="nofollow" target="_blank" href="https://gophemeral.com">Gophemeral</a></td><td>Share secrets securely!</td></tr>{" "}<tr><td><a rel="nofollow" target="_blank" href="https://www.thomasricci.dev">thomasricci.dev</a></td><td>Super fast portfolio website</td></tr>{" "}<tr><td><a rel="nofollow" target="_blank" href="https://signup.casa">Signup Casa</a></td><td>Simple, convenient sign-up forms.</td></tr>{" "}<tr><td><a rel="nofollow" target="_blank" href="https://recipes.musicavis.ca">Recipya</a></td><td>A clean, simple and powerful recipe manager your whole family can enjoy.</td></tr>{" "}<tr><td><a rel="noopener" target="_blank" href="https://statusnook.com">Statusnook</a></td><td>Effortlessly deploy a status page and start monitoring endpoints in minutes.</td></tr>{" "}<tr><td><a rel="noopener" target="_blank" href="https://photoquest.wedding/ ">PhotoQuest</a></td><td>The interactive wedding photo game for unique moments that connect.</td></tr>{" "}<tr><td><a rel="noopener" target="_blank" href="https://todo.dankstuff.net/">DankTodo</a></td><td>The First Ever HTMX C (Ulfius) Todo App in History!</td></tr>{" "}<tr><td><a rel="noopener" target="_blank" href="https://dankmuzikk.com/">DankMuzikk</a></td><td>Create, share and play music playlists with the fully hypermedia music player.</td></tr>{" "}<tr><td><a rel="noopener" target="_blank" href="https://danklyrics.com/">DankLyrics</a></td><td>A lyrics finder API, Website and Go package.</td></tr>{" "}</tbody>{" "}</table>{" "}</div>{" "}</div>
			{" "}
			<iframe
				id="webring"
				el={webring}
				attach={() => {
					// The navigator's "on load from #webring".
					const frame = webring!;
					const img = navigator!;
					const onLoad = () => queueLast(img, 'load', () => transition(img, 'opacity', '0%'));
					frame.addEventListener('load', onLoad);
					return () => frame.removeEventListener('load', onLoad);
				}}
				src="https://www.commspace.co.za" style="position:fixed;right:0;left:0;bottom:0;top:250px;width:100%;height:100%" name="webring"></iframe>
			{" "}
		</main>
		<SiteFooter />
	</div>
}
