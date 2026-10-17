// Markup for the parts of each page that the browser fills in after it fetches from the API. It reproduces the
// old Angular templates element for element, because Markless 0.4.0 cannot update keyed lists whose rows bind
// attributes (see examples/realworld-markless-LOG.md).
import type { Article, Comment, Profile } from './api.ts';
import { avatar, formatDate } from './api.ts';

export function esc(value: unknown): string {
	return String(value ?? '')
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}

const NBSP = ' ';

export function articleMeta(article: Article, inner: string): string {
	const user = esc(article.author.username);
	return `<app-article-meta><div class="article-meta"><a href="/profile/${user}"><img src="${esc(avatar(article.author.image))}"></a><div class="info"><a class="author" href="/profile/${user}"> ${user} </a><span class="date"> ${esc(formatDate(article.createdAt))} </span></div>${inner}</div></app-article-meta>`;
}

export function favoriteButton(article: Article, label: string, submitting: boolean, extraClass = ''): string {
	const state = article.favorited ? 'btn-primary' : 'btn-outline-primary';
	const classes = ['btn btn-sm', submitting ? 'disabled' : '', state].filter(Boolean).join(' ');
	return `<app-favorite-button${extraClass ? ` class="${extraClass}"` : ''}><button class="${classes}" data-favorite="${esc(article.slug)}"><i class="ion-heart"></i> ${label}</button></app-favorite-button>`;
}

export function preview(article: Article, submitting: boolean): string {
	const fav = favoriteButton(article, `${article.favoritesCount} `, submitting, 'pull-xs-right');
	const tags = article.tagList.map((tag) => `<li class="tag-default tag-pill tag-outline"> ${esc(tag)} </li>`).join('');
	return `<app-article-preview><div class="article-preview">${articleMeta(article, fav)}<a class="preview-link" href="/article/${esc(article.slug)}"><h1>${esc(article.title)}</h1><p>${esc(article.description)}</p><span>Read more...</span><ul class="tag-list">${tags}</ul></a></div></app-article-preview>`;
}

export interface ListView {
	loading: boolean;
	articles: Article[];
	count: number;
	page: number;
	limit: number;
	followingFeed: boolean;
	submitting: ReadonlySet<string>;
}

export function articleList(view: ListView): string {
	if (view.loading) return '<div class="article-preview">Loading articles...</div>';
	const items = view.articles.length
		? view.articles.map((article) => preview(article, view.submitting.has(article.slug))).join('')
		: `<div class="article-preview empty-feed-message">${view.followingFeed ? ' Your feed is empty. Follow some users to see their articles here, or check out the <a href="/">Global Feed</a>! ' : ' No articles are here... yet. '}</div>`;
	const pages = Array.from({ length: Math.ceil(view.count / view.limit) }, (_, index) => index + 1);
	const pagination = pages.map((n) => `<li class="page-item${n === view.page ? ' active' : ''}"><button class="page-link" data-page="${n}"> ${n} </button></li>`).join('');
	return `${items}<nav><ul class="pagination">${pagination}</ul></nav>`;
}

export function tagLinks(tags: string[]): string {
	return tags.map((tag) => `<a class="tag-default tag-pill" href="/tag/${esc(encodeURIComponent(tag))}"> ${esc(tag)} </a>`).join('');
}

export function listErrors(errors: string[]): string {
	return `<app-list-errors><ul class="error-messages">${errors.map((error) => `<li>${esc(error)}</li>`).join('')}</ul></app-list-errors>`;
}

export function followButton(profile: Profile, submitting: boolean): string {
	const state = profile.following ? 'btn-secondary' : 'btn-outline-secondary';
	const classes = ['btn btn-sm action-btn', submitting ? 'disabled' : '', state].filter(Boolean).join(' ');
	return `<app-follow-button><button class="${classes}" data-follow="${esc(profile.username)}"><i class="ion-plus-round"></i> ${NBSP} ${profile.following ? 'Unfollow' : 'Follow'} ${esc(profile.username)} </button></app-follow-button>`;
}

export interface ArticleView {
	article: Article;
	canModify: boolean;
	deleting: boolean;
	following: boolean;
	favoriting: boolean;
}

