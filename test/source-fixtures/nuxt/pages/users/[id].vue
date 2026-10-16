<script setup lang="ts">
definePageMeta({ middleware: ['auth'] });
const theme = useCookie('theme');
</script>

<template>
	<p>{{ theme }}</p>
</template>
