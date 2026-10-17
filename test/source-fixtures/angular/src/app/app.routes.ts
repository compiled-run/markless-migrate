import { Routes } from '@angular/router';
import { authGuard } from './auth.guard';
import { HomeComponent } from './home.component';

export const routes: Routes = [
	{ path: '', component: HomeComponent },
	{ path: 'products/:id', loadComponent: () => import('./product.component').then((m) => m.ProductComponent) },
	{ path: 'admin', canActivate: [authGuard], data: { roles: ['admin'] }, loadChildren: () => import('./admin/admin.routes').then((m) => m.ADMIN_ROUTES) },
	{ path: 'login', canActivate: [() => inject(UserService).isAuthenticated.pipe(map((isAuth) => !isAuth))], component: HomeComponent },
	{ path: 'register', canActivate: [guestGuard], component: HomeComponent },
	{ path: '**', redirectTo: '' },
];
