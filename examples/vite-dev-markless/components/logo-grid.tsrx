import { state } from '@markless/core';

export default function LogoGrid() @{
	// LogoGrid.vue measures at mount whether the logos fit; islands/logo-grid.ts measures and reports it here.
	let scrolling = state(false);

	<section class="wrapper wrapper--ticks border-t" data-v-8a57af01="">
		<div class="overflow-hidden py-6" onLogoFit={(event: CustomEvent<boolean>) => (scrolling = event.detail)} data-v-8a57af01="" style="--c06da744:80;--v6e59392c:120;--v685e36c4:6;" data-v-0fe532eb="">
			@if (scrolling) {
				<div data-v-0fe532eb="" class="scroll-container">
					<div data-v-0fe532eb="" class="scroll-content" style="gap: 80px; animation-duration: 18s;">
						<div data-v-0fe532eb="" class="flex items-center" style="gap: 80px;">
							<div data-v-0fe532eb="" class="logo-container flex-shrink-0 relative flex items-center justify-center has-divider" style="width: 120px; height: 25px;">
								<img data-v-0fe532eb="" loading="lazy" src="/trusted-by/openai.svg" alt="openai" class="max-w-full max-h-full object-contain grayscale" />
							</div>
							<div data-v-0fe532eb="" class="logo-container flex-shrink-0 relative flex items-center justify-center has-divider" style="width: 120px; height: 25px;">
								<img data-v-0fe532eb="" loading="lazy" src="/trusted-by/shopify.svg" alt="shopify" class="max-w-full max-h-full object-contain grayscale" />
							</div>
							<div data-v-0fe532eb="" class="logo-container flex-shrink-0 relative flex items-center justify-center has-divider" style="width: 120px; height: 25px;">
								<img data-v-0fe532eb="" loading="lazy" src="/trusted-by/stripe.svg" alt="stripe" class="max-w-full max-h-full object-contain grayscale" />
							</div>
							<div data-v-0fe532eb="" class="logo-container flex-shrink-0 relative flex items-center justify-center has-divider" style="width: 120px; height: 25px;">
								<img data-v-0fe532eb="" loading="lazy" src="/trusted-by/linear.svg" alt="linear" class="max-w-full max-h-full object-contain grayscale" />
							</div>
							<div data-v-0fe532eb="" class="logo-container flex-shrink-0 relative flex items-center justify-center has-divider" style="width: 120px; height: 25px;">
								<img data-v-0fe532eb="" loading="lazy" src="/trusted-by/clickup.svg" alt="clickup" class="max-w-full max-h-full object-contain grayscale" />
							</div>
							<div data-v-0fe532eb="" class="logo-container flex-shrink-0 relative flex items-center justify-center has-divider" style="width: 120px; height: 25px;">
								<img data-v-0fe532eb="" loading="lazy" src="/trusted-by/wiz.svg" alt="wiz" class="max-w-full max-h-full object-contain grayscale" />
							</div>
						</div>
						<div data-v-0fe532eb="" class="flex items-center" style="gap: 80px;">
							<div data-v-0fe532eb="" class="logo-container flex-shrink-0 relative flex items-center justify-center has-divider" style="width: 120px; height: 25px;">
								<img data-v-0fe532eb="" loading="lazy" src="/trusted-by/openai.svg" alt="openai" class="max-w-full max-h-full object-contain grayscale" />
							</div>
							<div data-v-0fe532eb="" class="logo-container flex-shrink-0 relative flex items-center justify-center has-divider" style="width: 120px; height: 25px;">
								<img data-v-0fe532eb="" loading="lazy" src="/trusted-by/shopify.svg" alt="shopify" class="max-w-full max-h-full object-contain grayscale" />
							</div>
							<div data-v-0fe532eb="" class="logo-container flex-shrink-0 relative flex items-center justify-center has-divider" style="width: 120px; height: 25px;">
								<img data-v-0fe532eb="" loading="lazy" src="/trusted-by/stripe.svg" alt="stripe" class="max-w-full max-h-full object-contain grayscale" />
							</div>
							<div data-v-0fe532eb="" class="logo-container flex-shrink-0 relative flex items-center justify-center has-divider" style="width: 120px; height: 25px;">
								<img data-v-0fe532eb="" loading="lazy" src="/trusted-by/linear.svg" alt="linear" class="max-w-full max-h-full object-contain grayscale" />
							</div>
							<div data-v-0fe532eb="" class="logo-container flex-shrink-0 relative flex items-center justify-center has-divider" style="width: 120px; height: 25px;">
								<img data-v-0fe532eb="" loading="lazy" src="/trusted-by/clickup.svg" alt="clickup" class="max-w-full max-h-full object-contain grayscale" />
							</div>
							<div data-v-0fe532eb="" class="logo-container flex-shrink-0 relative flex items-center justify-center has-divider" style="width: 120px; height: 25px;">
								<img data-v-0fe532eb="" loading="lazy" src="/trusted-by/wiz.svg" alt="wiz" class="max-w-full max-h-full object-contain grayscale" />
							</div>
						</div>
					</div>
				</div>;
			} @else {
				<div class="flex items-center justify-evenly" data-v-0fe532eb="">
					<div class="logo-container-static flex items-center justify-center" style="width:120px;height:25px;" data-v-0fe532eb="">
						<img loading="lazy" src="/trusted-by/openai.svg" alt="openai" class="max-w-full max-h-full object-contain grayscale" data-v-0fe532eb="" />
					</div>
					<div class="divider" data-v-0fe532eb=""></div>
					<div class="logo-container-static flex items-center justify-center" style="width:120px;height:25px;" data-v-0fe532eb="">
						<img loading="lazy" src="/trusted-by/shopify.svg" alt="shopify" class="max-w-full max-h-full object-contain grayscale" data-v-0fe532eb="" />
					</div>
					<div class="divider" data-v-0fe532eb=""></div>
					<div class="logo-container-static flex items-center justify-center" style="width:120px;height:25px;" data-v-0fe532eb="">
						<img loading="lazy" src="/trusted-by/stripe.svg" alt="stripe" class="max-w-full max-h-full object-contain grayscale" data-v-0fe532eb="" />
					</div>
					<div class="divider" data-v-0fe532eb=""></div>
					<div class="logo-container-static flex items-center justify-center" style="width:120px;height:25px;" data-v-0fe532eb="">
						<img loading="lazy" src="/trusted-by/linear.svg" alt="linear" class="max-w-full max-h-full object-contain grayscale" data-v-0fe532eb="" />
					</div>
					<div class="divider" data-v-0fe532eb=""></div>
					<div class="logo-container-static flex items-center justify-center" style="width:120px;height:25px;" data-v-0fe532eb="">
						<img loading="lazy" src="/trusted-by/clickup.svg" alt="clickup" class="max-w-full max-h-full object-contain grayscale" data-v-0fe532eb="" />
					</div>
					<div class="divider" data-v-0fe532eb=""></div>
					<div class="logo-container-static flex items-center justify-center" style="width:120px;height:25px;" data-v-0fe532eb="">
						<img loading="lazy" src="/trusted-by/wiz.svg" alt="wiz" class="max-w-full max-h-full object-contain grayscale" data-v-0fe532eb="" />
					</div>
				</div>;
			}
		</div>
	</section>
}
