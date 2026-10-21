export function AppLogo({ name }: { readonly name: string }) @{
	<>
	@if (name === 'Discord') {
		<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="24" height="24" class="[&>path]:stroke-current" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<title>Discord</title>
			<path stroke-width="0" d="M0 0h24v24H0z" fill="none" />
			<path d="M8 12a1 1 0 1 0 2 0a1 1 0 0 0 -2 0" />
			<path d="M14 12a1 1 0 1 0 2 0a1 1 0 0 0 -2 0" />
			<path d="M15.5 17c0 1 1.5 3 2 3c1.5 0 2.833 -1.667 3.5 -3c.667 -1.667 .5 -5.833 -1.5 -11.5c-1.457 -1.015 -3 -1.34 -4.5 -1.5l-.972 1.923a11.913 11.913 0 0 0 -4.053 0l-.975 -1.923c-1.5 .16 -3.043 .485 -4.5 1.5c-2 5.667 -2.167 9.833 -1.5 11.5c.667 1.333 2 3 3.5 3c.5 0 2 -2 2 -3" />
			<path d="M7 16.5c3.5 1 6.5 1 10 0" />
		</svg>
	}
	@if (name === 'Docker') {
		<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="24" height="24" class="[&>path]:stroke-current" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<title>Docker</title>
			<path stroke-width="0" d="M0 0h24v24H0z" fill="none" />
			<path d="M22 12.54c-1.804 -.345 -2.701 -1.08 -3.523 -2.94c-.487 .696 -1.102 1.568 -.92 2.4c.028 .238 -.32 1 -.557 1h-14c0 5.208 3.164 7 6.196 7c4.124 .022 7.828 -1.376 9.854 -5c1.146 -.101 2.296 -1.505 2.95 -2.46z" />
			<path d="M5 10h3v3h-3z" />
			<path d="M8 10h3v3h-3z" />
			<path d="M11 10h3v3h-3z" />
			<path d="M8 7h3v3h-3z" />
			<path d="M11 7h3v3h-3z" />
			<path d="M11 4h3v3h-3z" />
			<path d="M4.571 18c1.5 0 2.047 -.074 2.958 -.78" />
			<path d="M10 16l0 .01" />
		</svg>
	}
	@if (name === 'Figma') {
		<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="24" height="24" class="[&>path]:stroke-current" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<title>Figma</title>
			<path stroke-width="0" d="M0 0h24v24H0z" fill="none" />
			<path d="M15 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" />
			<path d="M6 3m0 3a3 3 0 0 1 3 -3h6a3 3 0 0 1 3 3v0a3 3 0 0 1 -3 3h-6a3 3 0 0 1 -3 -3z" />
			<path d="M9 9a3 3 0 0 0 0 6h3m-3 0a3 3 0 1 0 3 3v-15" />
		</svg>
	}
	@if (name === 'GitHub') {
		<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="24" height="24" class="[&>path]:stroke-current" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<title>GitHub</title>
			<path stroke-width="0" d="M0 0h24v24H0z" fill="none" />
			<path d="M9 19c-4.3 1.4 -4.3 -2.5 -6 -3m12 5v-3.5c0 -1 .1 -1.4 -.5 -2c2.8 -.3 5.5 -1.4 5.5 -6a4.6 4.6 0 0 0 -1.3 -3.2a4.2 4.2 0 0 0 -.1 -3.2s-1.1 -.3 -3.5 1.3a12.3 12.3 0 0 0 -6.2 0c-2.4 -1.6 -3.5 -1.3 -3.5 -1.3a4.2 4.2 0 0 0 -.1 3.2a4.6 4.6 0 0 0 -1.3 3.2c0 4.6 2.7 5.7 5.5 6c-.6 .6 -.6 1.2 -.5 2v3.5" />
		</svg>
	}
	@if (name === 'GitLab') {
		<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="24" height="24" class="[&>path]:stroke-current" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<title>GitLab</title>
			<path stroke-width="0" d="M0 0h24v24H0z" fill="none" />
			<path d="M21 14l-9 7l-9 -7l3 -11l3 7h6l3 -7z" />
		</svg>
	}
	@if (name === 'Gmail') {
		<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="24" height="24" class="[&>path]:stroke-current" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<title>Gmail</title>
			<path stroke-width="0" d="M0 0h24v24H0z" fill="none" />
			<path d="M16 20h3a1 1 0 0 0 1 -1v-14a1 1 0 0 0 -1 -1h-3v16z" />
			<path d="M5 20h3v-16h-3a1 1 0 0 0 -1 1v14a1 1 0 0 0 1 1z" />
			<path d="M16 4l-4 4l-4 -4" />
			<path d="M4 6.5l8 7.5l8 -7.5" />
		</svg>
	}
	@if (name === 'Medium') {
		<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="24" height="24" class="[&>path]:stroke-current" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<title>Medium</title>
			<path stroke-width="0" d="M0 0h24v24H0z" fill="none" />
			<path d="M4 4m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z" />
			<path d="M8 9h1l3 3l3 -3h1" />
			<path d="M8 15l2 0" />
			<path d="M14 15l2 0" />
			<path d="M9 9l0 6" />
			<path d="M15 9l0 6" />
		</svg>
	}
	@if (name === 'Notion') {
		<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="24" height="24" class="[&>path]:stroke-current" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<title>Notion</title>
			<path stroke-width="0" d="M0 0h24v24H0z" fill="none" />
			<path d="M11 17.5v-6.5h.5l4 6h.5v-6.5" />
			<path d="M19.077 20.071l-11.53 .887a1 1 0 0 1 -.876 -.397l-2.471 -3.294a1 1 0 0 1 -.2 -.6v-10.741a1 1 0 0 1 .923 -.997l11.389 -.876a2 2 0 0 1 1.262 .33l1.535 1.023a2 2 0 0 1 .891 1.664v12.004a1 1 0 0 1 -.923 .997z" />
			<path d="M4.5 5.5l2.5 2.5" />
			<path d="M20 7l-13 1v12.5" />
		</svg>
	}
	@if (name === 'Skype') {
		<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="24" height="24" class="[&>path]:stroke-current" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<title>Skype</title>
			<path stroke-width="0" d="M0 0h24v24H0z" fill="none" />
			<path d="M12 3a9 9 0 0 1 8.603 11.65a4.5 4.5 0 0 1 -5.953 5.953a9 9 0 0 1 -11.253 -11.253a4.5 4.5 0 0 1 5.953 -5.954a8.987 8.987 0 0 1 2.65 -.396z" />
			<path d="M8 14.5c.5 2 2.358 2.5 4 2.5c2.905 0 4 -1.187 4 -2.5c0 -1.503 -1.927 -2.5 -4 -2.5s-4 -1 -4 -2.5c0 -1.313 1.095 -2.5 4 -2.5c1.642 0 3.5 .5 4 2.5" />
		</svg>
	}
	@if (name === 'Slack') {
		<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="24" height="24" class="[&>path]:stroke-current" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<title>Slack</title>
			<path stroke-width="0" d="M0 0h24v24H0z" fill="none" />
			<path d="M12 12v-6a2 2 0 0 1 4 0v6m0 -2a2 2 0 1 1 2 2h-6" />
			<path d="M12 12h6a2 2 0 0 1 0 4h-6m2 0a2 2 0 1 1 -2 2v-6" />
			<path d="M12 12v6a2 2 0 0 1 -4 0v-6m0 2a2 2 0 1 1 -2 -2h6" />
			<path d="M12 12h-6a2 2 0 0 1 0 -4h6m-2 0a2 2 0 1 1 2 -2v6" />
		</svg>
	}
	@if (name === 'Stripe') {
		<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="24" height="24" class="[&>path]:stroke-current" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<title>Stripe</title>
			<path stroke-width="0" d="M0 0h24v24H0z" fill="none" />
			<path d="M11.453 8.056c0 -.623 .518 -.979 1.442 -.979c1.69 0 3.41 .343 4.605 .923l.5 -4c-.948 -.449 -2.82 -1 -5.5 -1c-1.895 0 -3.373 .087 -4.5 1c-1.172 .956 -2 2.33 -2 4c0 3.03 1.958 4.906 5 6c1.961 .69 3 .743 3 1.5c0 .735 -.851 1.5 -2 1.5c-1.423 0 -3.963 -.609 -5.5 -1.5l-.5 4c1.321 .734 3.474 1.5 6 1.5c2 0 3.957 -.468 5.084 -1.36c1.263 -.979 1.916 -2.268 1.916 -4.14c0 -3.096 -1.915 -4.547 -5 -5.637c-1.646 -.605 -2.544 -1.07 -2.544 -1.807z" />
		</svg>
	}
	@if (name === 'Telegram') {
		<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="24" height="24" class="[&>path]:stroke-current" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<title>Telegram</title>
			<path stroke-width="0" d="M0 0h24v24H0z" fill="none" />
			<path d="M15 10l-4 4l6 6l4 -16l-18 7l4 2l2 6l3 -4" />
		</svg>
	}
	@if (name === 'Trello') {
		<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="24" height="24" class="[&>path]:stroke-current" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<title>Trello</title>
			<path stroke-width="0" d="M0 0h24v24H0z" fill="none" />
			<path d="M4 4m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z" />
			<path d="M7 7h3v10h-3z" />
			<path d="M14 7h3v6h-3z" />
		</svg>
	}
	@if (name === 'WhatsApp') {
		<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="24" height="24" class="[&>path]:stroke-current" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<title>WhatsApp</title>
			<path stroke-width="0" d="M0 0h24v24H0z" fill="none" />
			<path d="M3 21l1.65 -3.8a9 9 0 1 1 3.4 2.9l-5.05 .9" />
			<path d="M9 10a.5 .5 0 0 0 1 0v-1a.5 .5 0 0 0 -1 0v1a5 5 0 0 0 5 5h1a.5 .5 0 0 0 0 -1h-1a.5 .5 0 0 0 0 1" />
		</svg>
	}
	@if (name === 'Zoom') {
		<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="24" height="24" class="[&>path]:stroke-current" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<title>Zoom</title>
			<path stroke-width="0" d="M0 0h24v24H0z" fill="none" />
			<path d="M17.011 9.385v5.128l3.989 3.487v-12z" />
			<path d="M3.887 6h10.08c1.468 0 3.033 1.203 3.033 2.803v8.196a.991 .991 0 0 1 -.975 1h-10.373c-1.667 0 -2.652 -1.5 -2.652 -3l.01 -8a.882 .882 0 0 1 .208 -.71a.841 .841 0 0 1 .67 -.287z" />
		</svg>
	}
	</>
}
