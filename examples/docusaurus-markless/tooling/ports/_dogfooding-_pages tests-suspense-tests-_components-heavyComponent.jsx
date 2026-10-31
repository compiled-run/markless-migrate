// The suspense test page's HeavyComponent: lib/site.ts runs its click handler, an alert.
export default function HeavyComponent() {
	return (
		<div style={{ border: 'solid', margin: 10, padding: 10 }}>
			<button type="button" data-mm-alert="click">
				HeavyComponent
			</button>
		</div>
	);
}
