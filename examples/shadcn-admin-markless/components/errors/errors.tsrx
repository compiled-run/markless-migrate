// The old app's error pages (features/errors): the same markup, Go Back steps back in history and Back to Home navigates to /.
import { buttonVariants } from '../ui/variants.ts';
import { navigate } from '../../lib/navigate.ts';

const OUTLINE = buttonVariants({ variant: 'outline' });
const PRIMARY = buttonVariants();

export function UnauthorisedError() @{
	<div class="h-svh">
		<div class="m-auto flex h-full w-full flex-col items-center justify-center gap-2">
			<h1 class="text-[7rem] leading-tight font-bold">401</h1>
			<span class="font-medium">Unauthorized Access</span>
			<p class="text-center text-muted-foreground">Please log in with the appropriate credentials <br /> to access this resource.</p>
			<div class="mt-6 flex gap-4">
				<button data-slot="button" class={OUTLINE} onClick={() => history.go(-1)}>Go Back</button>
				<button data-slot="button" class={PRIMARY} onClick={() => navigate('/')}>Back to Home</button>
			</div>
		</div>
	</div>
}

export function ForbiddenError() @{
	<div class="h-svh">
		<div class="m-auto flex h-full w-full flex-col items-center justify-center gap-2">
			<h1 class="text-[7rem] leading-tight font-bold">403</h1>
			<span class="font-medium">Access Forbidden</span>
			<p class="text-center text-muted-foreground">You don't have necessary permission <br />to view this resource.</p>
			<div class="mt-6 flex gap-4">
				<button data-slot="button" class={OUTLINE} onClick={() => history.go(-1)}>Go Back</button>
				<button data-slot="button" class={PRIMARY} onClick={() => navigate('/')}>Back to Home</button>
			</div>
		</div>
	</div>
}

export function NotFoundError() @{
	<div class="h-svh">
		<div class="m-auto flex h-full w-full flex-col items-center justify-center gap-2">
			<h1 class="text-[7rem] leading-tight font-bold">404</h1>
			<span class="font-medium">Oops! Page Not Found!</span>
			<p class="text-center text-muted-foreground">It seems like the page you're looking for <br />does not exist or might have been removed.</p>
			<div class="mt-6 flex gap-4">
				<button data-slot="button" class={OUTLINE} onClick={() => history.go(-1)}>Go Back</button>
				<button data-slot="button" class={PRIMARY} onClick={() => navigate('/')}>Back to Home</button>
			</div>
		</div>
	</div>
}

export function GeneralError() @{
	<div class="h-svh w-full">
		<div class="m-auto flex h-full w-full flex-col items-center justify-center gap-2">
			<h1 class="text-[7rem] leading-tight font-bold">500</h1>
			<span class="font-medium">Oops! Something went wrong {":')"}</span>
			<p class="text-center text-muted-foreground">We apologize for the inconvenience. <br /> Please try again later.</p>
			<div class="mt-6 flex gap-4">
				<button data-slot="button" class={OUTLINE} onClick={() => history.go(-1)}>Go Back</button>
				<button data-slot="button" class={PRIMARY} onClick={() => navigate('/')}>Back to Home</button>
			</div>
		</div>
	</div>
}

export function MaintenanceError() @{
	<div class="h-svh">
		<div class="m-auto flex h-full w-full flex-col items-center justify-center gap-2">
			<h1 class="text-[7rem] leading-tight font-bold">503</h1>
			<span class="font-medium">Website is under maintenance!</span>
			<p class="text-center text-muted-foreground">The site is not available at the moment. <br />We'll be back online shortly.</p>
			<div class="mt-6 flex gap-4">
				<button data-slot="button" class={OUTLINE}>Learn more</button>
			</div>
		</div>
	</div>
}

export function ComingSoon() @{
	<div class="h-svh">
		<div class="m-auto flex h-full w-full flex-col items-center justify-center gap-2">
			<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-telescope" aria-hidden="true"><path d="m10.065 12.493-6.18 1.318a.934.934 0 0 1-1.108-.702l-.537-2.15a1.07 1.07 0 0 1 .691-1.265l13.504-4.44" /><path d="m13.56 11.747 4.332-.924" /><path d="m16 21-3.105-6.21" /><path d="M16.485 5.94a2 2 0 0 1 1.455-2.425l1.09-.272a1 1 0 0 1 1.212.727l1.515 6.06a1 1 0 0 1-.727 1.213l-1.09.272a2 2 0 0 1-2.425-1.455z" /><path d="m6.158 8.633 1.114 4.456" /><path d="m8 21 3.105-6.21" /><circle cx="12" cy="13" r="2" /></svg>
			<h1 class="text-4xl leading-tight font-bold">Coming Soon!</h1>
			<p class="text-center text-muted-foreground">This page has not been created yet. <br />Stay tuned though!</p>
		</div>
	</div>
}
