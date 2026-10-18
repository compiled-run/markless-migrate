// Panel.tsx's columnDefs and defaultColDef ({ sortable: true, filter: false, resizable: true }), as data: the
// valueFormatter and cell renderers are the Time, Direction, Channel and Data cells the grid port renders.
import type { ColDef } from '../lib/parity/ag-grid-react/model.ts';

export const columnDefs: ColDef[] = [
	{
		colId: 'serialNumber',
		headerName: 'No.',
		width: 55,
		cellClass: 'flex !p-1 items-center h-full text-xs',
		headerClass: '!h-6 !px-1.5',
		filter: 'none',
		resizable: true,
	},
	{
		colId: 'timestamp',
		headerName: 'Time',
		width: 100,
		cellClass: 'flex !p-1 items-center h-full text-xs',
		headerClass: '!h-6 !px-1.5',
		filter: 'none',
		resizable: true,
	},
	{
		colId: 'direction',
		headerName: 'Direction',
		width: 91,
		cellClass: 'flex !p-1 items-center h-full',
		headerClass: '!h-6 !px-1.5',
		filter: 'direction',
		resizable: true,
	},
	{
		colId: 'channel',
		headerName: 'Channel',
		flex: 1,
		cellClass: 'font-roboto text-[13px] !p-1 h-full flex items-center',
		headerClass: '!h-6 !px-1.5',
		filter: 'text',
		resizable: true,
	},
	{
		colId: 'args',
		headerName: 'Data',
		flex: 3,
		cellClass: 'flex !p-1 items-center h-full',
		headerClass: '!h-6 !px-1.5',
		filter: 'text',
		resizable: false,
	},
];
