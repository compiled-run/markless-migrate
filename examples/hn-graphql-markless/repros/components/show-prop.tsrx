export default function ShowProp({ data }: { data: { text: string } }) @{
	<div>
		@try {
			<p id="one">{data.text}</p>
		} @pending {
			<p id="one">pending</p>
		}
	</div>
}
