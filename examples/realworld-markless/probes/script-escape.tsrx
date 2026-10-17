// Gap 9: the script text is entity-escaped (=> becomes =&gt;), so this inline script is a syntax error.
export default function Probe() @{
	<main>
		<script>{"addEventListener('load', () => document.body.append('loaded'))"}</script>
	</main>
}
