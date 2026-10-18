import { AgGridReact } from 'ag-grid-react';
import Badge from './Badge';

export default function App() {
	return <AgGridReact rowData={[]} columnDefs={[{ field: 'kind', cellRenderer: Badge }]} />;
}
