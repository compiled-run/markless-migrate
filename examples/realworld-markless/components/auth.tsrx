import { element } from '@markless/core';
import { authValidity, bootGuestOnly, submitAuth } from '../lib/pages.ts';
import Layout from './layout.tsrx';

export default function Auth({ pathname, register }: { pathname: string; register: boolean }) @{
	const page = element<HTMLElement>();
	const errors = element<HTMLElement>();
	const fieldset = element<HTMLFieldSetElement>();
	const button = element<HTMLButtonElement>();
	const username = element<HTMLInputElement>();
	const email = element<HTMLInputElement>();
	const password = element<HTMLInputElement>();
	const title = register ? 'Sign up' : 'Sign in';

	<Layout>
		<app-auth-page
			el={page}
			onIdle={() => {
				const node = page;
				void bootGuestOnly(node);
			}}
		>
			<div class="auth-page">
				<div class="container page">
					<div class="row">
						<div class="col-md-6 offset-md-3 col-xs-12">
							<h1 class="text-xs-center">{title}</h1>
							<p class="text-xs-center">
								@if (register) {
									<a href="/login">Have an account?</a>
								} @else {
									<a href="/register">Need an account?</a>
								}
							</p>
							<app-list-errors el={errors}><ul class="error-messages"></ul></app-list-errors>
							<form
								novalidate={true}
								onInput={() => {
									const els = { page, errors, fieldset, button, username, email, password };
									authValidity(els, register);
								}}
								onSubmit={(event) => {
									event.preventDefault();
									const els = { page, errors, fieldset, button, username, email, password };
									void submitAuth(els, register);
								}}
							>
								<fieldset el={fieldset}>
									<fieldset class="form-group">
										@if (register) {
											<input el={username} name="username" placeholder="Username" class="form-control form-control-lg" type="text" />
										}
									</fieldset>
									<fieldset class="form-group">
										<input el={email} name="email" placeholder="Email" class="form-control form-control-lg" type="text" />
									</fieldset>
									<fieldset class="form-group">
										<input el={password} name="password" placeholder="Password" class="form-control form-control-lg" type="password" />
									</fieldset>
									<button el={button} class="btn btn-lg btn-primary pull-xs-right" disabled={true} type="submit">{` ${title} `}</button>
								</fieldset>
							</form>
						</div>
					</div>
				</div>
			</div>
		</app-auth-page>
	</Layout>
}
