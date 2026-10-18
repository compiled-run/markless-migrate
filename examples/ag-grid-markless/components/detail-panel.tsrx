// ResizablePanel.tsx and DetailPanel.tsx: the selected event's details beside or below the grid.
import { computed, state } from '@markless/core';
import type { Children } from '@markless/core';
import CircularButton from './circular-button.tsrx';
import DirectionBadge from './direction-badge.tsrx';
import { X } from '../lib/parity/lucide-react/components.tsrx';
import { formatTimestamp } from '../lib/parity/ag-grid-react/model.ts';
import type { Row } from '../lib/parity/ag-grid-react/model.ts';

export default function DetailPanel({ row, open, dock, theme, onClose, gotoRow, children }: { row: Row | null; open: boolean; dock: string; theme: string; onClose: () => void; gotoRow: (serial: number) => void; children?: Children }) @{
	let resizing = state(false);
	let width = state(426.6666666666667);
	let height = state(266.6666666666667);
	const outerStyle = computed(() => (open ? '' : 'display: none;'));
	const outerCls = computed(() => (dock === 'bottom' ? 'relative flex w-full flex-col' : 'relative flex h-full'));
	const handleCls = computed(() => `${dock === 'bottom' ? 'absolute left-0 top-0 z-10 h-1 w-full cursor-row-resize transition-colors' : 'absolute left-0 top-0 z-10 h-full w-1 cursor-col-resize transition-colors'} ${resizing ? 'bg-blue-500' : 'hover:bg-gray-400'}`);
	const sizeStyle = computed(() => (dock === 'bottom' ? `height: ${height}px;` : `width: ${width}px;`));
	const sizeCls = computed(() => (dock === 'bottom' ? 'w-full' : 'h-full'));
	const panelCls = computed(() => `flex h-full flex-col border-gray-300 bg-gray-50 text-gray-700 dark:border-charcoal-400 dark:bg-charcoal-800 dark:text-charcoal-100 ${dock === 'bottom' ? 'border-t' : 'border-l'}`);
	const layoutCls = computed(() => (dock === 'bottom' ? 'flex gap-4' : ''));
	const fieldsCls = computed(() => `${dock === 'bottom' ? 'flex-shrink-0 gap-y-12' : 'mb-4'} flex flex-col gap-y-2`);
	const argsCls = computed(() => `h-fit rounded border border-gray-200 dark:border-0 dark:bg-charcoal-600 ${dock === 'bottom' ? 'flex-1' : ''}`);
	const channel = computed(() => row?.channel ?? '');
	const time = computed(() => (row ? formatTimestamp(row.timestamp) : ''));
	const dir = computed(() => row?.direction ?? '');
	const method = computed(() => row?.method ?? '');
	const scope = computed(() => row?.serviceWorkerDetails?.serviceWorkerScope ?? '');
	const version = computed(() => String(row?.serviceWorkerDetails?.serviceWorkerVersionId ?? ''));
	const response = computed(() => (row?.responseTime ? `${row.responseTime.toFixed(2)} ms` : ''));
	const linked = computed(() => row?.gotoSerialNumber ?? 0);

	<div class={outerCls} style={outerStyle} onIdle={() => {
		width = Math.max(window.innerWidth / 3, 200);
		height = window.innerHeight / 3;
	}}>
		<div class={handleCls} onMouseDown={(e) => {
			e.preventDefault();
			resizing = true;
			const move = (ev: MouseEvent) => {
				if (dock === 'right') {
					const next = window.innerWidth - ev.clientX;
					if (next >= 200 && next <= (window.innerWidth * 70) / 100) width = next;
				} else {
					const next = window.innerHeight - ev.clientY;
					if (next >= 35 && next <= window.innerHeight - 50) height = next;
				}
			};
			const up = () => {
				resizing = false;
				document.removeEventListener('mousemove', move);
				document.removeEventListener('mouseup', up);
			};
			document.addEventListener('mousemove', move);
			document.addEventListener('mouseup', up);
		}}></div>
		<div style={sizeStyle} class={sizeCls}>
			<div class={panelCls}>
				<div class="flex items-center justify-between border-b border-gray-300 bg-gray-100 px-3 py-0.5 dark:border-charcoal-400 dark:bg-charcoal-800">
					<div class="text-sm font-medium">Details:</div>
					<CircularButton tooltip="" active={false} onClick={onClose}><X strokeWidth={3} size={14} /></CircularButton>
				</div>
				<div class="flex-1 overflow-auto p-3 text-[.85rem]">
					<div class={layoutCls}>
						<div class={fieldsCls}>
							<div class="flex items-center gap-x-1">
								<span class="font-medium"> Channel: </span>
								@if (channel) {
									<span class="block max-w-96 break-all rounded bg-gray-200 px-1 py-0.5 dark:bg-charcoal-500">{channel}</span>
								}
							</div>
							<div>
								<span class="font-medium">Time: </span>
								<span class="">{time}</span>
							</div>
							<div class="flex w-fit items-center gap-x-1">
								<span class="font-medium">Direction: </span>
								<DirectionBadge direction={dir} />
							</div>
							@if (method) {
								<div class="flex w-fit items-center gap-x-1">
									<span class="text-nowrap font-medium">Method: </span>
									<span class="block max-w-96 break-all rounded bg-gray-200 px-1 py-0.5 dark:bg-charcoal-500">{method}</span>
								</div>
							}
							@if (scope) {
								<div class="flex w-fit items-center gap-x-1">
									<span class="text-nowrap font-medium">SW Scope: </span>
									<span class="block max-w-96 break-all rounded bg-gray-200 px-1 py-0.5 dark:bg-charcoal-500">{scope}</span>
								</div>
							}
							@if (scope) {
								<div class="flex w-fit items-center gap-x-1">
									<span class="text-nowrap font-medium">SW Version ID: </span>
									<span class="block max-w-96 break-all rounded bg-gray-200 px-1 py-0.5 dark:bg-charcoal-500">{version}</span>
								</div>
							}
							@if (response) {
								<div class="flex w-fit items-center gap-x-1">
									<span class="text-nowrap font-medium">Response Time: </span>
									<span class="block max-w-96 break-all rounded bg-gray-200 px-1 py-0.5 dark:bg-charcoal-500">{response}</span>
								</div>
							}
							@if (linked) {
								<div class="flex w-fit items-center gap-x-1">
									<span class="text-nowrap font-medium">Linked Event: </span>
									<span class="block max-w-96 cursor-pointer break-all rounded bg-gray-200 px-1 py-0.5 text-cyan-700 hover:underline dark:bg-charcoal-500 dark:text-cyan-500" onClick={() => gotoRow(linked)}>#{linked}</span>
								</div>
							}
						</div>
						<div class={argsCls}>
							{children}
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
}
