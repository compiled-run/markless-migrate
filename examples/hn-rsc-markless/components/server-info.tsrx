export default function ServerInfo() @{
	const renderedAt = new Date().toTimeString();
	<div class="server-info">
		Rendered at {renderedAt} with Vercel.
		<style>
			.server-info {
				text-align: center;
				font-size: 14px;
				padding-bottom: 20px;
			}
		</style>
	</div>
}
