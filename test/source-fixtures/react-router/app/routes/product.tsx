import { gql } from '~/lib/storefront';

const PRODUCT = gql`
	query Product($handle: String!) {
		product(handle: $handle) {
			title
			priceRange {
				minVariantPrice {
					amount
				}
			}
		}
	}
`;

const ADD = gql`
	mutation Add($lines: [CartLineInput!]!) {
		cartCreate(input: { lines: $lines }) {
			cart {
				id
			}
		}
	}
`;

export async function loader({ params }: { params: { handle: string } }) {
	const res = await fetch('https://demo.myshopify.com/api/2025-01/graphql.json', { method: 'POST', body: JSON.stringify({ query: PRODUCT, variables: params }) });
	return res.json();
}

export default function Product() {
	return <h1>{String(ADD.length)}</h1>;
}
