export default function MarkerList({ data }: { data: { rows: { id: string; text: string }[] } }) @{
	<ul>
		@for (const row of data.rows; key row.id) {
			<li>{row.text}</li>
		}
	</ul>
}
