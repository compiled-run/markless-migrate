import type { PageProps } from '@markless/router';
import Typeset, { Layers as TypesetLayers } from '../../../examples/shadcn-ui-markless/lib/site/typeset.tsrx';
import { behave, listen } from '../registry.ts';

export default function Page(_props: PageProps) @{
	<>
		<div data-slot="layout" onClick={(event) => behave(event)} onKeyDown={(event) => behave(event)} onPointerOver={(event) => behave(event)} onPointerOut={(event) => behave(event)} onPointerDown={(event) => behave(event)} onFocusIn={(event) => behave(event)} onFocusOut={(event) => behave(event)} onIdle={() => listen()}>
			<Typeset />
		</div>
		<TypesetLayers />
	</>
}
