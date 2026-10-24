// website/src/components/BrowserWindow.
import { clsx, siteStyles } from '../theme/core.jsx';

export default function BrowserWindow({ children, minHeight, url = 'http://localhost:3000', style, bodyStyle }) {
	const styles = siteStyles('src/components/BrowserWindow/styles.module.css');
	return (
		<div className={styles.browserWindow} style={{ ...style, minHeight }}>
			<div className={styles.browserWindowHeader}>
				<div className={styles.buttons}>
					<span className={styles.dot} style={{ background: '#f25f58' }} />
					<span className={styles.dot} style={{ background: '#fbbe3c' }} />
					<span className={styles.dot} style={{ background: '#58cb42' }} />
				</div>
				<div className={clsx(styles.browserWindowAddressBar, 'text--truncate')}>{url}</div>
				<div className={styles.browserWindowMenuIcon}>
					<div>
						<span className={styles.bar} />
						<span className={styles.bar} />
						<span className={styles.bar} />
					</div>
				</div>
			</div>
			<div className={styles.browserWindowBody} style={bodyStyle}>
				{children}
			</div>
		</div>
	);
}
