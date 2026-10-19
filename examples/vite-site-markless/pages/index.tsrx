import { state } from '@markless/core';
import type { PageProps } from '@markless/router';
import Footer from '../components/footer.tsrx';
import Header from '../components/header.tsrx';
import Menu from '../components/menu.tsrx';

const TIPS = ['Pack a spare pair of socks.', 'Check the tide times before you set out.', 'Keep to the path near the cliff edge.', 'Bring cash for the café.'];
const TRIP = '{"@context":"https://schema.org","@type":"TouristTrip","name":"Lighthouse Walks","url":"https://lighthouse.example/"}';

export default function Home({ http }: PageProps) @{
	const cms = http.locals.cms ?? { url: '', news: [], tagline: '' };
	let booked = state(0);
	let tip = state('');
	let hours = state('loading');
	const cmsUrl = state(cms.url);

	<div class="page">
		<Header>
			<Menu />
		</Header>
		<main>
			<h1>Walk the coast between the lighthouses</h1>
			<p class="lede">Six guided routes, from two hours to a full day, all starting at a lighthouse.</p>
			<p class="next-walk">Next walk: <time datetime="2026-10-27">27 October 2026</time> · Season pass: £1,234.50</p>
			<img class="hero" src="/hero.png" alt="Cliff path leading to a white lighthouse" width="640" height="320" />
			<ul class="facts">
				<li>Routes from 4 km to 19 km</li>
				<li>Small groups of up to 12</li>
				<li>Every walk ends at a café</li>
			</ul>
			<div class="counter"><span>Walks booked today: <output>{booked}</output></span><button type="button" data-book onClick={() => booked++}>Book a walk</button></div>
			<p class="tip">Walker’s tip: <span data-tip onIdle={() => { tip = TIPS[Math.floor(Math.random() * TIPS.length)]!; }}>{tip}</span></p>
			<p
				class="hours"
				data-cms={cms.url}
				onIdle={() => {
					if (!cmsUrl) return;
					fetch(`${cmsUrl}/walks/hours`)
						.then((response) => response.json() as Promise<{ today: string }>)
						.then((data) => { hours = data.today; })
						.catch(() => { hours = 'unavailable'; });
				}}
			>Opening hours: <span data-hours>{hours}</span></p>
			<section class="news" aria-label="News">
				@for (const item of cms.news; key item.title) {
					<article><h2>{item.title}</h2><p>{item.summary}</p></article>
				}
			</section>
			<section class="routes" aria-label="Routes">
				<article class="route"><h2>Lizard Point loop</h2><p>Two hours on the cliffs around the most southerly lighthouse.</p></article>
				<article class="route"><h2>Godrevy to St Ives</h2><p>A full day along the bay, with seals below the path.</p></article>
			</section>
			<details>
				<summary>What should I bring?</summary>
				<p>Boots, a waterproof and water. We bring the maps.</p>
			</details>
			<script type="application/ld+json">{TRIP}</script>
		</main>
		<Footer>
			<p class="tagline">{cms.tagline}</p>
		</Footer>
	</div>
}
