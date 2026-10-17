export default function HeadingSection({ heading, subheading }: { readonly heading: string; readonly subheading?: string }) @{
	<section class="wrapper border-t px-5 sm:px-10 py-14 sm:py-28 flex flex-col justify-center gap-3 text-center items-center">
		<h2 class="text-white max-w-2xl text-balance text-center">{heading}</h2>
		@if (subheading) {
			<p class="max-w-md text-white/70 text-balance sm:text-pretty">{subheading}</p>;
		}
	</section>
}
