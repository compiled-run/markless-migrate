import { element } from '@markless/core';
import { addTag, bootEditor, editorClick, publish } from '../lib/pages.ts';
import Layout from './layout.tsrx';

export default function Editor({ pathname }: { pathname: string }) @{
	const errors = element<HTMLElement>();
	const fieldset = element<HTMLFieldSetElement>();
	const title = element<HTMLInputElement>();
	const description = element<HTMLInputElement>();
	const body = element<HTMLTextAreaElement>();
	const tagField = element<HTMLInputElement>();
	const tags = element<HTMLDivElement>();

	<Layout>
		<app-editor-page>
			<div
				class="editor-page"
				onVisible={() => {
					const els = { errors, fieldset, title, description, body, tagField, tags };
					void bootEditor(els);
				}}
			>
				<div class="container page">
					<div class="row">
						<div class="col-md-10 offset-md-1 col-xs-12">
							<app-list-errors el={errors}><ul class="error-messages"></ul></app-list-errors>
							<form novalidate={true}>
								<fieldset el={fieldset}>
									<fieldset class="form-group">
										<input el={title} class="form-control form-control-lg" name="title" type="text" placeholder="Article Title" />
									</fieldset>
									<fieldset class="form-group">
										<input el={description} class="form-control" name="description" type="text" placeholder="What's this article about?" />
									</fieldset>
									<fieldset class="form-group">
										<textarea el={body} class="form-control" name="body" rows="8" placeholder="Write your article (in markdown)"></textarea>
									</fieldset>
									<fieldset class="form-group">
										<input
											el={tagField}
											class="form-control"
											type="text"
											placeholder="Enter tags"
											onKeyUp={(event) => {
												if (event.key === 'Enter') addTag();
											}}
										/>
										<div el={tags} class="tag-list" onClick={(event) => editorClick(event)}></div>
									</fieldset>
									<button class="btn btn-lg pull-xs-right btn-primary" type="button" onClick={() => void publish()}> Publish Article </button>
								</fieldset>
							</form>
						</div>
					</div>
				</div>
			</div>
		</app-editor-page>
	</Layout>
}