function articleActions(view: ArticleView): string {
	const { article } = view;
	if (view.canModify) {
		return `<span><a class="btn btn-sm btn-outline-secondary" href="/editor/${esc(article.slug)}"><i class="ion-edit"></i> Edit Article </a><button class="btn btn-sm btn-outline-danger${view.deleting ? ' disabled' : ''}" data-delete-article=""><i class="ion-trash-a"></i> Delete Article </button></span>`;
	}
	const label = `${article.favorited ? 'Unfavorite' : 'Favorite'} Article <span class="counter">(${article.favoritesCount})</span>`;
	return `<span>${followButton(article.author, view.following)}${favoriteButton(article, label, view.favoriting)}</span>`;
}

export function articleBanner(view: ArticleView): string {
	return `<div class="banner"><div class="container"><h1>${esc(view.article.title)}</h1>${articleMeta(view.article, articleActions(view))}</div></div>`;
}

export function articleTags(article: Article): string {
	return `<ul class="tag-list">${article.tagList.map((tag) => `<li class="tag-default tag-pill tag-outline"> ${esc(tag)} </li>`).join('')}</ul>`;
}

export function articleFooterMeta(view: ArticleView): string {
	return articleMeta(view.article, articleActions(view));
}

export function comment(item: Comment, canModify: boolean): string {
	const user = esc(item.author.username);
	const mod = canModify ? `<span class="mod-options"><i class="ion-trash-a" data-delete-comment="${esc(item.id)}"></i></span>` : '';
	return `<app-article-comment><div class="card"><div class="card-block"><p class="card-text"> ${esc(item.body)} </p></div><div class="card-footer"><a class="comment-author" href="/profile/${user}"><img src="${esc(avatar(item.author.image))}" class="comment-author-img"></a> ${NBSP} <a class="comment-author" href="/profile/${user}"> ${user} </a><span class="date-posted"> ${esc(formatDate(item.createdAt))} </span>${mod}</div></div></app-article-comment>`;
}

export function userInfo(profile: Profile, isUser: boolean, following: boolean): string {
	const action = isUser
		? `<a class="btn btn-sm btn-outline-secondary action-btn" href="/settings"><i class="ion-gear-a"></i> Edit Profile Settings </a>`
		: followButton(profile, following);
	return `<div class="user-info"><div class="container"><div class="row"><div class="col-xs-12 col-md-10 offset-md-1"><img src="${esc(avatar(profile.image))}" class="user-img"><h4>${esc(profile.username)}</h4><p>${esc(profile.bio ?? '')}</p>${action}</div></div></div></div>`;
}

export function editorTags(tags: string[]): string {
	return tags.map((tag) => `<span class="tag-default tag-pill"><i class="ion-close-round" data-remove-tag="${esc(tag)}"></i> ${esc(tag)} </span>`).join('');
}

export function articlePage(view: ArticleView, body: string, user: { image: string | null } | null): string {
	const form = user
		? `<div>${listErrors([])}<form class="card comment-form" novalidate=""><fieldset><div class="card-block"><textarea class="form-control" placeholder="Write a comment..." rows="3"></textarea></div><div class="card-footer"><img src="${esc(avatar(user.image))}" class="comment-author-img"><button class="btn btn-sm btn-primary" type="submit">Post Comment</button></div></fieldset></form></div>`
		: `<div><a href="/login">Sign in</a> or <a href="/register">sign up</a> to add comments on this article. </div>`;
	return `${articleBanner(view)}<div class="container page"><div class="row article-content"><div class="col-md-12"><div>${body}</div>${articleTags(view.article)}</div></div><hr><div class="article-actions">${articleFooterMeta(view)}</div><div class="row"><div class="col-xs-12 col-md-8 offset-md-2">${form}${listErrors([])}</div></div></div>`;
}

export function profilePage(profile: Profile, isUser: boolean, favorites: boolean): string {
	const user = esc(profile.username);
	const child = favorites ? 'app-profile-favorites' : 'app-profile-articles';
	return `${userInfo(profile, isUser, false)}<div class="container"><div class="row"><div class="col-xs-12 col-md-10 offset-md-1"><div class="articles-toggle"><ul class="nav nav-pills outline-active"><li class="nav-item"><a class="nav-link${favorites ? '' : ' active'}" href="/profile/${user}"> My Posts </a></li><li class="nav-item"><a class="nav-link${favorites ? ' active' : ''}" href="/profile/${user}/favorites"> Favorited Posts </a></li></ul></div><router-outlet></router-outlet><${child}><app-article-list></app-article-list></${child}></div></div></div>`;
}
