export const locales = ['en', 'fr'] as const;
export type Locale = (typeof locales)[number];

export function isLocale(value: string): value is Locale {
	return (locales as readonly string[]).includes(value);
}

export const dictionaries = {
	en: {
		siteName: 'Harbour Coffee',
		nav: { home: 'Home', about: 'About', contact: 'Contact' },
		home: {
			title: 'Harbour Coffee: small-batch roasts',
			description: 'Small-batch coffee roasted by the harbour every Tuesday.',
			heading: 'Fresh coffee, roasted by the harbour',
			lede: 'We roast in small batches every Tuesday and ship the same afternoon.',
			heroAlt: 'Sacks of green coffee beans stacked by the roaster',
			counter: 'Cups poured today',
			pour: 'Pour a cup',
		},
		about: {
			title: 'About us | Harbour Coffee',
			description: 'Who roasts your coffee and how.',
			heading: 'About us',
			body: 'Three friends started roasting in a shipping container in 2019.',
		},
		contact: {
			title: 'Contact | Harbour Coffee',
			description: 'Order wholesale or ask a question.',
			heading: 'Get in touch',
			name: 'Your name',
			message: 'Message',
			send: 'Send message',
			sent: 'Thanks, we will reply within a day.',
		},
		rendered: 'Page rendered at',
	},
	fr: {
		siteName: 'Café du Port',
		nav: { home: 'Accueil', about: 'À propos', contact: 'Contact' },
		home: {
			title: 'Café du Port : torréfaction artisanale',
			description: 'Du café torréfié au port chaque mardi, en petites quantités.',
			heading: 'Du café frais, torréfié au port',
			lede: 'Nous torréfions chaque mardi et expédions le jour même.',
			heroAlt: 'Sacs de grains de café vert empilés près du torréfacteur',
			counter: 'Tasses servies aujourd’hui',
			pour: 'Servir une tasse',
		},
		about: {
			title: 'À propos | Café du Port',
			description: 'Qui torréfie votre café, et comment.',
			heading: 'À propos',
			body: 'Trois amis ont commencé à torréfier dans un conteneur en 2019.',
		},
		contact: {
			title: 'Contact | Café du Port',
			description: 'Commandes en gros ou questions.',
			heading: 'Nous écrire',
			name: 'Votre nom',
			message: 'Message',
			send: 'Envoyer',
			sent: 'Merci, nous répondons sous un jour.',
		},
		rendered: 'Page générée à',
	},
} as const;
