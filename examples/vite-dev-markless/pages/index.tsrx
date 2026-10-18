import TopBanner from '../components/top-banner.tsrx';
import Header from '../components/header.tsrx';
import Hero from '../components/hero.tsrx';
import TrustedBy from '../components/trusted-by.tsrx';
import LogoGrid from '../components/logo-grid.tsrx';
import HeadingSection from '../components/heading-section.tsrx';
import FeatureGrid1 from '../components/feature-grid-1.tsrx';
import FeatureGrid2 from '../components/feature-grid-2.tsrx';
import Frameworks from '../components/frameworks.tsrx';
import Community from '../components/community.tsrx';
import Sponsors from '../components/sponsors.tsrx';
import Spacer from '../components/spacer.tsrx';
import Footer from '../components/footer.tsrx';

export default function Home() @{
	<div class="marketing-layout" data-theme="dark" data-variant="vite" data-v-56d116fe="">
		<TopBanner />
		<Header />
		<div style="position:relative;" data-v-56d116fe="">
			<div>
				<div style="display:none;" hidden data-nosnippet>Are you an LLM? View /llms.txt for optimized Markdown documentation, or /llms-full.txt for full documentation bundle</div>
				<Hero />
				<TrustedBy />
				<LogoGrid />
				<HeadingSection heading="Redefining developer experience" subheading="Vite makes web development enjoyable again" />
				<FeatureGrid1 />
				<HeadingSection heading="A shared foundation to build upon" />
				<FeatureGrid2 />
				<HeadingSection heading="Powering your favorite frameworks and tools" />
				<Frameworks />
				<Community />
				<Sponsors />
				<Spacer />
				<Footer />
			</div>
		</div>
	</div>
}
