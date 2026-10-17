// Gap 1: rows added in the browser never render when the row binds an attribute; text-only rows do.
import { state } from '@markless/core';

export default function Probe() @{
	let withAttr = state([] as { id: string; name: string }[]);
	let textOnly = state([] as { id: string; name: string }[]);

	<main>
		<button onClick={() => {
			withAttr = [{ id: '1', name: 'one' }, { id: '2', name: 'two' }];
			textOnly = [{ id: '1', name: 'one' }, { id: '2', name: 'two' }];
		}}>go</button>
		<ul id="attr">
			@for (const t of withAttr; key t.id) {
				<li class={t.id}>{t.name}</li>
			}
		</ul>
		<ul id="text">
			@for (const t of textOnly; key t.id) {
				<li>{t.name}</li>
			}
		</ul>
	</main>
}
