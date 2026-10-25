import ChildAsync from '../components/child-async.tsrx';

// Expected: the response streams "loaded child" after @pending, as it does when the same @try sits in the page.
// Actual: the server runs the recipe, the response ends on @pending, and the browser runs the recipe again (a second slow() call).
export default function ChildAsyncNotStreamed() @{
	<main>
		<ChildAsync />
	</main>
}
