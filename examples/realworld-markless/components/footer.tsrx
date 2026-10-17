export default function Footer() @{
	const year = new Date().getFullYear();

	<app-layout-footer>
		<footer>
			<div class="container">
				<a class="logo-font" href="/"><img src="assets/conduit-logo.svg" alt="Conduit" class="footer-logo" /></a>
				<span class="attribution">
					{' © '}{year}{'. An interactive learning project from '}
					<a href="https://github.com/gothinkster/realworld">RealWorld OSS Project</a>{'. Code licensed under MIT. '}
				</span>
			</div>
		</footer>
	</app-layout-footer>
}
