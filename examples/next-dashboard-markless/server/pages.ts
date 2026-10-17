import snapshot from './overview.snapshot.json' with { type: 'json' };
import { fetchCardData, fetchCustomers, fetchFilteredCustomers, fetchFilteredInvoices, fetchInvoiceById, fetchInvoicesPages, fetchLatestInvoices, fetchRevenue } from './data.ts';
import { formatCurrency, formatDateToLocal, generateYAxis } from '../lib/utils.ts';
import { variant } from '../lib/image.ts';
import { useRequest } from 'nitro/context';
import { recall } from './prefetch.ts';

const avatar = (src: string, width: number) => ({ src: variant(src, width * 2), srcset: `${variant(src, width)} 1x, ${variant(src, width * 2)} 2x` });

// Next prerenders /dashboard at build time and never revalidates it, so the overview is read once, at build (scripts/snapshot.ts).
export const overview = async () => snapshot as Awaited<ReturnType<typeof overviewLive>>;

export async function overviewLive() {
	const [cards, revenue, latest] = await Promise.all([fetchCardData(), fetchRevenue(), fetchLatestInvoices()]);
	const chartHeight = 350;
	const { yAxisLabels, topLabel } = generateYAxis(revenue);
	return {
		cards: { ...cards, numberOfInvoices: String(cards.numberOfInvoices), numberOfCustomers: String(cards.numberOfCustomers) },
		yAxisLabels,
		months: revenue.map((month) => ({ month: month.month, height: `${(chartHeight / topLabel) * month.revenue}px` })),
		latest: latest.map((invoice, i) => ({ id: invoice.id, name: invoice.name, email: invoice.email, amount: invoice.amount, image: avatar(invoice.image_url, 32), rowClass: i !== 0 ? 'flex flex-row items-center justify-between py-4 border-t' : 'flex flex-row items-center justify-between py-4' })),
	};
}

export async function invoicesPage(query: string, currentPage: number) {
	const [totalPages, invoices] = await Promise.all([fetchInvoicesPages(query), fetchFilteredInvoices(query, currentPage)]);
	return {
		totalPages,
		invoices: invoices.map((invoice) => ({ id: invoice.id, name: invoice.name, email: invoice.email, status: invoice.status, amount: formatCurrency(invoice.amount), date: formatDateToLocal(invoice.date), image: avatar(invoice.image_url, 28) })),
	};
}

export async function customersPage(query: string) {
	return (await fetchFilteredCustomers(query)).map((customer) => ({ ...customer, total_invoices: String(customer.total_invoices), image: avatar(customer.image_url, 28) }));
}

export const createPage = () => fetchCustomers();

export async function editPage(id: string) {
	const [invoice, customers] = await Promise.all([fetchInvoiceById(id), fetchCustomers()]);
	return invoice ? { invoice, customers } : null;
}

// The middleware has usually read these already (server/prefetch.ts).
export const invoicesPageFor = (query: string, currentPage: number) => recall<ReturnType<typeof invoicesPage>>(useRequest(), `invoices:${query}:${currentPage}`) ?? invoicesPage(query, currentPage);
export const customersPageFor = (query: string) => recall<ReturnType<typeof customersPage>>(useRequest(), `customers:${query}`) ?? customersPage(query);
export const createPageFor = () => recall<ReturnType<typeof createPage>>(useRequest(), 'create') ?? createPage();
export const editPageFor = (id: string) => recall<ReturnType<typeof editPage>>(useRequest(), `edit:${id}`) ?? editPage(id);
