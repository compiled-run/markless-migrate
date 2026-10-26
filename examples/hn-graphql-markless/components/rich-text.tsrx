import type { Block, Inline } from '../lib/html.ts';

// react-render-html's output for HN's markup: top-level runs, and <p> or <pre> blocks of runs.
function Paragraph({ inlines }: { inlines: readonly Inline[] }) @{
	<p>
		@for (const run of inlines; key run.key) {
			@switch (run.kind) {
				@case 'a': {
					<a href={run.href} rel={run.rel}>{run.text}</a>
				}
				@case 'i': {
					<i>{run.text}</i>
				}
				@case 'code': {
					<code>{run.text}</code>
				}
				@default: {
					<>{run.text}</>
				}
			}
		}
	</p>
}

function Preformatted({ inlines }: { inlines: readonly Inline[] }) @{
	<pre>
		@for (const run of inlines; key run.key) {
			@switch (run.kind) {
				@case 'a': {
					<a href={run.href} rel={run.rel}>{run.text}</a>
				}
				@case 'i': {
					<i>{run.text}</i>
				}
				@case 'code': {
					<code>{run.text}</code>
				}
				@default: {
					<>{run.text}</>
				}
			}
		}
	</pre>
}

export function CommentText({ blocks }: { blocks: readonly Block[] }) @{
	<span>
		@for (const block of blocks; key block.key) {
			@switch (block.kind) {
				@case 'p': {
					<Paragraph inlines={block.inlines} />
				}
				@case 'pre': {
					<Preformatted inlines={block.inlines} />
				}
				@case 'a': {
					<a href={block.href} rel={block.rel}>{block.text}</a>
				}
				@case 'i': {
					<i>{block.text}</i>
				}
				@case 'code': {
					<code>{block.text}</code>
				}
				@default: {
					<>{block.text}</>
				}
			}
		}
	</span>
}

export function AboutCell({ blocks }: { blocks: readonly Block[] }) @{
	<td>
		@for (const block of blocks; key block.key) {
			@switch (block.kind) {
				@case 'p': {
					<Paragraph inlines={block.inlines} />
				}
				@case 'pre': {
					<Preformatted inlines={block.inlines} />
				}
				@case 'a': {
					<a href={block.href} rel={block.rel}>{block.text}</a>
				}
				@case 'i': {
					<i>{block.text}</i>
				}
				@case 'code': {
					<code>{block.text}</code>
				}
				@default: {
					<>{block.text}</>
				}
			}
		}
	</td>
}
