// website/src/components/APITable: each body row gets an id (its first cell's text) to link to; lib/site.ts
// follows a click on a cell, or Enter on a row, to that anchor as the original does.
import { siteStyles } from '../theme/core.jsx';
import { isElement, toArray } from '../source/h.mjs';

function rowName(node) {
	let current = node;
	while (isElement(current)) [current] = toArray(current.props.children);
	if (typeof current !== 'string') throw new Error('Could not extract APITable row name');
	return current;
}

export default function APITable({ children, name }) {
	const styles = siteStyles('src/components/APITable/styles.module.css');
	const table = toArray(children).find((child) => isElement(child));
	const [thead, tbody] = toArray(table.props.children).filter((child) => isElement(child));
	const rows = toArray(tbody.props.children)
		.filter((row) => isElement(row))
		.map((row) => {
			const entry = rowName(row);
			const id = name ? `${name}-${entry}` : entry;
			return (
				<tr id={id} tabIndex={0}>
					{row.props.children}
				</tr>
			);
		});
	return (
		<table className={styles.apiTable}>
			{thead}
			<tbody>{rows}</tbody>
		</table>
	);
}
