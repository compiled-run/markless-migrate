interface Testimonial {
	readonly name: string;
	readonly handle: string;
	readonly avatar: string;
	readonly comment: readonly string[];
}

const testimonials: readonly Testimonial[] = [
  {
    name: 'Ryan Carniato',
    handle: '@RyanCarniato',
    avatar:
      'https://pbs.twimg.com/profile_images/1810837163447308292/8Piov0f6_400x400.jpg',
    comment: [
      `I'm loving what Vite enables. We've found building SolidStart that it is less a metaframework but a system of symbiotic Vite plugins. While built with SolidJS in mind, they should scale from our simplest template to opinionated starter. We're building an ecosystem on Vite.`,
    ],
  },
  {
    name: 'Rich Harris',
    handle: '@Rich_Harris',
    avatar:
      'https://pbs.twimg.com/profile_images/557940120184041473/bFyXy8Pu_400x400.jpeg',
    comment: [
      `Vite is basically the united nations of JavaScript at this point. I'll be there as a representative of Sveltelandia`,
    ],
  },
  {
    name: 'David East',
    handle: '@_davideast',
    avatar:
      'https://pbs.twimg.com/profile_images/1691627325794725888/voQFcYjY_400x400.jpg',
    comment: [
      'Each and every time I use Vite, I feel a true sense of pure and unbridled joy.',
    ],
  },
  {
    name: 'Mark Dalgleish',
    handle: '@markdalgleish',
    avatar:
      'https://pbs.twimg.com/profile_images/754886061872979968/BzaOWhs1_400x400.jpg',
    comment: [
      `It's also a great platform to build a framework on since it provides a pluggable dev environment.`,
      `Community is amazing too.`,
    ],
  },
  {
    name: 'Jason Miller',
    handle: '@_developit',
    avatar:
      'https://pbs.twimg.com/profile_images/1374778373239681025/Sc9ehtAr_400x400.jpg',
    comment: [
      `Every time I suspect I've hit the bounds of what Vite can do, I end up being wrong.`,
    ],
  },
  {
    name: 'David Cramer',
    handle: '@zeeg',
    avatar:
      'https://pbs.twimg.com/profile_images/1911613315765133312/HVkULegC_400x400.jpg',
    comment: ['Vite has been a game changer for the industry.'],
  },
  {
    name: 'Dion Almaer',
    handle: '@dalmaer',
    avatar:
      'https://pbs.twimg.com/profile_images/3380865881/f73b3687ff39b795db05fcaf35972270_400x400.jpeg',
    comment: [
      'I am so excited to see so many great frameworks teaming up on top of vite. So many will benefit. ❤️ to the vite team.',
    ],
  },
  {
    name: 'Christoph Nakazawa',
    handle: '@cpojer',
    avatar:
      'https://pbs.twimg.com/profile_images/1910252462126313472/gXgT-jxL_400x400.jpg',
    comment: ['Vite is gonna eat the (JavaScript) world.'],
  },
  {
    name: 'Nikolaj',
    handle: '@lopugit',
    avatar: 'https://avatars.githubusercontent.com/u/13629190?v=4',
    comment: [
      'Wow, wow, wow, wow, wow, wow, Vite is..... Vite is.... Wow 🤤🤯🙏',
    ],
  },
]

