// Panel.tsx and the DevtronProvider context: the toolbar, the IPC event grid and the detail panel.
// ReactJson (react-json-view's port) lives here: its nested @for loops fill in only when the component that
// owns their data is in the same file and passes it directly (see the log).
// The toolbar's swapped icons are lucide's SVG written out: an @if arm that holds a component is refused.
import { computed, state } from '@markless/core';
import type { Children } from '@markless/core';
import CircularButton from './circular-button.tsrx';
import DetailPanel from './detail-panel.tsrx';
import { columnDefs } from './columns.ts';
import { AgGridReact } from '../lib/parity/ag-grid-react/components.tsrx';
import { afterRowsRendered, announce, ensureIndexVisible } from '../lib/parity/ag-grid-react/api.ts';
import { Ban } from '../lib/parity/lucide-react/components.tsrx';
import { clearEvents, connectPanel, firstTime } from '../lib/devtron/port.ts';
import { jsonClick, kidsFor, rootStyle, stylesFor, treeFor } from '../lib/parity/microlink-react-json-view/tree.ts';
import type { Row } from '../lib/parity/ag-grid-react/model.ts';

export default function Panel() @{
	let events = state<Row[]>([]);
	let cols = state(columnDefs);
	let selected = state(0);
	let gridSelected = state(0);
	let live = state('No Rows To Show');
	let jsonEpoch = state(0);
	let showDetail = state(false);
	let theme = state('light');
	let position = state('right');
	let lockToBottom = state(true);
	let selectedRow = state<Row | null>(null);
	const rootCls = computed(() => `flex h-screen w-full overflow-hidden bg-white dark:bg-charcoal-800 ${position === 'bottom' ? 'flex-col' : 'flex-row'}`);
	const dark = computed(() => theme === 'dark');
	const light = computed(() => theme === 'light');
	const right = computed(() => position === 'right');
	const jsonTheme = computed(() => (theme === 'dark' ? 'monokai' : 'rjv-default'));
	const jsonBackground = computed(() => (theme === 'dark' ? '' : 'white'));
	const lockTip = computed(() => (lockToBottom ? 'Turn Auto Scrolling Off' : 'Turn Auto Scrolling On (Auto Scroll to newly added events)'));

	<div class={rootCls} onIdle={() => {
		if (!firstTime('panel')) return;
		const savedTheme = localStorage.getItem('theme');
		theme = savedTheme === 'dark' || savedTheme === 'light' ? savedTheme : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
		localStorage.setItem('theme', theme);
		document.body.classList.toggle('dark', theme === 'dark');
		const savedPosition = localStorage.getItem('detailPanelPosition');
		if (savedPosition === 'right' || savedPosition === 'bottom') {
			position = savedPosition;
			localStorage.setItem('detailPanelPosition', savedPosition);
		}
		const savedLock = localStorage.getItem('lockToBottom');
		if (savedLock) {
			lockToBottom = JSON.parse(savedLock);
			localStorage.setItem('lockToBottom', JSON.stringify(lockToBottom));
		}
		connectPanel(() => events, (list) => {
			events = list;
			if (lockToBottom) afterRowsRendered(list.length, () => requestAnimationFrame(() => ensureIndexVisible(list.length - 1, 'bottom', list.length)));
		});
	}}>
		<div class="flex flex-1 flex-col">
			<div class="flex items-center justify-between border-b border-gray-300 bg-gray-100 px-3 py-0.5 text-sm dark:border-charcoal-400 dark:bg-charcoal-800">
				<div class="font-medium dark:text-charcoal-100">Devtron</div>
				<div class="flex gap-2">
					<CircularButton tooltip="Switch between Light and Dark theme" active={false} onClick={() => {
						theme = theme === 'light' ? 'dark' : 'light';
						jsonEpoch++;
						localStorage.setItem('theme', theme);
						document.body.classList.toggle('dark', theme === 'dark');
					}}>
						@if (light) {
							<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sun" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="m4.93 4.93 1.41 1.41"></path><path d="m17.66 17.66 1.41 1.41"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="m6.34 17.66-1.41 1.41"></path><path d="m19.07 4.93-1.41 1.41"></path></svg>
						} @else {
							<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-moon" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path></svg>
						}
					</CircularButton>
					<CircularButton tooltip="Toggle Detail Panel position (right/bottom)" active={false} onClick={() => {
						position = position === 'right' ? 'bottom' : 'right';
						localStorage.setItem('detailPanelPosition', position);
					}}>
						@if (right) {
							<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-panel-right" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2"></rect><path d="M15 3v18"></path></svg>
						} @else {
							<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-panel-bottom" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2"></rect><path d="M3 15h18"></path></svg>
						}
					</CircularButton>
					<CircularButton tooltip={lockTip} active={lockToBottom} onClick={() => {
						lockToBottom = !lockToBottom;
						localStorage.setItem('lockToBottom', JSON.stringify(lockToBottom));
					}}>
						@if (lockToBottom) {
							<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-lock" aria-hidden="true"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
						} @else {
							<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-lock-open" aria-hidden="true"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>
						}
					</CircularButton>
					<CircularButton tooltip="Clear all events" active={false} onClick={() => {
						clearEvents();
						events = [];
						announce('No Rows To Show', (text) => (live = text));
					}}>
						<Ban strokeWidth={3} size={15} />
					</CircularButton>
				</div>
			</div>
			<div class="flex-1">
				<AgGridReact rowData={events} columnDefs={cols} dark={dark} live={live} onAnnounce={(text) => (live = text)} selected={gridSelected} onSelectionChanged={(serial) => (gridSelected = serial)} onRowClicked={async (serial) => {
					// As in Devtron's React panel: the row highlight paints in the click's frame, the details in the next.
					await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve)));
					if (serial !== selected) jsonEpoch++;
					selected = serial;
					selectedRow = events.find((e) => e.serialNumber === serial) ?? null;
					showDetail = true;
				}} />
			</div>
		</div>
		<DetailPanel row={selectedRow} open={showDetail} dock={position} theme={theme} onClose={() => {
			showDetail = false;
			selected = 0;
			selectedRow = null;
		}} gotoRow={(serial) => {
			if (events.length === 0) return;
			const index = serial - events[0]!.serialNumber;
			if (index < 0 || index >= events.length) return;
			ensureIndexVisible(index, 'bottom', events.length);
			if (events.some((e) => e.serialNumber === serial)) {
				gridSelected = serial;
				if (serial !== selected) jsonEpoch++;
				selected = serial;
				selectedRow = events.find((e) => e.serialNumber === serial) ?? null;
				showDetail = true;
			}
		}}>
			<ReactJson row={selectedRow} epoch={jsonEpoch} theme={jsonTheme} name="data" background={jsonBackground} />
		</DetailPanel>
	</div>
}

