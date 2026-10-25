import MixedText from '../components/mixed-text.tsrx';

// Expected after a click: "solo [+9]". Actual: "[+undefined]": both props read as undefined once the state changes.
export default function PropText() @{
	<main>
		<MixedText label="solo" count={9} />
	</main>
}
