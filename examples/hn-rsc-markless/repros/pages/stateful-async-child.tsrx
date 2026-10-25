import VoteItem from '../components/vote-item.tsrx';

// Expected: a click turns the span's class to "voted". Actual: "Markless DOM update expected graph node state:voted" at load and "Unknown async symbol" on the click; the class never changes.
export default function StatefulAsyncChild() @{
	<main>
		<VoteItem id={1} />
	</main>
}
