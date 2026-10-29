// website/src/components/ErrorBoundaryTestButton: lib/site.ts shows the error fallback its click throws into.
export default function ErrorBoundaryTestButton({ children = 'Boom!', message = 'Boom!\nSomething bad happened, but you can try again!', cause }) {
	return (
		<button className="button button--danger" type="button" data-mm-boom={message} data-mm-boom-cause={cause}>
			{children}
		</button>
	);
}
