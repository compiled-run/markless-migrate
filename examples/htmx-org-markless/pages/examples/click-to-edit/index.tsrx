import { computed, element, state } from '@markless/core';
import SiteFooter from '../../../components/site-footer.tsrx';
import SiteHeader from '../../../components/site-header.tsrx';
import { displayTemplate, fillForm, formTemplate, INITIAL_HTML, JOE, responseEntry, type Contact, type Entry } from '../../../components/click-to-edit.ts';

export default function ClickToEdit() @{
	let contact = state<Contact>(JOE);
	let editing = state(false);
	let log = state<Entry[]>([]);
	let selected = state('init');
	let showInfo = state(false);
	const first = element<HTMLInputElement>();
	const last = element<HTMLInputElement>();
	const mail = element<HTMLInputElement>();
	const slotId0 = computed(() => {
		const entries = log;
		return entries[0] ? `${entries[0].id}-link` : '';
	});
	const slotClass0 = computed(() => {
		const entries = log;
		const id = selected;
		return entries[0]?.id === id ? 'active' : '';
	});
	const slotStyle0 = computed(() => {
		const entries = log;
		return entries.length > 0 ? '' : 'display: none;';
	});
	const slotLabel0 = computed(() => {
		const entries = log;
		return entries[0]?.label ?? '';
	});
	const slotId1 = computed(() => {
		const entries = log;
		return entries[1] ? `${entries[1].id}-link` : '';
	});
	const slotClass1 = computed(() => {
		const entries = log;
		const id = selected;
		return entries[1]?.id === id ? 'active' : '';
	});
	const slotStyle1 = computed(() => {
		const entries = log;
		return entries.length > 1 ? '' : 'display: none;';
	});
	const slotLabel1 = computed(() => {
		const entries = log;
		return entries[1]?.label ?? '';
	});
	const slotId2 = computed(() => {
		const entries = log;
		return entries[2] ? `${entries[2].id}-link` : '';
	});
	const slotClass2 = computed(() => {
		const entries = log;
		const id = selected;
		return entries[2]?.id === id ? 'active' : '';
	});
	const slotStyle2 = computed(() => {
		const entries = log;
		return entries.length > 2 ? '' : 'display: none;';
	});
	const slotLabel2 = computed(() => {
		const entries = log;
		return entries[2]?.label ?? '';
	});
	const slotId3 = computed(() => {
		const entries = log;
		return entries[3] ? `${entries[3].id}-link` : '';
	});
	const slotClass3 = computed(() => {
		const entries = log;
		const id = selected;
		return entries[3]?.id === id ? 'active' : '';
	});
	const slotStyle3 = computed(() => {
		const entries = log;
		return entries.length > 3 ? '' : 'display: none;';
	});
	const slotLabel3 = computed(() => {
		const entries = log;
		return entries[3]?.label ?? '';
	});
	const slotId4 = computed(() => {
		const entries = log;
		return entries[4] ? `${entries[4].id}-link` : '';
	});
	const slotClass4 = computed(() => {
		const entries = log;
		const id = selected;
		return entries[4]?.id === id ? 'active' : '';
	});
	const slotStyle4 = computed(() => {
		const entries = log;
		return entries.length > 4 ? '' : 'display: none;';
	});
	const slotLabel4 = computed(() => {
		const entries = log;
		return entries[4]?.label ?? '';
	});
	const slotId5 = computed(() => {
		const entries = log;
		return entries[5] ? `${entries[5].id}-link` : '';
	});
	const slotClass5 = computed(() => {
		const entries = log;
		const id = selected;
		return entries[5]?.id === id ? 'active' : '';
	});
	const slotStyle5 = computed(() => {
		const entries = log;
		return entries.length > 5 ? '' : 'display: none;';
	});
	const slotLabel5 = computed(() => {
		const entries = log;
		return entries[5]?.label ?? '';
	});
	const slotId6 = computed(() => {
		const entries = log;
		return entries[6] ? `${entries[6].id}-link` : '';
	});
	const slotClass6 = computed(() => {
		const entries = log;
		const id = selected;
		return entries[6]?.id === id ? 'active' : '';
	});
	const slotStyle6 = computed(() => {
		const entries = log;
		return entries.length > 6 ? '' : 'display: none;';
	});
	const slotLabel6 = computed(() => {
		const entries = log;
		return entries[6]?.label ?? '';
	});
	const slotId7 = computed(() => {
		const entries = log;
		return entries[7] ? `${entries[7].id}-link` : '';
	});
	const slotClass7 = computed(() => {
		const entries = log;
		const id = selected;
		return entries[7]?.id === id ? 'active' : '';
	});
	const slotStyle7 = computed(() => {
		const entries = log;
		return entries.length > 7 ? '' : 'display: none;';
	});
	const slotLabel7 = computed(() => {
		const entries = log;
		return entries[7]?.label ?? '';
	});
	const slotId8 = computed(() => {
		const entries = log;
		return entries[8] ? `${entries[8].id}-link` : '';
	});
	const slotClass8 = computed(() => {
		const entries = log;
		const id = selected;
		return entries[8]?.id === id ? 'active' : '';
	});
	const slotStyle8 = computed(() => {
		const entries = log;
		return entries.length > 8 ? '' : 'display: none;';
	});
	const slotLabel8 = computed(() => {
		const entries = log;
		return entries[8]?.label ?? '';
	});
	const slotId9 = computed(() => {
		const entries = log;
		return entries[9] ? `${entries[9].id}-link` : '';
	});
	const slotClass9 = computed(() => {
		const entries = log;
		const id = selected;
		return entries[9]?.id === id ? 'active' : '';
	});
	const slotStyle9 = computed(() => {
		const entries = log;
		return entries.length > 9 ? '' : 'display: none;';
	});
	const slotLabel9 = computed(() => {
		const entries = log;
		return entries[9]?.label ?? '';
	});
	const slotId10 = computed(() => {
		const entries = log;
		return entries[10] ? `${entries[10].id}-link` : '';
	});
	const slotClass10 = computed(() => {
		const entries = log;
		const id = selected;
		return entries[10]?.id === id ? 'active' : '';
	});
	const slotStyle10 = computed(() => {
		const entries = log;
		return entries.length > 10 ? '' : 'display: none;';
	});
	const slotLabel10 = computed(() => {
		const entries = log;
		return entries[10]?.label ?? '';
	});
	const slotId11 = computed(() => {
		const entries = log;
		return entries[11] ? `${entries[11].id}-link` : '';
	});
	const slotClass11 = computed(() => {
		const entries = log;
		const id = selected;
		return entries[11]?.id === id ? 'active' : '';
	});
	const slotStyle11 = computed(() => {
		const entries = log;
		return entries.length > 11 ? '' : 'display: none;';
	});
	const slotLabel11 = computed(() => {
		const entries = log;
		return entries[11]?.label ?? '';
	});
	const slotId12 = computed(() => {
		const entries = log;
		return entries[12] ? `${entries[12].id}-link` : '';
	});
	const slotClass12 = computed(() => {
		const entries = log;
		const id = selected;
		return entries[12]?.id === id ? 'active' : '';
	});
	const slotStyle12 = computed(() => {
		const entries = log;
		return entries.length > 12 ? '' : 'display: none;';
	});
	const slotLabel12 = computed(() => {
		const entries = log;
		return entries[12]?.label ?? '';
	});
	const slotId13 = computed(() => {
		const entries = log;
		return entries[13] ? `${entries[13].id}-link` : '';
	});
	const slotClass13 = computed(() => {
		const entries = log;
		const id = selected;
		return entries[13]?.id === id ? 'active' : '';
	});
	const slotStyle13 = computed(() => {
		const entries = log;
		return entries.length > 13 ? '' : 'display: none;';
	});
	const slotLabel13 = computed(() => {
		const entries = log;
		return entries[13]?.label ?? '';
	});
	const slotId14 = computed(() => {
		const entries = log;
		return entries[14] ? `${entries[14].id}-link` : '';
	});
	const slotClass14 = computed(() => {
		const entries = log;
		const id = selected;
		return entries[14]?.id === id ? 'active' : '';
	});
	const slotStyle14 = computed(() => {
		const entries = log;
		return entries.length > 14 ? '' : 'display: none;';
	});
	const slotLabel14 = computed(() => {
		const entries = log;
		return entries[14]?.label ?? '';
	});
	const slotId15 = computed(() => {
		const entries = log;
		return entries[15] ? `${entries[15].id}-link` : '';
	});
	const slotClass15 = computed(() => {
		const entries = log;
		const id = selected;
		return entries[15]?.id === id ? 'active' : '';
	});
	const slotStyle15 = computed(() => {
		const entries = log;
		return entries.length > 15 ? '' : 'display: none;';
	});
	const slotLabel15 = computed(() => {
		const entries = log;
		return entries[15]?.label ?? '';
	});
	const slotId16 = computed(() => {
		const entries = log;
		return entries[16] ? `${entries[16].id}-link` : '';
	});
	const slotClass16 = computed(() => {
		const entries = log;
		const id = selected;
		return entries[16]?.id === id ? 'active' : '';
	});
	const slotStyle16 = computed(() => {
		const entries = log;
		return entries.length > 16 ? '' : 'display: none;';
	});
	const slotLabel16 = computed(() => {
		const entries = log;
		return entries[16]?.label ?? '';
	});
	const slotId17 = computed(() => {
		const entries = log;
		return entries[17] ? `${entries[17].id}-link` : '';
	});
	const slotClass17 = computed(() => {
		const entries = log;
		const id = selected;
		return entries[17]?.id === id ? 'active' : '';
	});
	const slotStyle17 = computed(() => {
		const entries = log;
		return entries.length > 17 ? '' : 'display: none;';
	});
	const slotLabel17 = computed(() => {
		const entries = log;
		return entries[17]?.label ?? '';
	});
	const slotId18 = computed(() => {
		const entries = log;
		return entries[18] ? `${entries[18].id}-link` : '';
	});
	const slotClass18 = computed(() => {
		const entries = log;
		const id = selected;
		return entries[18]?.id === id ? 'active' : '';
	});
	const slotStyle18 = computed(() => {
		const entries = log;
		return entries.length > 18 ? '' : 'display: none;';
	});
	const slotLabel18 = computed(() => {
		const entries = log;
		return entries[18]?.label ?? '';
	});
	const slotId19 = computed(() => {
		const entries = log;
		return entries[19] ? `${entries[19].id}-link` : '';
	});
	const slotClass19 = computed(() => {
		const entries = log;
		const id = selected;
		return entries[19]?.id === id ? 'active' : '';
	});
	const slotStyle19 = computed(() => {
		const entries = log;
		return entries.length > 19 ? '' : 'display: none;';
	});
	const slotLabel19 = computed(() => {
		const entries = log;
		return entries[19]?.label ?? '';
	});
	const slotId20 = computed(() => {
		const entries = log;
		return entries[20] ? `${entries[20].id}-link` : '';
	});
	const slotClass20 = computed(() => {
		const entries = log;
		const id = selected;
		return entries[20]?.id === id ? 'active' : '';
	});
	const slotStyle20 = computed(() => {
		const entries = log;
		return entries.length > 20 ? '' : 'display: none;';
	});
	const slotLabel20 = computed(() => {
		const entries = log;
		return entries[20]?.label ?? '';
	});
	const slotId21 = computed(() => {
		const entries = log;
		return entries[21] ? `${entries[21].id}-link` : '';
	});
	const slotClass21 = computed(() => {
		const entries = log;
		const id = selected;
		return entries[21]?.id === id ? 'active' : '';
	});
	const slotStyle21 = computed(() => {
		const entries = log;
		return entries.length > 21 ? '' : 'display: none;';
	});
	const slotLabel21 = computed(() => {
		const entries = log;
		return entries[21]?.label ?? '';
	});
	const slotId22 = computed(() => {
		const entries = log;
		return entries[22] ? `${entries[22].id}-link` : '';
	});
	const slotClass22 = computed(() => {
		const entries = log;
		const id = selected;
		return entries[22]?.id === id ? 'active' : '';
	});
	const slotStyle22 = computed(() => {
		const entries = log;
		return entries.length > 22 ? '' : 'display: none;';
	});
	const slotLabel22 = computed(() => {
		const entries = log;
		return entries[22]?.label ?? '';
	});
	const slotId23 = computed(() => {
		const entries = log;
		return entries[23] ? `${entries[23].id}-link` : '';
	});
	const slotClass23 = computed(() => {
		const entries = log;
		const id = selected;
		return entries[23]?.id === id ? 'active' : '';
	});
	const slotStyle23 = computed(() => {
		const entries = log;
		return entries.length > 23 ? '' : 'display: none;';
	});
	const slotLabel23 = computed(() => {
		const entries = log;
		return entries[23]?.label ?? '';
	});
	const slotId24 = computed(() => {
		const entries = log;
		return entries[24] ? `${entries[24].id}-link` : '';
	});
	const slotClass24 = computed(() => {
		const entries = log;
		const id = selected;
		return entries[24]?.id === id ? 'active' : '';
	});
	const slotStyle24 = computed(() => {
		const entries = log;
		return entries.length > 24 ? '' : 'display: none;';
	});
	const slotLabel24 = computed(() => {
		const entries = log;
		return entries[24]?.label ?? '';
	});
	const slotId25 = computed(() => {
		const entries = log;
		return entries[25] ? `${entries[25].id}-link` : '';
	});
	const slotClass25 = computed(() => {
		const entries = log;
		const id = selected;
		return entries[25]?.id === id ? 'active' : '';
	});
	const slotStyle25 = computed(() => {
		const entries = log;
		return entries.length > 25 ? '' : 'display: none;';
	});
	const slotLabel25 = computed(() => {
		const entries = log;
		return entries[25]?.label ?? '';
	});
	const slotId26 = computed(() => {
		const entries = log;
		return entries[26] ? `${entries[26].id}-link` : '';
	});
	const slotClass26 = computed(() => {
		const entries = log;
		const id = selected;
		return entries[26]?.id === id ? 'active' : '';
	});
	const slotStyle26 = computed(() => {
		const entries = log;
		return entries.length > 26 ? '' : 'display: none;';
	});
	const slotLabel26 = computed(() => {
		const entries = log;
		return entries[26]?.label ?? '';
	});
	const slotId27 = computed(() => {
		const entries = log;
		return entries[27] ? `${entries[27].id}-link` : '';
	});
	const slotClass27 = computed(() => {
		const entries = log;
		const id = selected;
		return entries[27]?.id === id ? 'active' : '';
	});
	const slotStyle27 = computed(() => {
		const entries = log;
		return entries.length > 27 ? '' : 'display: none;';
	});
	const slotLabel27 = computed(() => {
		const entries = log;
		return entries[27]?.label ?? '';
	});
	const slotId28 = computed(() => {
		const entries = log;
		return entries[28] ? `${entries[28].id}-link` : '';
	});
	const slotClass28 = computed(() => {
		const entries = log;
		const id = selected;
		return entries[28]?.id === id ? 'active' : '';
	});
	const slotStyle28 = computed(() => {
		const entries = log;
		return entries.length > 28 ? '' : 'display: none;';
	});
	const slotLabel28 = computed(() => {
		const entries = log;
		return entries[28]?.label ?? '';
	});
	const slotId29 = computed(() => {
		const entries = log;
		return entries[29] ? `${entries[29].id}-link` : '';
	});
	const slotClass29 = computed(() => {
		const entries = log;
		const id = selected;
		return entries[29]?.id === id ? 'active' : '';
	});
	const slotStyle29 = computed(() => {
		const entries = log;
		return entries.length > 29 ? '' : 'display: none;';
	});
	const slotLabel29 = computed(() => {
		const entries = log;
		return entries[29]?.label ?? '';
	});
	const slotId30 = computed(() => {
		const entries = log;
		return entries[30] ? `${entries[30].id}-link` : '';
	});
	const slotClass30 = computed(() => {
		const entries = log;
		const id = selected;
		return entries[30]?.id === id ? 'active' : '';
	});
	const slotStyle30 = computed(() => {
		const entries = log;
		return entries.length > 30 ? '' : 'display: none;';
	});
	const slotLabel30 = computed(() => {
		const entries = log;
		return entries[30]?.label ?? '';
	});
	const slotId31 = computed(() => {
		const entries = log;
		return entries[31] ? `${entries[31].id}-link` : '';
	});
	const slotClass31 = computed(() => {
		const entries = log;
		const id = selected;
		return entries[31]?.id === id ? 'active' : '';
	});
	const slotStyle31 = computed(() => {
		const entries = log;
		return entries.length > 31 ? '' : 'display: none;';
	});
	const slotLabel31 = computed(() => {
		const entries = log;
		return entries[31]?.label ?? '';
	});
	const slotId32 = computed(() => {
		const entries = log;
		return entries[32] ? `${entries[32].id}-link` : '';
	});
	const slotClass32 = computed(() => {
		const entries = log;
		const id = selected;
		return entries[32]?.id === id ? 'active' : '';
	});
	const slotStyle32 = computed(() => {
		const entries = log;
		return entries.length > 32 ? '' : 'display: none;';
	});
	const slotLabel32 = computed(() => {
		const entries = log;
		return entries[32]?.label ?? '';
	});
	const slotId33 = computed(() => {
		const entries = log;
		return entries[33] ? `${entries[33].id}-link` : '';
	});
	const slotClass33 = computed(() => {
		const entries = log;
		const id = selected;
		return entries[33]?.id === id ? 'active' : '';
	});
	const slotStyle33 = computed(() => {
		const entries = log;
		return entries.length > 33 ? '' : 'display: none;';
	});
	const slotLabel33 = computed(() => {
		const entries = log;
		return entries[33]?.label ?? '';
	});
	const slotId34 = computed(() => {
		const entries = log;
		return entries[34] ? `${entries[34].id}-link` : '';
	});
	const slotClass34 = computed(() => {
		const entries = log;
		const id = selected;
		return entries[34]?.id === id ? 'active' : '';
	});
	const slotStyle34 = computed(() => {
		const entries = log;
		return entries.length > 34 ? '' : 'display: none;';
	});
	const slotLabel34 = computed(() => {
		const entries = log;
		return entries[34]?.label ?? '';
	});
	const slotId35 = computed(() => {
		const entries = log;
		return entries[35] ? `${entries[35].id}-link` : '';
	});
	const slotClass35 = computed(() => {
		const entries = log;
		const id = selected;
		return entries[35]?.id === id ? 'active' : '';
	});
	const slotStyle35 = computed(() => {
		const entries = log;
		return entries.length > 35 ? '' : 'display: none;';
	});
	const slotLabel35 = computed(() => {
		const entries = log;
		return entries[35]?.label ?? '';
	});
	const slotId36 = computed(() => {
		const entries = log;
		return entries[36] ? `${entries[36].id}-link` : '';
	});
	const slotClass36 = computed(() => {
		const entries = log;
		const id = selected;
		return entries[36]?.id === id ? 'active' : '';
	});
	const slotStyle36 = computed(() => {
		const entries = log;
		return entries.length > 36 ? '' : 'display: none;';
	});
	const slotLabel36 = computed(() => {
		const entries = log;
		return entries[36]?.label ?? '';
	});
	const slotId37 = computed(() => {
		const entries = log;
		return entries[37] ? `${entries[37].id}-link` : '';
	});
	const slotClass37 = computed(() => {
		const entries = log;
		const id = selected;
		return entries[37]?.id === id ? 'active' : '';
	});
	const slotStyle37 = computed(() => {
		const entries = log;
		return entries.length > 37 ? '' : 'display: none;';
	});
	const slotLabel37 = computed(() => {
		const entries = log;
		return entries[37]?.label ?? '';
	});
	const slotId38 = computed(() => {
		const entries = log;
		return entries[38] ? `${entries[38].id}-link` : '';
	});
	const slotClass38 = computed(() => {
		const entries = log;
		const id = selected;
		return entries[38]?.id === id ? 'active' : '';
	});
	const slotStyle38 = computed(() => {
		const entries = log;
		return entries.length > 38 ? '' : 'display: none;';
	});
	const slotLabel38 = computed(() => {
		const entries = log;
		return entries[38]?.label ?? '';
	});
	const slotId39 = computed(() => {
		const entries = log;
		return entries[39] ? `${entries[39].id}-link` : '';
	});
	const slotClass39 = computed(() => {
		const entries = log;
		const id = selected;
		return entries[39]?.id === id ? 'active' : '';
	});
	const slotStyle39 = computed(() => {
		const entries = log;
		return entries.length > 39 ? '' : 'display: none;';
	});
	const slotLabel39 = computed(() => {
		const entries = log;
		return entries[39]?.label ?? '';
	});
	const current = computed(() => {
		const entries = log;
		const id = selected;
		return entries.find((entry) => entry.id === id);
	});
	// Fields read through a local: a template read nested under a state path is not lowered in Markless 0.4.0.
	const currentMethod = computed(() => {
		const entry = current;
		return entry?.method ?? '';
	});
	const currentUrl = computed(() => {
		const entry = current;
		return entry?.url ?? '';
	});
	const currentParams = computed(() => {
		const entry = current;
		return entry?.params ?? '';
	});
	const currentCode = computed(() => {
		const entry = current;
		return entry?.code ?? '';
	});
	const currentTail = computed(() => {
		const entry = current;
		return entry && !entry.truncated ? ' ' : '';
	});
	const currentId = computed(() => {
		const entry = current;
		return entry?.id ?? '';
	});
	const count = computed(() => {
		const entries = log;
		return entries.length ? `: ${entries.length}` : '';
	});

	<div style="display: contents">
		<SiteHeader />
		{/* The first write after the page wakes does not reach a keyed list in Markless 0.4.0; waking on pointer or focus, before the first click, avoids it. */}
		<main class="c content " onPointerOver={() => undefined} onFocusIn={() => undefined}>
			<h1>Click to Edit</h1>
			<p>The click to edit pattern provides a way to offer inline editing of all or part of a record without a page refresh.</p>
			<ul>
				<li>This pattern starts with a UI that shows the details of a contact. The div has a button that will get the editing UI for the contact from <code>/contact/1/edit</code></li>
			</ul>
			<pre data-lang="html" style="background-color:#1f2329;color:#abb2bf;" class="language-html "><code class="language-html" data-lang="html"><span>&lt;</span><span style="color:#e06c75;">div </span><span style="color:#d19a66;">hx-target</span><span>=</span><span style="color:#98c379;">"this" </span><span style="color:#d19a66;">hx-swap</span><span>=</span><span style="color:#98c379;">"outerHTML"</span><span>{">\n"}</span><span>{"    <"}</span><span style="color:#e06c75;">div</span><span>&gt;&lt;</span><span style="color:#e06c75;">label</span><span>&gt;First Name&lt;/</span><span style="color:#e06c75;">label</span><span>&gt;: Joe&lt;/</span><span style="color:#e06c75;">div</span><span>{">\n"}</span><span>{"    <"}</span><span style="color:#e06c75;">div</span><span>&gt;&lt;</span><span style="color:#e06c75;">label</span><span>&gt;Last Name&lt;/</span><span style="color:#e06c75;">label</span><span>&gt;: Blow&lt;/</span><span style="color:#e06c75;">div</span><span>{">\n"}</span><span>{"    <"}</span><span style="color:#e06c75;">div</span><span>&gt;&lt;</span><span style="color:#e06c75;">label</span><span>&gt;Email&lt;/</span><span style="color:#e06c75;">label</span><span>&gt;: joe&#64;blow.com&lt;/</span><span style="color:#e06c75;">div</span><span>{">\n"}</span><span>{"    <"}</span><span style="color:#e06c75;">button </span><span style="color:#d19a66;">hx-get</span><span>=</span><span style="color:#98c379;">"/contact/1/edit" </span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">"btn primary"</span><span>{">\n"}</span><span>{"    Click To Edit\n"}</span><span>{"    </"}</span><span style="color:#e06c75;">button</span><span>{">\n"}</span><span>&lt;/</span><span style="color:#e06c75;">div</span><span>{">\n"}</span></code></pre>
			<ul>
				<li>This returns a form that can be used to edit the contact</li>
			</ul>
			<pre data-lang="html" style="background-color:#1f2329;color:#abb2bf;" class="language-html "><code class="language-html" data-lang="html"><span>&lt;</span><span style="color:#e06c75;">form </span><span style="color:#d19a66;">hx-put</span><span>=</span><span style="color:#98c379;">"/contact/1" </span><span style="color:#d19a66;">hx-target</span><span>=</span><span style="color:#98c379;">"this" </span><span style="color:#d19a66;">hx-swap</span><span>=</span><span style="color:#98c379;">"outerHTML"</span><span>{">\n"}</span><span>{"  <"}</span><span style="color:#e06c75;">div</span><span>{">\n"}</span><span>{"    <"}</span><span style="color:#e06c75;">label</span><span>&gt;First Name&lt;/</span><span style="color:#e06c75;">label</span><span>{">\n"}</span><span>{"    <"}</span><span style="color:#e06c75;">input </span><span style="color:#d19a66;">type</span><span>=</span><span style="color:#98c379;">"text" </span><span style="color:#d19a66;">name</span><span>=</span><span style="color:#98c379;">"firstName" </span><span style="color:#d19a66;">value</span><span>=</span><span style="color:#98c379;">"Joe"</span><span>{">\n"}</span><span>{"  </"}</span><span style="color:#e06c75;">div</span><span>{">\n"}</span><span>{"  <"}</span><span style="color:#e06c75;">div </span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">"form-group"</span><span>{">\n"}</span><span>{"    <"}</span><span style="color:#e06c75;">label</span><span>&gt;Last Name&lt;/</span><span style="color:#e06c75;">label</span><span>{">\n"}</span><span>{"    <"}</span><span style="color:#e06c75;">input </span><span style="color:#d19a66;">type</span><span>=</span><span style="color:#98c379;">"text" </span><span style="color:#d19a66;">name</span><span>=</span><span style="color:#98c379;">"lastName" </span><span style="color:#d19a66;">value</span><span>=</span><span style="color:#98c379;">"Blow"</span><span>{">\n"}</span><span>{"  </"}</span><span style="color:#e06c75;">div</span><span>{">\n"}</span><span>{"  <"}</span><span style="color:#e06c75;">div </span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">"form-group"</span><span>{">\n"}</span><span>{"    <"}</span><span style="color:#e06c75;">label</span><span>&gt;Email Address&lt;/</span><span style="color:#e06c75;">label</span><span>{">\n"}</span><span>{"    <"}</span><span style="color:#e06c75;">input </span><span style="color:#d19a66;">type</span><span>=</span><span style="color:#98c379;">"email" </span><span style="color:#d19a66;">name</span><span>=</span><span style="color:#98c379;">"email" </span><span style="color:#d19a66;">value</span><span>=</span><span style="color:#98c379;">"joe&#64;blow.com"</span><span>{">\n"}</span><span>{"  </"}</span><span style="color:#e06c75;">div</span><span>{">\n"}</span><span>{"  <"}</span><span style="color:#e06c75;">button </span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">"btn" </span><span style="color:#d19a66;">type</span><span>=</span><span style="color:#98c379;">"submit"</span><span>&gt;Submit&lt;/</span><span style="color:#e06c75;">button</span><span>{">\n"}</span><span>{"  <"}</span><span style="color:#e06c75;">button </span><span style="color:#d19a66;">class</span><span>=</span><span style="color:#98c379;">"btn" </span><span style="color:#d19a66;">hx-get</span><span>=</span><span style="color:#98c379;">"/contact/1"</span><span>&gt;Cancel&lt;/</span><span style="color:#e06c75;">button</span><span>{">\n"}</span><span>&lt;/</span><span style="color:#e06c75;">form</span><span>{">\n"}</span></code></pre>
			<ul>
				<li>The form issues a <code>PUT</code> back to <code>/contact/1</code>, following the usual REST-ful pattern.</li>
			</ul>
			<div id="demo-server-info" class={showInfo ? 'show' : ''}>
				<div>
					Server Requests<span id="request-count">{count}</span>{' '}
					<a id="request-info-toggler" style="cursor: pointer" onClick={() => (showInfo = !showInfo)}>{showInfo ? '↓ Hide' : '↑ Show'}</a>
				</div>
				<div id="demo-activity" class="row">
					<div class="3 col">
						{/* One handler for the whole timeline: a handler inside a keyed row loses its row after resume in Markless 0.4.0. */}
						<ol
							id="demo-timeline"
							reversed=""
							onClick={(event) => {
								const item = (event.target as Element).closest('li');
								if (item) selected = item.id.replace(/-link$/, '');
							}}
						>
							{/* Rows of a keyed list cannot carry attribute bindings in Markless 0.4.0 (they never render), so the timeline is a fixed set of slots; a hidden slot is not numbered. */}
							<li id={slotId0} class={slotClass0} style={slotStyle0}>
								<a style="cursor: pointer">{slotLabel0}</a>
							</li>
							<li id={slotId1} class={slotClass1} style={slotStyle1}>
								<a style="cursor: pointer">{slotLabel1}</a>
							</li>
							<li id={slotId2} class={slotClass2} style={slotStyle2}>
								<a style="cursor: pointer">{slotLabel2}</a>
							</li>
							<li id={slotId3} class={slotClass3} style={slotStyle3}>
								<a style="cursor: pointer">{slotLabel3}</a>
							</li>
							<li id={slotId4} class={slotClass4} style={slotStyle4}>
								<a style="cursor: pointer">{slotLabel4}</a>
							</li>
							<li id={slotId5} class={slotClass5} style={slotStyle5}>
								<a style="cursor: pointer">{slotLabel5}</a>
							</li>
							<li id={slotId6} class={slotClass6} style={slotStyle6}>
								<a style="cursor: pointer">{slotLabel6}</a>
							</li>
							<li id={slotId7} class={slotClass7} style={slotStyle7}>
								<a style="cursor: pointer">{slotLabel7}</a>
							</li>
							<li id={slotId8} class={slotClass8} style={slotStyle8}>
								<a style="cursor: pointer">{slotLabel8}</a>
							</li>
							<li id={slotId9} class={slotClass9} style={slotStyle9}>
								<a style="cursor: pointer">{slotLabel9}</a>
							</li>
							<li id={slotId10} class={slotClass10} style={slotStyle10}>
								<a style="cursor: pointer">{slotLabel10}</a>
							</li>
							<li id={slotId11} class={slotClass11} style={slotStyle11}>
								<a style="cursor: pointer">{slotLabel11}</a>
							</li>
							<li id={slotId12} class={slotClass12} style={slotStyle12}>
								<a style="cursor: pointer">{slotLabel12}</a>
							</li>
							<li id={slotId13} class={slotClass13} style={slotStyle13}>
								<a style="cursor: pointer">{slotLabel13}</a>
							</li>
							<li id={slotId14} class={slotClass14} style={slotStyle14}>
								<a style="cursor: pointer">{slotLabel14}</a>
							</li>
							<li id={slotId15} class={slotClass15} style={slotStyle15}>
								<a style="cursor: pointer">{slotLabel15}</a>
							</li>
							<li id={slotId16} class={slotClass16} style={slotStyle16}>
								<a style="cursor: pointer">{slotLabel16}</a>
							</li>
							<li id={slotId17} class={slotClass17} style={slotStyle17}>
								<a style="cursor: pointer">{slotLabel17}</a>
							</li>
							<li id={slotId18} class={slotClass18} style={slotStyle18}>
								<a style="cursor: pointer">{slotLabel18}</a>
							</li>
							<li id={slotId19} class={slotClass19} style={slotStyle19}>
								<a style="cursor: pointer">{slotLabel19}</a>
							</li>
							<li id={slotId20} class={slotClass20} style={slotStyle20}>
								<a style="cursor: pointer">{slotLabel20}</a>
							</li>
							<li id={slotId21} class={slotClass21} style={slotStyle21}>
								<a style="cursor: pointer">{slotLabel21}</a>
							</li>
							<li id={slotId22} class={slotClass22} style={slotStyle22}>
								<a style="cursor: pointer">{slotLabel22}</a>
							</li>
							<li id={slotId23} class={slotClass23} style={slotStyle23}>
								<a style="cursor: pointer">{slotLabel23}</a>
							</li>
							<li id={slotId24} class={slotClass24} style={slotStyle24}>
								<a style="cursor: pointer">{slotLabel24}</a>
							</li>
							<li id={slotId25} class={slotClass25} style={slotStyle25}>
								<a style="cursor: pointer">{slotLabel25}</a>
							</li>
							<li id={slotId26} class={slotClass26} style={slotStyle26}>
								<a style="cursor: pointer">{slotLabel26}</a>
							</li>
							<li id={slotId27} class={slotClass27} style={slotStyle27}>
								<a style="cursor: pointer">{slotLabel27}</a>
							</li>
							<li id={slotId28} class={slotClass28} style={slotStyle28}>
								<a style="cursor: pointer">{slotLabel28}</a>
							</li>
							<li id={slotId29} class={slotClass29} style={slotStyle29}>
								<a style="cursor: pointer">{slotLabel29}</a>
							</li>
							<li id={slotId30} class={slotClass30} style={slotStyle30}>
								<a style="cursor: pointer">{slotLabel30}</a>
							</li>
							<li id={slotId31} class={slotClass31} style={slotStyle31}>
								<a style="cursor: pointer">{slotLabel31}</a>
							</li>
							<li id={slotId32} class={slotClass32} style={slotStyle32}>
								<a style="cursor: pointer">{slotLabel32}</a>
							</li>
							<li id={slotId33} class={slotClass33} style={slotStyle33}>
								<a style="cursor: pointer">{slotLabel33}</a>
							</li>
							<li id={slotId34} class={slotClass34} style={slotStyle34}>
								<a style="cursor: pointer">{slotLabel34}</a>
							</li>
							<li id={slotId35} class={slotClass35} style={slotStyle35}>
								<a style="cursor: pointer">{slotLabel35}</a>
							</li>
							<li id={slotId36} class={slotClass36} style={slotStyle36}>
								<a style="cursor: pointer">{slotLabel36}</a>
							</li>
							<li id={slotId37} class={slotClass37} style={slotStyle37}>
								<a style="cursor: pointer">{slotLabel37}</a>
							</li>
							<li id={slotId38} class={slotClass38} style={slotStyle38}>
								<a style="cursor: pointer">{slotLabel38}</a>
							</li>
							<li id={slotId39} class={slotClass39} style={slotStyle39}>
								<a style="cursor: pointer">{slotLabel39}</a>
							</li>
							<li id="init-link" class={selected === 'init' ? 'active' : ''}>
								<a style="cursor: pointer">Initial State</a>
							</li>
						</ol>
					</div>
					<div id="demo-current-request" class="9 col">
						{/* demo.js keeps every entry and hides all but the selected one; only the selected one is drawn here. */}
						<div id={currentId} style={currentId ? '' : 'display: none;'}>
							<span class="activity response">
								<div>
									<b>{currentMethod}</b>{' '}<span>{currentUrl}</span>
								</div>
								<div>parameters: <span>{currentParams}</span></div>
								<div>headers: &#123;&#125;</div>
								<div>
									<b>Response</b>
									<pre class="language-html"><code class="language-html">{currentCode}</code><span>{currentTail}</span></pre>
								</div>
							</span>
						</div>
						<div id="init" style={currentId ? 'display: none;' : ''}>
							<span class="activity initial">
								<b>HTML</b>
								<pre class="language-html"><code class="language-html">{INITIAL_HTML}</code></pre>
							</span>
						</div>
					</div>
				</div>
			</div>
			<h2><a class="zola-anchor" href="#demo" aria-label="Anchor link for: demo">🔗</a>Demo</h2>
			<div id="demo-canvas">
				{/* htmx swaps one for the other; an @if arm cannot hold the form's value bindings in Markless 0.4.0, so both stay and one is hidden. */}
				<div style={editing ? 'display: none;' : ''}>
					{/* Each value sits in its own span: in Markless 0.4.0 updating a value that shares its element with other content replaces that whole element's content. */}
					<div><label>First Name</label>: <span>{contact.firstName}</span></div>
					<div><label>Last Name</label>: <span>{contact.lastName}</span></div>
					<div><label>Email Address</label>: <span>{contact.email}</span></div>
					<button
						class="btn primary"
						onClick={() => {
							editing = true;
							log = [responseEntry(log.length + 1, 'GET', '/contact/1/edit', {}, formTemplate(contact)), ...log];
							selected = `req-${log.length}`;
							// htmx swaps in a fresh form; the value binding does not reach the fields' values in Markless 0.4.0, so they are set here.
							fillForm([first, last, mail], contact);
						}}
					>
						{' Click To Edit '}
					</button>
				</div>
				<form
					style={editing ? '' : 'display: none;'}
					class={editing ? 'swapped-in' : ''}
					onAnimationStart={() => first?.focus()}
					onSubmit={(event) => {
						event.preventDefault();
						const data = new FormData(event.target as HTMLFormElement);
						const next = { firstName: String(data.get('firstName')), lastName: String(data.get('lastName')), email: String(data.get('email')) };
						contact = next;
						editing = false;
						log = [responseEntry(log.length + 1, 'PUT', '/contact/1', next, displayTemplate(next)), ...log];
						selected = `req-${log.length}`;
					}}
				>
					<div>
						<label for="firstName">First Name</label>
						<input el={first} autofocus="" type="text" id="firstName" name="firstName" value={contact.firstName} />
					</div>
					<div class="form-group">
						<label for="lastName">Last Name</label>
						<input el={last} type="text" id="lastName" name="lastName" value={contact.lastName} />
					</div>
					<div class="form-group">
						<label for="email">Email Address</label>
						<input el={mail} type="email" id="email" name="email" value={contact.email} />
					</div>
					<button class="btn primary" type="submit">Submit</button>
					{' '}
					<button
						class="btn danger"
						onClick={(event) => {
							event.preventDefault();
							editing = false;
							log = [responseEntry(log.length + 1, 'GET', '/contact/1', {}, displayTemplate(contact)), ...log];
							selected = `req-${log.length}`;
						}}
					>
						Cancel
					</button>
				</form>
			</div>
		</main>
		<SiteFooter />
	</div>
}
