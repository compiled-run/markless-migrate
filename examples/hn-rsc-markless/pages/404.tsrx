import type { PageProps } from '@markless/router';
import Footer from '../components/footer.tsrx';
import Layout from '../components/layout.tsrx';
import ServerInfo from '../components/server-info.tsrx';

export default function NotFound({ http }: PageProps) @{
	http.response.headers.set('cache-control', 'private, no-cache, no-store, max-age=0, must-revalidate');
	<Layout>
		<div class="not-found">
			<div>
				<h1 class="next-error-h1">404</h1>
				<div class="message">
					<h2>This page could not be found.</h2>
				</div>
			</div>
		</div>
		<Footer />
		<ServerInfo />
		<style>
			.not-found {
				font-family: system-ui, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji';
				height: 100vh;
				text-align: center;
				display: flex;
				flex-direction: column;
				align-items: center;
				justify-content: center;
			}
			.next-error-h1 {
				display: inline-block;
				margin: 0 20px 0 0;
				padding: 0 23px 0 0;
				font-size: 24px;
				font-weight: 500;
				vertical-align: top;
				line-height: 49px;
				border-right: 1px solid rgba(0, 0, 0, 0.3);
			}
			.message {
				display: inline-block;
			}
			.message h2 {
				font-size: 14px;
				font-weight: 400;
				line-height: 49px;
				margin: 0;
			}
		</style>
	</Layout>
}