/** react-json-view's default export: `src` is `row.args`, passed as the row, because a computed here does not see
 * a value the caller computed from its own props (see the log). Clicks on a brace or ellipsis toggle a node. */
function ReactJson({ row, epoch, theme, name, background }: { row: { serialNumber: number; args: unknown } | null; epoch: number; theme: string; name: string; background: string }) @{
	let toggled = state('');
	const styles = computed(() => stylesFor(theme));
	const style = computed(() => rootStyle(theme, background));
	const tree = computed(() => treeFor(row, name, theme, toggled));
	const nodes = computed(() => kidsFor(row, name, theme, toggled));
	<div class="react-json-view" style={style} onClick={(e) => {
		const hit = (e.target as HTMLElement).closest('[data-toggle]')?.getAttribute('data-toggle');
		if (hit) toggled = jsonClick(toggled, row, epoch, name, hit);
	}}>
		<div class="pretty-json-container object-container">
			<div class="object-content">
				<div class="object-key-val">
					<span><span style="display: inline-block; cursor: pointer;" data-toggle={tree.id}><div class="icon-container" style="display: inline-block; width: 17px;"><span class={tree.iconCls}><svg viewBox="0 0 15 15" fill="currentColor" style={tree.iconStyle}><path d={tree.iconPath}></path></svg></span></div><span style={styles.key}><span class="object-key"><span style="vertical-align: top;">"</span><span>{tree.name}</span><span style="vertical-align: top;">"</span></span><span style={styles.colon}>:</span></span><span style={styles.brace}>{tree.open}</span></span></span>
					<div class="pushed-content object-container" style={tree.pushedStyle}>
						<div class="object-content" style="margin-left: 6px;">
							@for (const n1 of nodes; key n1.id) {
								<div style="display: contents;">
								<div class="object-key-val" style={n1.objStyle}>
									<span><span style="display: inline-block; cursor: pointer;" data-toggle={n1.id}><div class="icon-container" style="display: inline-block; width: 17px;"><span class={n1.iconCls}><svg viewBox="0 0 15 15" fill="currentColor" style={n1.iconStyle}><path d={n1.iconPath}></path></svg></span></div><span style={n1.keyStyle}><span class="array-key" style={n1.arrayKeyStyle}>{n1.name}</span><span class="object-key" style={n1.objectKeyStyle}><span style="vertical-align: top;">"</span><span>{n1.name}</span><span style="vertical-align: top;">"</span></span><span style={n1.colonStyle}>:</span></span><span style={n1.braceStyle}>{n1.open}</span></span></span>
									<div class="pushed-content object-container" style={n1.pushedStyle}>
										<div class="object-content" style="margin-left: 6px;">
											@for (const n2 of n1.kids; key n2.id) {
												<div style="display: contents;">
												<div class="object-key-val" style={n2.objStyle}>
													<span><span style="display: inline-block; cursor: pointer;" data-toggle={n2.id}><div class="icon-container" style="display: inline-block; width: 17px;"><span class={n2.iconCls}><svg viewBox="0 0 15 15" fill="currentColor" style={n2.iconStyle}><path d={n2.iconPath}></path></svg></span></div><span style={n2.keyStyle}><span class="array-key" style={n2.arrayKeyStyle}>{n2.name}</span><span class="object-key" style={n2.objectKeyStyle}><span style="vertical-align: top;">"</span><span>{n2.name}</span><span style="vertical-align: top;">"</span></span><span style={n2.colonStyle}>:</span></span><span style={n2.braceStyle}>{n2.open}</span></span></span>
													<div class="pushed-content object-container" style={n2.pushedStyle}>
														<div class="object-content" style="margin-left: 6px;">
															@for (const n3 of n2.kids; key n3.id) {
																<div style="display: contents;">
																<div class="object-key-val" style={n3.objStyle}>
																	<span><span style="display: inline-block; cursor: pointer;" data-toggle={n3.id}><div class="icon-container" style="display: inline-block; width: 17px;"><span class={n3.iconCls}><svg viewBox="0 0 15 15" fill="currentColor" style={n3.iconStyle}><path d={n3.iconPath}></path></svg></span></div><span style={n3.keyStyle}><span class="array-key" style={n3.arrayKeyStyle}>{n3.name}</span><span class="object-key" style={n3.objectKeyStyle}><span style="vertical-align: top;">"</span><span>{n3.name}</span><span style="vertical-align: top;">"</span></span><span style={n3.colonStyle}>:</span></span><span style={n3.braceStyle}>{n3.open}</span></span></span>
																	<div class="pushed-content object-container" style={n3.pushedStyle}>
																		<div class="object-content" style="margin-left: 6px;">
																			@for (const n4 of n3.kids; key n4.id) {
																				<div style="display: contents;">
																				<div class="object-key-val" style={n4.objStyle}>
																					<span><span style="display: inline-block; cursor: pointer;" data-toggle={n4.id}><div class="icon-container" style="display: inline-block; width: 17px;"><span class={n4.iconCls}><svg viewBox="0 0 15 15" fill="currentColor" style={n4.iconStyle}><path d={n4.iconPath}></path></svg></span></div><span style={n4.keyStyle}><span class="array-key" style={n4.arrayKeyStyle}>{n4.name}</span><span class="object-key" style={n4.objectKeyStyle}><span style="vertical-align: top;">"</span><span>{n4.name}</span><span style="vertical-align: top;">"</span></span><span style={n4.colonStyle}>:</span></span><span style={n4.braceStyle}>{n4.open}</span></span></span>
																					<div class="pushed-content object-container" style={n4.pushedStyle}>
																						<div class="object-content" style="margin-left: 6px;">
																							@for (const n5 of n4.kids; key n5.id) {
																								<div style="display: contents;">
																								<div class="object-key-val" style={n5.objStyle}>
																									<span><span style="display: inline-block; cursor: pointer;" data-toggle={n5.id}><div class="icon-container" style="display: inline-block; width: 17px;"><span class={n5.iconCls}><svg viewBox="0 0 15 15" fill="currentColor" style={n5.iconStyle}><path d={n5.iconPath}></path></svg></span></div><span style={n5.keyStyle}><span class="array-key" style={n5.arrayKeyStyle}>{n5.name}</span><span class="object-key" style={n5.objectKeyStyle}><span style="vertical-align: top;">"</span><span>{n5.name}</span><span style="vertical-align: top;">"</span></span><span style={n5.colonStyle}>:</span></span><span style={n5.braceStyle}>{n5.open}</span></span></span>
																									<div class="pushed-content object-container" style={n5.pushedStyle}>
																										<div class="object-content" style="margin-left: 6px;">
																											@for (const n6 of n5.kids; key n6.id) {
																												<div style="display: contents;">
																												<div class="object-key-val" style={n6.objStyle}>
																													<span><span style="display: inline-block; cursor: pointer;" data-toggle={n6.id}><div class="icon-container" style="display: inline-block; width: 17px;"><span class={n6.iconCls}><svg viewBox="0 0 15 15" fill="currentColor" style={n6.iconStyle}><path d={n6.iconPath}></path></svg></span></div><span style={n6.keyStyle}><span class="array-key" style={n6.arrayKeyStyle}>{n6.name}</span><span class="object-key" style={n6.objectKeyStyle}><span style="vertical-align: top;">"</span><span>{n6.name}</span><span style="vertical-align: top;">"</span></span><span style={n6.colonStyle}>:</span></span><span style={n6.braceStyle}>{n6.open}</span></span></span>
																													<div class="pushed-content object-container" style={n6.pushedStyle}>
																														<div class="object-content" style="margin-left: 6px;">
																															@for (const n7 of n6.kids; key n7.id) {
																																<div style="display: contents;">
																																<div class="object-key-val" style={n7.objStyle}>
																																	<span><span style="display: inline-block; cursor: pointer;" data-toggle={n7.id}><div class="icon-container" style="display: inline-block; width: 17px;"><span class={n7.iconCls}><svg viewBox="0 0 15 15" fill="currentColor" style={n7.iconStyle}><path d={n7.iconPath}></path></svg></span></div><span style={n7.keyStyle}><span class="array-key" style={n7.arrayKeyStyle}>{n7.name}</span><span class="object-key" style={n7.objectKeyStyle}><span style="vertical-align: top;">"</span><span>{n7.name}</span><span style="vertical-align: top;">"</span></span><span style={n7.colonStyle}>:</span></span><span style={n7.braceStyle}>{n7.open}</span></span></span>
																																	<div class="pushed-content object-container" style={n7.pushedStyle}>
																																		<div class="object-content" style="margin-left: 6px;">

																																		</div>
																																	</div>
																																	<div class="node-ellipsis" style={n7.ellipsisStyle} data-toggle={n7.id}>...</div>
																																	<span class="brace-row"><span style={n7.closeStyle}>{n7.close}</span></span>
																																	<span style={n7.commaStyle}>,</span>
																																	<div class="object-meta-data" style="display: inline-block; padding: 0px 0px 0px 10px;"></div>
																																</div>
																																<div class="variable-row" style={n7.varStyle}>
																																	<span style={n7.arrayVarStyle}>{n7.name}<div style={n7.colonStyle}>:</div></span>
																																	<span style={n7.objectVarStyle}><span class="object-key" style={n7.objectKeyVarStyle}><span style="vertical-align: top;">"</span><span style="display: inline-block;">{n7.name}</span><span style="vertical-align: top;">"</span></span><span style={n7.colonStyle}>:</span></span>
																																	<div class="variable-value" style="display: inline-block; padding-right: 6px; position: relative; cursor: default;"><div style={n7.valueStyle}><span class="string-value" style={n7.stringStyle}>{n7.valueText}</span><span style={n7.plainStyle}>{n7.valueText}</span></div></div>
																																	<span style={n7.commaStyle}>,</span>
																																</div>
																																</div>
																															}
																														</div>
																													</div>
																													<div class="node-ellipsis" style={n6.ellipsisStyle} data-toggle={n6.id}>...</div>
																													<span class="brace-row"><span style={n6.closeStyle}>{n6.close}</span></span>
																													<span style={n6.commaStyle}>,</span>
																													<div class="object-meta-data" style="display: inline-block; padding: 0px 0px 0px 10px;"></div>
																												</div>
																												<div class="variable-row" style={n6.varStyle}>
																													<span style={n6.arrayVarStyle}>{n6.name}<div style={n6.colonStyle}>:</div></span>
																													<span style={n6.objectVarStyle}><span class="object-key" style={n6.objectKeyVarStyle}><span style="vertical-align: top;">"</span><span style="display: inline-block;">{n6.name}</span><span style="vertical-align: top;">"</span></span><span style={n6.colonStyle}>:</span></span>
																													<div class="variable-value" style="display: inline-block; padding-right: 6px; position: relative; cursor: default;"><div style={n6.valueStyle}><span class="string-value" style={n6.stringStyle}>{n6.valueText}</span><span style={n6.plainStyle}>{n6.valueText}</span></div></div>
																													<span style={n6.commaStyle}>,</span>
																												</div>
																												</div>
																											}
																										</div>
																									</div>
																									<div class="node-ellipsis" style={n5.ellipsisStyle} data-toggle={n5.id}>...</div>
																									<span class="brace-row"><span style={n5.closeStyle}>{n5.close}</span></span>
																									<span style={n5.commaStyle}>,</span>
																									<div class="object-meta-data" style="display: inline-block; padding: 0px 0px 0px 10px;"></div>
																								</div>
																								<div class="variable-row" style={n5.varStyle}>
																									<span style={n5.arrayVarStyle}>{n5.name}<div style={n5.colonStyle}>:</div></span>
																									<span style={n5.objectVarStyle}><span class="object-key" style={n5.objectKeyVarStyle}><span style="vertical-align: top;">"</span><span style="display: inline-block;">{n5.name}</span><span style="vertical-align: top;">"</span></span><span style={n5.colonStyle}>:</span></span>
																									<div class="variable-value" style="display: inline-block; padding-right: 6px; position: relative; cursor: default;"><div style={n5.valueStyle}><span class="string-value" style={n5.stringStyle}>{n5.valueText}</span><span style={n5.plainStyle}>{n5.valueText}</span></div></div>
																									<span style={n5.commaStyle}>,</span>
																								</div>
																								</div>
																							}
																						</div>
																					</div>
																					<div class="node-ellipsis" style={n4.ellipsisStyle} data-toggle={n4.id}>...</div>
																					<span class="brace-row"><span style={n4.closeStyle}>{n4.close}</span></span>
																					<span style={n4.commaStyle}>,</span>
																					<div class="object-meta-data" style="display: inline-block; padding: 0px 0px 0px 10px;"></div>
																				</div>
																				<div class="variable-row" style={n4.varStyle}>
																					<span style={n4.arrayVarStyle}>{n4.name}<div style={n4.colonStyle}>:</div></span>
																					<span style={n4.objectVarStyle}><span class="object-key" style={n4.objectKeyVarStyle}><span style="vertical-align: top;">"</span><span style="display: inline-block;">{n4.name}</span><span style="vertical-align: top;">"</span></span><span style={n4.colonStyle}>:</span></span>
																					<div class="variable-value" style="display: inline-block; padding-right: 6px; position: relative; cursor: default;"><div style={n4.valueStyle}><span class="string-value" style={n4.stringStyle}>{n4.valueText}</span><span style={n4.plainStyle}>{n4.valueText}</span></div></div>
																					<span style={n4.commaStyle}>,</span>
																				</div>
																				</div>
																			}
																		</div>
																	</div>
																	<div class="node-ellipsis" style={n3.ellipsisStyle} data-toggle={n3.id}>...</div>
																	<span class="brace-row"><span style={n3.closeStyle}>{n3.close}</span></span>
																	<span style={n3.commaStyle}>,</span>
																	<div class="object-meta-data" style="display: inline-block; padding: 0px 0px 0px 10px;"></div>
																</div>
																<div class="variable-row" style={n3.varStyle}>
																	<span style={n3.arrayVarStyle}>{n3.name}<div style={n3.colonStyle}>:</div></span>
																	<span style={n3.objectVarStyle}><span class="object-key" style={n3.objectKeyVarStyle}><span style="vertical-align: top;">"</span><span style="display: inline-block;">{n3.name}</span><span style="vertical-align: top;">"</span></span><span style={n3.colonStyle}>:</span></span>
																	<div class="variable-value" style="display: inline-block; padding-right: 6px; position: relative; cursor: default;"><div style={n3.valueStyle}><span class="string-value" style={n3.stringStyle}>{n3.valueText}</span><span style={n3.plainStyle}>{n3.valueText}</span></div></div>
																	<span style={n3.commaStyle}>,</span>
																</div>
																</div>
															}
														</div>
													</div>
													<div class="node-ellipsis" style={n2.ellipsisStyle} data-toggle={n2.id}>...</div>
													<span class="brace-row"><span style={n2.closeStyle}>{n2.close}</span></span>
													<span style={n2.commaStyle}>,</span>
													<div class="object-meta-data" style="display: inline-block; padding: 0px 0px 0px 10px;"></div>
												</div>
												<div class="variable-row" style={n2.varStyle}>
													<span style={n2.arrayVarStyle}>{n2.name}<div style={n2.colonStyle}>:</div></span>
													<span style={n2.objectVarStyle}><span class="object-key" style={n2.objectKeyVarStyle}><span style="vertical-align: top;">"</span><span style="display: inline-block;">{n2.name}</span><span style="vertical-align: top;">"</span></span><span style={n2.colonStyle}>:</span></span>
													<div class="variable-value" style="display: inline-block; padding-right: 6px; position: relative; cursor: default;"><div style={n2.valueStyle}><span class="string-value" style={n2.stringStyle}>{n2.valueText}</span><span style={n2.plainStyle}>{n2.valueText}</span></div></div>
													<span style={n2.commaStyle}>,</span>
												</div>
												</div>
											}
										</div>
									</div>
									<div class="node-ellipsis" style={n1.ellipsisStyle} data-toggle={n1.id}>...</div>
									<span class="brace-row"><span style={n1.closeStyle}>{n1.close}</span></span>
									<span style={n1.commaStyle}>,</span>
									<div class="object-meta-data" style="display: inline-block; padding: 0px 0px 0px 10px;"></div>
								</div>
								<div class="variable-row" style={n1.varStyle}>
									<span style={n1.arrayVarStyle}>{n1.name}<div style={n1.colonStyle}>:</div></span>
									<span style={n1.objectVarStyle}><span class="object-key" style={n1.objectKeyVarStyle}><span style="vertical-align: top;">"</span><span style="display: inline-block;">{n1.name}</span><span style="vertical-align: top;">"</span></span><span style={n1.colonStyle}>:</span></span>
									<div class="variable-value" style="display: inline-block; padding-right: 6px; position: relative; cursor: default;"><div style={n1.valueStyle}><span class="string-value" style={n1.stringStyle}>{n1.valueText}</span><span style={n1.plainStyle}>{n1.valueText}</span></div></div>
									<span style={n1.commaStyle}>,</span>
								</div>
								</div>
							}
						</div>
					</div>
					<div class="node-ellipsis" style={tree.ellipsisStyle} data-toggle={tree.id}>...</div>
					<span class="brace-row"><span style={tree.closeStyle}>{tree.close}</span></span>
					<div class="object-meta-data" style="display: inline-block; padding: 0px 0px 0px 10px;"></div>
				</div>
			</div>
		</div>
	</div>
}
