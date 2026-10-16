<script>
	import Card from '$lib/Card.svelte';
	let { data } = $props();
</script>

{#each data.posts as post}
	<Card title={post.title} />
{/each}
