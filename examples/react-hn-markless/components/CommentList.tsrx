import type { CommentRow } from '../lib/thread.ts';

export default function CommentList({ rows, onToggle }: { rows: readonly CommentRow[]; onToggle: (id: number) => void }) @{
	<div>
		@for (const row of rows; key row.key) {
			<div class={row.className}>
				<div class="Spinner" style="width: 66px;" hidden={!row.spinner}>
					<div class="bounce1" style="height: 20px; width: 20px; margin-right: 2px;"></div>
					<div class="bounce2" style="height: 20px; width: 20px; margin-right: 2px;"></div>
					<div class="bounce3" style="height: 20px; width: 20px; margin-right: 2px;"></div>
				</div>
				<div class="Comment__text" hidden={!row.delayed}>
					Unable to load comment – this usually indicates the author has configured a delay. Trying again in 30 seconds.
				</div>
				<div class="Comment__content" hidden={row.kind === 'loading'}>
					<div class="Comment__meta">
						<span hidden={row.kind !== 'comment'}>
							<span
								class="Comment__collapse"
								tabindex="0"
								onClick={(event) => {
									event.preventDefault();
									onToggle(row.id);
								}}
								onKeyPress={(event) => {
									event.preventDefault();
									onToggle(row.id);
								}}
							>
								[{row.collapsed ? '+' : '–'}]
							</span>{' '}
							<a href={row.userHref} class="Comment__user">{row.by}</a>{' '}
							<time datetime={row.timeIso} title={row.timeTitle}>{row.timeText}</time>
							{' | '}
							<a href={row.linkHref}>link</a>{row.deadText}{row.childText}<em hidden={row.childNew <= 0}>{row.childNew} new</em>{row.childClose}
						</span>
						<span hidden={row.kind !== 'deleted'}>[deleted] | <a href={row.hnHref}>view on Hacker News</a></span>
					</div>
					<div class="Comment__text" hidden={row.kind !== 'comment'}>
						<div data-html={row.html}></div>
						<p hidden={!row.replyLink}><a href={row.replyHref}>reply</a></p>
					</div>
				</div>
			</div>
		}
	</div>
}
