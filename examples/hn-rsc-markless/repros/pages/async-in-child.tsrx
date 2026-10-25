import AsyncItem from '../components/async-item.tsrx';

// Expected: the server streams "item 1" into the response. Actual: it sends "loading 1", ends the response, and the browser runs the recipe.
export default function AsyncInChild() @{
	<main>
		<AsyncItem id={1} />
	</main>
}
