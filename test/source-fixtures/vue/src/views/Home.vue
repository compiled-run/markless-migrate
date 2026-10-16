<script setup lang="ts">
import axios from 'axios';
import posthog from 'posthog-js';
import PostList from '../components/PostList.vue';

const { data } = await axios.get('https://api.example.com/posts');
const showNew = posthog.isFeatureEnabled('new-home');
async function save() {
	await axios.post('/api/drafts', { title: data.title });
}
</script>

<template>
	<PostList :posts="data" />
	<button @click="save">Save</button>
</template>
