import { state, type Children } from '@markless/core';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, VERSION, type Settings } from '../lib/hn.ts';
import { navClass } from '../lib/nav.ts';
import { saveOnUnload } from '../lib/cache.ts';

export default function App({ path, children }: { path: string; children?: Children }) @{
	let showSettings = state(false);
	let settings = state<Settings>({ ...DEFAULT_SETTINGS });

	<div id="app">
	<div
		class="App"
		attach={(app) => {
			// React 15 gives every clickable element a no-op onclick, which makes Chrome expose this anchor as a link.
			const settingsLink = app.querySelector<HTMLElement>('.App__settings');
			if (settingsLink) settingsLink.onclick = () => {};
			return saveOnUnload();
		}}
		onVisible={() => {}}
		onClick={(event) => {
			if (showSettings && !(event.target as Element).closest(".App__settings, .Settings")) showSettings = false;
		}}
	>
		<div class="App__wrap">
			<div class="App__header">
				<a href="/news" class="App__homelinkicon"><img src="/img/logo.png" width="16" height="16" alt="" /></a>{' '}
				<a href="/news" class={navClass(path, '/news', 'App__homelink')}>React HN</a>{' '}
				<a href="/newest" class={navClass(path, '/newest')}>new</a>{' | '}
				<a href="/newcomments" class={navClass(path, '/newcomments')}>comments</a> {' | '}
				<a href="/show" class={navClass(path, '/show')}>show</a>{' | '}
				<a href="/ask" class={navClass(path, '/ask')}>ask</a>{' | '}
				<a href="/jobs" class={navClass(path, '/jobs')}>jobs</a>{' | '}
				<a href="/read" class={navClass(path, '/read')}>read</a>
				<a
					class="App__settings"
					tabindex="0"
					onClick={(event) => {
						event.preventDefault();
						event.stopPropagation();
						settings = loadSettings();
						showSettings = !showSettings;
					}}
					onKeyPress={(event) => {
						event.preventDefault();
						settings = loadSettings();
						showSettings = !showSettings;
					}}
				>
					{showSettings ? 'hide settings' : 'settings'}
				</a>
				@if (showSettings) {
					<div
						class="Settings"
						tabindex="-1"
						onVisible={(event) => (event.target as HTMLElement).focus()}
						onClick={(event) => event.stopPropagation()}
					>
						<form
							onInput={(event) => {
								const field = event.target as HTMLInputElement;
								if (field.type === 'checkbox') settings = { ...settings, [field.name]: field.checked };
								else if (field.type === 'number' && field.value) {
									settings = { ...settings, [field.name]: field.value };
									// React 15 writes a controlled input's value back to its attribute, which names the row it sits in.
									field.setAttribute('value', field.value);
								}
								saveSettings(settings);
							}}
						>
							<div class="Settings__setting Settings__setting--checkbox">
								<label for="autoCollapse">
									<input type="checkbox" name="autoCollapse" id="autoCollapse" checked={settings.autoCollapse} /> auto collapse
								</label>
								<p>Automatically collapse comment threads without new comments on page load.</p>
							</div>
							<div class="Settings__setting Settings__setting--checkbox">
								<label for="replyLinks">
									<input type="checkbox" name="replyLinks" id="replyLinks" checked={settings.replyLinks} /> show reply links
								</label>
								<p>Show "reply" links to Hacker News</p>
							</div>
							<div class="Settings__setting Settings__setting--checkbox">
								<label for="showDead">
									<input type="checkbox" name="showDead" id="showDead" checked={settings.showDead} /> show dead
								</label>
								<p>Show items flagged as dead.</p>
							</div>
							<div class="Settings__setting Settings__setting--checkbox">
								<label for="showDeleted">
									<input type="checkbox" name="showDeleted" id="showDeleted" checked={settings.showDeleted} /> show deleted
								</label>
								<p>Show comments flagged as deleted in threads.</p>
							</div>
							<div class="Settings__setting">
								<table>
									<tbody>
										<tr>
											<td><label for="titleFontSize">title font size:</label></td>
											<td><input type="number" min="14" step="1" name="titleFontSize" id="titleFontSize" value={String(settings.titleFontSize)} /></td>
										</tr>
										<tr>
											<td><label for="listSpacing">list spacing:</label></td>
											<td><input type="number" min="0" name="listSpacing" id="listSpacing" value={String(settings.listSpacing)} /></td>
										</tr>
									</tbody>
								</table>
							</div>
						</form>
					</div>
				}
			</div>
			<div class="App__content">{children}</div>
			<div class="App__footer">
				{`react-hn v${VERSION} | `}
				<a href="https://github.com/insin/react-hn">insin/react-hn</a>
			</div>
		</div>
	</div>
	</div>
}
