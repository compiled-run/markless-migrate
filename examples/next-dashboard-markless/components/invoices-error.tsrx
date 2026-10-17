export default function InvoicesError() @{
	<main class="flex h-full flex-col items-center justify-center">
		<h2 class="text-center">Something went wrong!</h2>
		<button class="mt-4 rounded-md bg-blue-500 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-400" onClick={() => window.location.reload()}>Try again</button>
	</main>
}
