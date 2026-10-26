// inside an @if/@else: rows over an async value the page passes in; a click asks the page to fetch again
export default function FeedRows({ feed, onAnswered }: { feed: { empty: boolean; items: { id: number; n: string; cls: string }[] }; onAnswered: () => void }) @{
	@if (feed.empty) {
		<p>empty</p>
	} @else {
	<table>
		@for (const row of feed.items; key row.id) {
			<tbody>
				<tr>
					<td>
						<a class={row.cls} onClick={() => onAnswered()}>{row.n}</a>
					</td>
				</tr>
			</tbody>
		}
	</table>
	}
}
