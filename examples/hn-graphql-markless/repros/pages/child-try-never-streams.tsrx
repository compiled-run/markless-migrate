import T from '../components/slow-one-try.tsrx';

// A slow (streamed) async value whose @try is in a child component. Expected the response ends with "loaded"; actual it stays "pending" and no streamed part is sent.
export default function Page() @{
	<T />
}
