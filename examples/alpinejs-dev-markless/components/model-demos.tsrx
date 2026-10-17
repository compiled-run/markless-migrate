import { computed, state } from '@markless/core';

// The /directives/model demos: each Alpine x-data block becomes a component with its own state.
const COLORS = ['Red', 'Orange', 'Yellow'];

function toggle(list: readonly string[], value: string, on: boolean): string[] {
	return on ? [...list.filter((item) => item !== value), value] : list.filter((item) => item !== value);
}

export function TextDemo() @{
	let message = state('');

	<div class="demo">
		<div>
			<input type="text" placeholder="Type message..." value={message} onInput={(event) => (message = (event.target as HTMLInputElement).value)} />
			<div class="pt-4">{message}</div>
		</div>
	</div>
}

export function ChangeMessageDemo() @{
	let message = state('');

	<div class="demo">
		<div>
			<input type="text" placeholder="Type message..." value={message} onInput={(event) => (message = (event.target as HTMLInputElement).value)} />
			{' '}
			<button onClick={() => (message = 'changed')}>Change Message</button>
		</div>
	</div>
}

export function TextInputDemo() @{
	let message = state('');

	<div class="demo">
		<div>
			<input type="text" placeholder="Type message" value={message} onInput={(event) => (message = (event.target as HTMLInputElement).value)} />
			<div class="pt-4">{message}</div>
		</div>
	</div>
}

export function TextareaDemo() @{
	let message = state('');

	<div class="demo">
		<div>
			<textarea placeholder="Type message" value={message} onInput={(event) => (message = (event.target as HTMLInputElement).value)}></textarea>
			<div class="pt-4">{message}</div>
		</div>
	</div>
}

export function CheckboxDemo() @{
	let open = state('');

	<div class="demo">
		<div>
			<input type="checkbox" id="checkbox" onChange={(event) => (open = (event.target as HTMLInputElement).checked ? 'true' : 'false')} />
			{' '}
			<label for="checkbox">{open}</label>
		</div>
	</div>
}

export function ColorsDemo() @{
	let colors = state<string[]>([]);
	const colorList = computed(() => colors.join(','));

	<div class="demo">
		<div>
			<input type="checkbox" value="red" onChange={(event) => (colors = toggle(colors, 'red', (event.target as HTMLInputElement).checked))} />
			{' '}
			<input type="checkbox" value="orange" onChange={(event) => (colors = toggle(colors, 'orange', (event.target as HTMLInputElement).checked))} />
			{' '}
			<input type="checkbox" value="yellow" onChange={(event) => (colors = toggle(colors, 'yellow', (event.target as HTMLInputElement).checked))} />
			<div class="pt-4">
				{'Colors: '}
				<span>{colorList}</span>
			</div>
		</div>
	</div>
}

export function RadioDemo() @{
	let answer = state('');

	<div class="demo">
		<div>
			<input type="radio" value="yes" name="answer" onChange={() => (answer = 'yes')} />
			{' '}
			<input type="radio" value="no" name="answer" onChange={() => (answer = 'no')} />
			<div class="pt-4">
				{'Answer: '}
				<span>{answer}</span>
			</div>
		</div>
	</div>
}

export function SelectDemo() @{
	let color = state('');

	<div class="demo">
		<div>
			<select onChange={(event) => (color = (event.target as HTMLInputElement).value)}>
				<option>Red</option>
				<option>Orange</option>
				<option>Yellow</option>
			</select>
			<div class="pt-4">
				{'Color: '}
				<span>{color}</span>
			</div>
		</div>
	</div>
}

export function PlaceholderSelectDemo() @{
	let color = state('');

	<div class="demo">
		<div>
			<select onChange={(event) => (color = (event.target as HTMLInputElement).value)}>
				<option value="" disabled selected>Select A Color</option>
				<option>Red</option>
				<option>Orange</option>
				<option>Yellow</option>
			</select>
			<div class="pt-4">
				{'Color: '}
				<span>{color}</span>
			</div>
		</div>
	</div>
}

export function MultipleSelectDemo() @{
	let color = state('');

	<div class="demo">
		<div>
			<select multiple onChange={(event) => (color = [...(event.target as HTMLSelectElement).selectedOptions].map((option) => option.value).join(','))}>
				<option>Red</option>
				<option>Orange</option>
				<option>Yellow</option>
			</select>
			<div class="pt-4">
				{'Color: '}
				<span>{color}</span>
			</div>
		</div>
	</div>
}

export function DynamicSelectDemo() @{
	let color = state('');

	<div class="demo">
		<div>
			<select onChange={(event) => (color = (event.target as HTMLInputElement).value)}>
				@for (const option of COLORS; key option) {
					<option>{option}</option>
				}
			</select>
			<div class="pt-4">
				{'Color: '}
				<span>{color}</span>
			</div>
		</div>
	</div>
}

export function RangeDemo() @{
	let range = state('0.5');

	<div class="demo">
		<div>
			<input type="range" min="0" max="1" step="0.1" value={range} onInput={(event) => (range = (event.target as HTMLInputElement).value)} />
			<div class="pt-4">{range}</div>
		</div>
	</div>
}

export function BlurEnterDemo() @{
	let search = state('');

	<div class="demo">
		<div>
			<input
				type="text"
				placeholder="Press Enter or click away"
				onBlur={(event) => (search = (event.target as HTMLInputElement).value)}
				onKeyDown={(event) => {
					if (event.key === 'Enter') search = (event.target as HTMLInputElement).value;
				}}
			/>
			<div class="pt-4">
				{'Search: '}
				<span>{search}</span>
			</div>
		</div>
	</div>
}

export function ProgrammaticDemo() @{
	let username = state('calebporzio');

	<div class="demo">
		<div>
			<div></div>
			<button onClick={() => (username = 'phantomatrix')}>{" Change username to: 'phantomatrix' "}</button>
			{' '}
			<span>{username}</span>
		</div>
	</div>
}
