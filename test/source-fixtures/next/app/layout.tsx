import { Analytics } from '@vercel/analytics/react';
import { Header } from '@/components/header';

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<body>
				<Header />
				{children}
				<Analytics />
			</body>
		</html>
	);
}
