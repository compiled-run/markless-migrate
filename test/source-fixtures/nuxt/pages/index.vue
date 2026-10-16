<script setup lang="ts">
const { data } = await useFetch(`${useRuntimeConfig().public.strapi}/api/articles?fields[0]=title&fields[1]=slug`);
</script>

<template>
	<SiteHeader />
	<ul>
		<li v-for="a in data.data" :key="a.id">{{ a.title }}</li>
	</ul>
</template>
