import { Routes } from '@angular/router';

export const ADMIN_ROUTES: Routes = [
	{ path: '', loadComponent: () => import('./dashboard.component').then((m) => m.DashboardComponent) },
	{ path: 'users/:id', loadComponent: () => import('./user.component').then((m) => m.UserComponent) },
];
