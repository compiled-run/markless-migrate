// Two arms, as the converter writes a page's query variants.
import type { PageProps } from '@markless/router';
import Create, { Layers as CreateLayers } from '../../../examples/shadcn-ui-markless/lib/site/create.tsrx';
import { behave, listen } from '../registry.ts';

export default function Page({ url }: PageProps) @{
	const search = url.search;
	@switch (search) {
		@case "?template=vite": {
			<><div data-slot="layout" onClick={(event) => behave(event)} onKeyDown={(event) => behave(event)} onPointerOver={(event) => behave(event)} onPointerOut={(event) => behave(event)} onPointerDown={(event) => behave(event)} onFocusIn={(event) => behave(event)} onFocusOut={(event) => behave(event)} onInput={(event) => behave(event)} onIdle={() => listen()}>
				<header><button type="button" data-slot="dialog-trigger" data-base-ui-click-trigger="" id="base-ui-header-get-code" aria-haspopup="dialog" aria-expanded="false">Get Code</button></header>
				<Create />
			</div>
			<CreateLayers /></>
		}
		@default: {
			<><div data-slot="layout" onClick={(event) => behave(event)} onKeyDown={(event) => behave(event)} onPointerOver={(event) => behave(event)} onPointerOut={(event) => behave(event)} onPointerDown={(event) => behave(event)} onFocusIn={(event) => behave(event)} onFocusOut={(event) => behave(event)} onInput={(event) => behave(event)} onIdle={() => listen()}>
				<header><button type="button" data-slot="dialog-trigger" data-base-ui-click-trigger="" id="base-ui-header-get-code" aria-haspopup="dialog" aria-expanded="false">Get Code</button></header>
				<Create />
			</div>
			<CreateLayers /></>
		}
	}
}