export default function Community() @{
	<div class="wrapper wrapper--ticks border-t pt-14 sm:pt-30 px-5 sm:px-10" data-v-b8c764af="">
		<div class="flex flex-col sm:flex-row justify-between items-center gap-8 sm:gap-20 text-center sm:text-left" data-v-b8c764af="">
			<div class="flex flex-col gap-3" data-v-b8c764af="">
				<h3 class="text-white max-w-xl text-balance" data-v-b8c764af="">Loved by the community</h3>
				<p class="max-w-md text-white/70 text-balance" data-v-b8c764af="">Don't take our word for it - listen to what Vite community members have to say.</p>
			</div>
			<div class="flex gap-8 sm:gap-12 items-start justify-center sm:justify-start sm:pr-20" data-v-b8c764af="">
				<div class="flex flex-col gap-3" data-v-b8c764af="">
					<h2 class="text-white" data-v-b8c764af="">80k+</h2>
					<p class="text-grey flex items-center gap-2" data-v-b8c764af="">
						<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="20px" height="20px" viewBox="0 0 24 24" data-v-b8c764af="" class="iconify iconify--simple-icons">
							<path fill="currentColor" d="M12 .297c-6.63 0-12 5.373-12 12c0 5.303 3.438 9.8 8.205 11.385c.6.113.82-.258.82-.577c0-.285-.01-1.04-.015-2.04c-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729c1.205.084 1.838 1.236 1.838 1.236c1.07 1.835 2.809 1.305 3.495.998c.108-.776.417-1.305.76-1.605c-2.665-.3-5.466-1.332-5.466-5.93c0-1.31.465-2.38 1.235-3.22c-.135-.303-.54-1.523.105-3.176c0 0 1.005-.322 3.3 1.23c.96-.267 1.98-.399 3-.405c1.02.006 2.04.138 3 .405c2.28-1.552 3.285-1.23 3.285-1.23c.645 1.653.24 2.873.12 3.176c.765.84 1.23 1.91 1.23 3.22c0 4.61-2.805 5.625-5.475 5.92c.42.36.81 1.096.81 2.22c0 1.606-.015 2.896-.015 3.286c0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"></path>
						</svg>
						{" Github Stars"}
					</p>
				</div>
				<div class="flex flex-col gap-3" data-v-b8c764af="">
					<h2 class="text-white" data-v-b8c764af="">80m+</h2>
					<p class="text-grey" data-v-b8c764af="">Weekly NPM downloads</p>
				</div>
			</div>
		</div>
		<div class="pt-14 sm:pt-30 h-[50rem] overflow-clip [mask-image:linear-gradient(to_bottom,black_70%,transparent_100%)]" data-v-b8c764af="">
			<div class="columns-1 sm:columns-2 lg:columns-3 gap-5" data-v-b8c764af="">
				@for (const testimonial of testimonials; key testimonial.handle) {
					<div class="break-inside-avoid mb-5" data-v-b8c764af="">
						<div class="testimonial-card relative overflow-clip isolate rounded-lg p-6 sm:px-8 sm:py-10 flex flex-col gap-6 before:content-[''] before:absolute before:inset-0 before:opacity-0 before:z-0 before:pointer-events-none before:transition-opacity before:duration-100 before:ease-in-out after:content-[''] after:absolute after:inset-px after:z-[1] after:rounded-lg after:bg-slate after:border after:border-nickel after:transition-[border-color,background] after:duration-100 after:ease-in-out hover:before:opacity-100 hover:after:border-transparent" data-v-b8c764af="">
							<div class="relative z-[2] flex flex-col gap-4" data-v-b8c764af="">
								@for (const paragraph of testimonial.comment; key paragraph) {
									<p class="text-white/70 leading-relaxed text-sm sm:text-base" data-v-b8c764af="">{paragraph}</p>;
								}
							</div>
							<div class="relative z-[2] flex items-center gap-5 mt-auto" data-v-b8c764af="">
								<img src={testimonial.avatar} alt={testimonial.name} class="w-12 h-12 rounded-sm object-cover flex-shrink-0" loading="lazy" data-v-b8c764af="" />
								<div class="flex flex-col" data-v-b8c764af="">
									<span class="text-grey text-sm font-mono" data-v-b8c764af="">{testimonial.name}</span>
									<span class="text-biege text-sm font-mono" data-v-b8c764af="">{testimonial.handle}</span>
								</div>
							</div>
						</div>
					</div>;
				}
			</div>
		</div>
	</div>
}
