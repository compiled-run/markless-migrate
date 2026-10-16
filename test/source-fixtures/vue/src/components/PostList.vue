<script setup lang="ts">
defineProps<{ posts: unknown[] }>();
</script>

<template>
	<ul><li v-for="p in posts">{{ p }}</li></ul>
</template>
