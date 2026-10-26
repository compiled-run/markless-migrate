import BlankLayout from '../components/blank-layout.tsrx';

export default function Page() @{
	<BlankLayout>
		<b>Reset your password</b>
		<br />
		<br />
		<form method="post" action="/x">
			<input type="hidden" name="fnid" value="SW3mxENlH7rdjgxwWaobR5" />
			<input type="hidden" name="fnop" value="forgot-password" />
			username:{' '}
			<input type="text" name="s" size="20" />
			<br />
			<br />
			<input type="submit" value="Send reset email" />
		</form>
	</BlankLayout>
}
