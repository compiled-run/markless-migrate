import { generatePagination } from './utils.ts';
import { pageUrl } from './search.ts';

export type PageItem = { readonly key: string; readonly label: string; readonly href: string | undefined; readonly className: string };

export function pageItems(pathname: string, search: string, currentPage: number, totalPages: number): PageItem[] {
	const allPages = generatePagination(currentPage, totalPages);
	return allPages.map((page, index) => {
		let position: 'first' | 'last' | 'single' | 'middle' | undefined;
		if (index === 0) position = 'first';
		if (index === allPages.length - 1) position = 'last';
		if (allPages.length === 1) position = 'single';
		if (page === '...') position = 'middle';
		const isActive = currentPage === page;
		const className = ['flex h-10 w-10 items-center justify-center text-sm border', position === 'first' || position === 'single' ? 'rounded-l-md' : '', position === 'last' || position === 'single' ? 'rounded-r-md' : '', isActive ? 'z-10 bg-blue-600 border-blue-600 text-white' : '', !isActive && position !== 'middle' ? 'hover:bg-gray-100' : '', position === 'middle' ? 'text-gray-300' : ''].filter(Boolean).join(' ');
		return { key: `${page}-${index}`, label: String(page), href: isActive || position === 'middle' ? undefined : pageUrl(pathname, search, page), className };
	});
}

export function arrow(pathname: string, search: string, direction: 'left' | 'right', currentPage: number, totalPages: number) {
	const isDisabled = direction === 'left' ? currentPage <= 1 : currentPage >= totalPages;
	const className = ['flex h-10 w-10 items-center justify-center rounded-md border', isDisabled ? 'pointer-events-none text-gray-300' : '', !isDisabled ? 'hover:bg-gray-100' : '', direction === 'left' ? 'mr-2 md:mr-4' : '', direction === 'right' ? 'ml-2 md:ml-4' : ''].filter(Boolean).join(' ');
	return { className, href: isDisabled ? undefined : pageUrl(pathname, search, direction === 'left' ? currentPage - 1 : currentPage + 1) };
}
