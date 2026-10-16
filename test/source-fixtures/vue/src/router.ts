import { createRouter, createWebHistory } from 'vue-router';
import Home from './views/Home.vue';

const routes = [
	{ path: '/', component: Home },
	{ path: '/user/:id(\\d+)', component: () => import('./views/User.vue'), meta: { requiresAuth: true } },
	{
		path: '/admin',
		component: () => import('./views/Admin.vue'),
		meta: { requiresAuth: true, roles: ['admin'] },
		children: [{ path: 'logs', component: () => import('./views/Logs.vue') }],
	},
	{ path: '/:pathMatch(.*)*', component: () => import('./views/NotFound.vue') },
];

export const router = createRouter({ history: createWebHistory(), routes });
