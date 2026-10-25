// Scroll down and click a link: the click comes before the hover prefetch has finished.
export default function NavigationStart() @{
	<main>
		<h1>start</h1>
		<div style="height: 3000px">spacer</div>
		<a href="/navigation-reruns-recipe?u=2">to the slow page</a>
		<a href="/arm-link-handler">to the toggle page</a>
		<a href="/sync-from-pending-async">to the derived list</a>
	</main>
}
