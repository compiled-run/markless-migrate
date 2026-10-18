import { element } from '@markless/core';
import { bootHome, listClick } from '../lib/pages.ts';
import Layout from './layout.tsrx';

export default function Home({ pathname, search, tag }: { pathname: string; search: string; tag: string }) @{
	const banner = element<HTMLDivElement>();
	const bannerText = element<HTMLParagraphElement>();
	const feedToggle = element<HTMLUListElement>();
	const list = element<HTMLElement>();
	const sidebar = element<HTMLDivElement>();
	const tags = element<HTMLDivElement>();
	const loadingTags = element<HTMLDivElement>();
	const noTags = element<HTMLDivElement>();
	const params = new URLSearchParams(search);
	const globalActive = !tag && params.get('feed') !== 'following';

	<Layout>
		<app-home-page>
			<div
				class="home-page"
				onIdle={() => {
					const els = { banner, bannerText, feedToggle, list, sidebar, tags, loadingTags, noTags };
					void bootHome(els);
				}}
			>
				<div el={banner} class="banner">
					<div class="container">
						<h1 class="logo-font"><img src="assets/conduit-logo.svg" alt="Conduit" class="banner-logo" /></h1>
						<p el={bannerText}>
							{' This is the '}
							<a href="https://github.com/realworld-apps/angular-realworld-example-app">Angular frontend</a>
							{' demo from the '}
							<a href="https://github.com/realworld-apps/realworld">Realworld</a>
							{' project.'}
							{' This demo is connected to a demo backend that enforces session isolation. '}
						</p>
					</div>
				</div>
				<div class="container page">
					<div class="row">
						<div class="col-md-9">
							<div class="feed-toggle">
								<ul el={feedToggle} class="nav nav-pills outline-active">
									<li class="nav-item">
										<a class={globalActive ? 'nav-link active' : 'nav-link'} href="/"> Global Feed </a>
									</li>
									<li class="nav-item" hidden={!tag}>
										<a class="nav-link active"><i class="ion-pound"></i>{` ${tag} `}</a>
									</li>
								</ul>
							</div>
							<app-article-list el={list} onClick={(event) => void listClick(event)}></app-article-list>
						</div>
						<div el={sidebar} class="col-md-3" hidden={true}>
							<div class="sidebar">
								<p>Popular Tags</p>
								<div el={tags} class="tag-list"></div>
								<div el={loadingTags}>Loading tags...</div>
								<div el={noTags} hidden={true}>No tags are here... yet.</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</app-home-page>
	</Layout>
}
