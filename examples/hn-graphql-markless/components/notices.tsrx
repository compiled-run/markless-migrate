export function ShowNotice() @{
	<>
		<tr style="height:5px"></tr>
		<tr>
			<td colspan="2"></td>
			<td>
				{'Please read the '}
				<a href="/showhn">
					<u>rules</u>
				</a>
				{'. You can also browse the '}
				<a href="/shownew">
					<u>newest</u>
				</a>
				{' Show HNs.'}
			</td>
		</tr>
		<tr style="height:10px"></tr>
	</>
}

export function JobsNotice() @{
	<>
		<tr style="height:20px"></tr>
		<tr>
			<td></td>
			<td>
				<img alt="" src="/static/s.gif" height="1" width="14" />
			</td>
			<td>
				{'These are jobs at startups that were funded by Y Combinator. You can also get a job at a YC startup through '}
				<a href="https://triplebyte.com/?ref=yc_jobs">
					<u>Triplebyte</u>
				</a>
				.
			</td>
		</tr>
		<tr style="height:20px"></tr>
	</>
}
