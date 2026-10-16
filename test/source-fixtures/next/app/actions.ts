'use server';
import { charge } from '@/lib/payments';

export async function checkout(amount: number) {
	return charge(amount);
}
