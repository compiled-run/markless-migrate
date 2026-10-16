import { state } from '@markless/core';

export default function Home() @{
	let booked = state(0);

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
		<div class="counter"><span>Walks booked today: <output>{booked}</output></span><button type="button" onClick={() => booked++}>Book a walk</button></div>
		<section class="routes" aria-label="Routes">
			<article class="route"><h2>Lizard Point loop</h2><p>Two hours on the cliffs around the most southerly lighthouse.</p></article>
			<article class="route"><h2>Godrevy to St Ives</h2><p>A full day along the bay, with seals below the path.</p></article>
		</section>
	</main>
}
