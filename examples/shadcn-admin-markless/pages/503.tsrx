import { StandaloneError } from '../components/errors/standalone.tsrx';

export default function Error503() @{
	<StandaloneError code="503" />
}
