import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_KEY!);

export async function charge(amount: number) {
	return stripe.paymentIntents.create({ amount, currency: 'eur' });
}
