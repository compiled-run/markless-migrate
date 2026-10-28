import type { PageProps } from '@markless/router';
import { behave, listen } from '../../../registry.ts';

// The preview layout's wrapper (its classes the preview fonts' next/font variables) around the specimen.
export default function Page(_props: PageProps) @{
	<div class="inter_e8e54af-module__r7opxW__variable lora_89cfb44c-module__fAxLeq__variable" onKeyDown={(event) => behave(event)} onIdle={() => listen()}>
		<div class="preview-params w-full">
			<div class="typeset w-full">
				<h1>Building a Streaming Chatbot</h1>
				<p>Specimen text.</p>
			</div>
		</div>
	</div>
}
