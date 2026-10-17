import { element } from '@markless/core';
import type { PageProps } from '@markless/router';
import Layout from '../components/layout.tsrx';
import { bootSettings, logout, submitSettings } from '../lib/pages.ts';

export default function Settings({ url }: PageProps) @{
	const errors = element<HTMLElement>();
	const fieldset = element<HTMLFieldSetElement>();
	const image = element<HTMLInputElement>();
	const username = element<HTMLInputElement>();
	const bio = element<HTMLTextAreaElement>();
	const email = element<HTMLInputElement>();
	const password = element<HTMLInputElement>();

	<Layout>
		<app-settings-page>
			<div
				class="settings-page"
				onVisible={() => {
					const els = { errors, fieldset, image, username, bio, email, password };
					void bootSettings(els);
				}}
			>
				<div class="container page">
					<div class="row">
						<div class="col-md-6 offset-md-3 col-xs-12">
							<h1 class="text-xs-center">Your Settings</h1>
							<app-list-errors el={errors}><ul class="error-messages"></ul></app-list-errors>
							<form
								novalidate={true}
								onSubmit={(event) => {
									event.preventDefault();
									const els = { errors, fieldset, image, username, bio, email, password };
									void submitSettings(els);
								}}
							>
								<fieldset el={fieldset}>
									<fieldset class="form-group">
										<input el={image} class="form-control" type="text" placeholder="URL of profile picture" name="image" />
									</fieldset>
									<fieldset class="form-group">
										<input el={username} class="form-control form-control-lg" type="text" placeholder="Username" name="username" />
									</fieldset>
									<fieldset class="form-group">
										<textarea el={bio} class="form-control form-control-lg" rows="8" placeholder="Short bio about you" name="bio"></textarea>
									</fieldset>
									<fieldset class="form-group">
										<input el={email} class="form-control form-control-lg" type="email" placeholder="Email" name="email" />
									</fieldset>
									<fieldset class="form-group">
										<input el={password} class="form-control form-control-lg" type="password" placeholder="New Password" name="password" />
									</fieldset>
									<button class="btn btn-lg btn-primary pull-xs-right" type="submit">Update Settings</button>
								</fieldset>
							</form>
							<hr />
							<button class="btn btn-outline-danger" onClick={() => logout()}>Or click here to logout.</button>
						</div>
					</div>
				</div>
			</div>
		</app-settings-page>
	</Layout>
}
