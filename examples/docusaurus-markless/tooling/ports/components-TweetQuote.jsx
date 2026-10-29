// website/src/components/TweetQuote.
import { clsx, Link, siteStyles } from '../theme/core.jsx';

export default function TweetQuote({ url, handle, name, job, children }) {
	const styles = siteStyles('src/components/TweetQuote/styles.module.css');
	return (
		<figure className={styles.tweetQuote}>
			<blockquote>
				<Link to={url}>{children}</Link>
			</blockquote>
			<figcaption>
				<Link to={`https://x.com/${handle}`} rel="nofollow">
					<div className="avatar">
						<img alt={name} className={clsx('avatar__photo', styles.avatarImg)} src={`https://unavatar.io/x/${handle}`} />
						<div className={clsx('avatar__intro')}>
							<strong className="avatar__name">
								<cite>{name}</cite>
							</strong>
							<small className="avatar__subtitle" itemProp="description">
								{job}
							</small>
						</div>
					</div>
				</Link>
			</figcaption>
		</figure>
	);
}
