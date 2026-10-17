// What each page does once the browser has it: the API calls and redraws the old Angular components made.
import {
  api,
  articlesQuery,
  currentUser,
  destroyToken,
  errorList,
  go,
  rememberUser,
  sanitize,
  type Article,
  type ArticleResponse,
  type ArticlesResponse,
  type Comment,
  type CommentResponse,
  type CommentsResponse,
  type Errors,
  type Profile,
  type ProfileResponse,
  type TagsResponse,
  type User,
  type UserResponse,
} from "./api.ts";
import { marked } from "marked";
import * as render from "./render.ts";
import { onSoftNavigation } from "./nav.ts";

type El = Element | null | undefined;

function fill(el: El, markup: string): void {
  if (el) el.innerHTML = markup;
}

function show(el: El, visible: boolean): void {
  if (el instanceof HTMLElement) el.hidden = !visible;
}

function target(event: Event, attribute: string): Element | null {
  const node = event.target;
  return node instanceof Element ? node.closest(`[${attribute}]`) : null;
}

const LIMIT = 10;

interface ListState {
  el: El;
  path: string;
  filters: Record<string, string | undefined>;
  page: number;
  followingFeed: boolean;
  syncUrl: boolean;
  view: render.ListView;
}

let list: ListState | undefined;

function drawList(): void {
  if (list) fill(list.el, render.articleList(list.view));
}

async function runQuery(): Promise<void> {
  if (!list) return;
  list.view = { ...list.view, loading: true, articles: [] };
  drawList();
  const query = articlesQuery({ ...list.filters, limit: LIMIT, offset: LIMIT * (list.page - 1) });
  const result = await api<ArticlesResponse>("GET", `${list.path}?${query}`);
  if (!result.ok) return;
  list.view = {
    ...list.view,
    loading: false,
    articles: result.data.articles,
    count: result.data.articlesCount,
    page: list.page,
  };
  drawList();
}

function startList(
  el: El,
  path: string,
  filters: Record<string, string | undefined>,
  page: number,
  followingFeed: boolean,
  syncUrl: boolean,
): Promise<void> {
  list = {
    el,
    path,
    filters,
    page,
    followingFeed,
    syncUrl,
    view: {
      loading: false,
      articles: [],
      count: 0,
      page,
      limit: LIMIT,
      followingFeed,
      submitting: new Set(),
    },
  };
  return runQuery();
}

export async function listClick(event: Event): Promise<void> {
  if (!list) return;
  const pageButton = target(event, "data-page");
  if (pageButton) {
    const page = Number(pageButton.getAttribute("data-page"));
    if (page === list.page) return;
    list.page = page;
    if (list.syncUrl) {
      const params = new URLSearchParams(window.location.search);
      const query = new URLSearchParams();
      if (params.get("feed")) query.set("feed", params.get("feed")!);
      if (page > 1) query.set("page", String(page));
      const search = query.toString();
      window.history.pushState(
        null,
        "",
        `${window.location.pathname}${search ? `?${search}` : ""}`,
      );
    }
    await runQuery();
    return;
  }
  const favorite = target(event, "data-favorite");
  if (favorite) {
    const slug = favorite.getAttribute("data-favorite") ?? "";
    const article = list.view.articles.find((item) => item.slug === slug);
    if (!article) return;
    const button = favorite;
    const changed = await toggleFavorite(article, (submitting) =>
      patchFavorite(button, article, submitting, `${article.favoritesCount} `),
    );
    if (changed) {
      list.view = {
        ...list.view,
        articles: list.view.articles.map((item) => (item.slug === slug ? changed : item)),
      };
      patchFavorite(button, changed, false, `${changed.favoritesCount} `);
    }
  }
}

// Angular updates these buttons in place, so focus stays on them.
function patchFavorite(button: Element, item: Article, submitting: boolean, label: string): void {
  button.className = [
    "btn btn-sm",
    submitting ? "disabled" : "",
    item.favorited ? "btn-primary" : "btn-outline-primary",
  ]
    .filter(Boolean)
    .join(" ");
  button.innerHTML = `<i class="ion-heart"></i> ${label}`;
}

function patchFollow(button: Element, profile: Profile, submitting: boolean): void {
  button.className = [
    "btn btn-sm action-btn",
    submitting ? "disabled" : "",
    profile.following ? "btn-secondary" : "btn-outline-secondary",
  ]
    .filter(Boolean)
    .join(" ");
  button.innerHTML = `<i class="ion-plus-round"></i> \u00a0 ${profile.following ? "Unfollow" : "Follow"} ${render.esc(profile.username)} `;
}

async function toggleFavorite(
  article: Article,
  submitting: (on: boolean) => void,
): Promise<Article | undefined> {
  submitting(true);
  const session = await currentUser();
  if (session.status !== "authenticated") {
    go("/register");
    return undefined;
  }
  const result = article.favorited
    ? await api<unknown>("DELETE", `/articles/${article.slug}/favorite`)
    : await api<ArticleResponse>("POST", `/articles/${article.slug}/favorite`, {});
  submitting(false);
  // Angular maps the POST response to data.article, so an empty body is an error there; DELETE is not mapped.
  if (!result.ok || (!article.favorited && !(result.data as ArticleResponse | undefined)?.article))
    return undefined;
  const favorited = !article.favorited;
  return {
    ...article,
    favorited,
    favoritesCount: favorited ? article.favoritesCount + 1 : article.favoritesCount - 1,
  };
}

async function toggleFollow(
  profile: Profile,
  submitting: (on: boolean) => void,
): Promise<Profile | undefined> {
  submitting(true);
  const session = await currentUser();
  if (session.status !== "authenticated") {
    go("/login");
    return undefined;
  }
  const result = profile.following
    ? await api<ProfileResponse>("DELETE", `/profiles/${profile.username}/follow`)
    : await api<ProfileResponse>("POST", `/profiles/${profile.username}/follow`, {});
  submitting(false);
  return result.ok ? result.data?.profile : undefined;
}

export interface HomeEls {
  banner: El;
  bannerText: El;
  feedToggle: El;
  list: El;
  sidebar: El;
  tags: El;
  loadingTags: El;
  noTags: El;
}

// Props captured by a handler fail at run time in 0.4.0 ("capture slot ... is a callback route"), so pages read the URL here.
export function pathParam(prefix: string): string | undefined {
  const path = window.location.pathname;
  return path.startsWith(prefix)
    ? decodeURIComponent(path.slice(prefix.length).split("/")[0] ?? "")
    : undefined;
}

export async function bootHome(els: HomeEls): Promise<void> {
  const tag = pathParam("/tag/");
  const search = window.location.search;
  const session = await currentUser();
  const signedIn = session.status === "authenticated";
  // Markless 0.4.0 writes <br> as <br></br>, which parses as two elements and shifts every handler after it.
  fill(
    els.bannerText,
    ' This is the <a href="https://github.com/realworld-apps/angular-realworld-example-app">Angular frontend</a> demo from the <a href="https://github.com/realworld-apps/realworld">Realworld</a> project.<br> This demo is connected to a demo backend that enforces session isolation. ',
  );
  if (signedIn) els.banner?.remove();
  if (signedIn) {
    const active = !tag && new URLSearchParams(search).get("feed") === "following";
    els.feedToggle?.insertAdjacentHTML(
      "afterbegin",
      `<li class="nav-item"><a class="nav-link${active ? " active" : ""}" href="/?feed=following"> Your Feed </a></li>`,
    );
  }
  const params = new URLSearchParams(search);
  const feed = params.get("feed");
  if (feed === "following" && !signedIn) {
    go("/login");
    return;
  }
  const page = params.get("page") ? Number.parseInt(params.get("page")!, 10) : 1;
  const type = tag ? "all" : feed === "following" ? "feed" : "all";
  const articles = startList(
    els.list,
    type === "feed" ? "/articles/feed" : "/articles",
    tag ? { tag } : {},
    page,
    type === "feed",
    true,
  );
  // Angular reuses HomeComponent while the route record stays the same (the feeds on /, or one tag to another).
  onSoftNavigation((url) => {
    const nextTag = url.pathname.startsWith("/tag/")
      ? decodeURIComponent(url.pathname.slice(5))
      : undefined;
    if (
      Boolean(nextTag) !== Boolean(tag) ||
      (!nextTag && url.pathname !== "/") ||
      (nextTag && nextTag.includes("/"))
    )
      return false;
    const following = !nextTag && url.searchParams.get("feed") === "following";
    if (following && !signedIn) return false;
    return () => {
      const links = els.feedToggle?.querySelectorAll("a.nav-link") ?? [];
      for (const link of links) {
        const href = link.getAttribute("href");
        if (href === "/?feed=following") link.classList.toggle("active", following);
        else if (href === "/") link.classList.toggle("active", !following && !nextTag);
        else if (nextTag) link.innerHTML = `<i class="ion-pound"></i> ${render.esc(nextTag)} `;
      }
      const nextPage = url.searchParams.get("page")
        ? Number.parseInt(url.searchParams.get("page")!, 10)
        : 1;
      void startList(
        els.list,
        following ? "/articles/feed" : "/articles",
        nextTag ? { tag: nextTag } : {},
        nextPage,
        following,
        true,
      );
    };
  });
  const tags = api<TagsResponse>("GET", "/tags").then((result) => {
    if (!result.ok) return;
    fill(els.tags, render.tagLinks(result.data.tags));
    show(els.sidebar, true);
    show(els.loadingTags, false);
    show(els.noTags, result.data.tags.length === 0);
  });
  await Promise.all([articles, tags]);
}

interface ArticlePage {
  root: Element;
  view: render.ArticleView;
  comments: Comment[];
  user: User | null;
}

let article: ArticlePage | undefined;

function drawArticle(): void {
  if (!article) return;
  const { view, root } = article;
  for (const button of root.querySelectorAll("[data-delete-article]"))
    button.classList.toggle("disabled", view.deleting);
  for (const button of root.querySelectorAll("[data-follow]"))
    patchFollow(button, view.article.author, view.following);
  const label = `${view.article.favorited ? "Unfavorite" : "Favorite"} Article <span class="counter">(${view.article.favoritesCount})</span>`;
  for (const button of root.querySelectorAll("[data-favorite]"))
    patchFavorite(button, view.article, view.favoriting, label);
}

function drawComments(): void {
  if (!article) return;
  const me = article.user?.username;
  const column = article.root.querySelector(".container.page > .row:last-child > div");
  if (!column) return;
  for (const old of [...column.querySelectorAll(":scope > app-article-comment")]) old.remove();
  column.insertAdjacentHTML(
    "beforeend",
    article.comments.map((item) => render.comment(item, item.author.username === me)).join(""),
  );
}

export async function bootArticle(root: El): Promise<void> {
  if (!root) return;
  const slug = pathParam("/article/") ?? "";
  const [loaded, comments, session] = await Promise.all([
    api<ArticleResponse>("GET", `/articles/${slug}`),
    api<CommentsResponse>("GET", `/articles/${slug}/comments`),
    currentUser(),
  ]);
  if (!loaded.ok || !comments.ok) {
    const failed = !loaded.ok ? loaded : comments;
    fill(
      root,
      `<div class="container"><div class="row"><div class="col-md-12">${render.listErrors(errorList(failed.errors ?? { error: ["Failed to load article"] }))}</div></div></div>`,
    );
    return;
  }
  const user = session.user;
  const view: render.ArticleView = {
    article: loaded.data.article,
    canModify: user?.username === loaded.data.article.author.username,
    deleting: false,
    following: false,
    favoriting: false,
  };
  article = { root, user, comments: comments.data.comments, view };
  const body = sanitize(await marked.parse(loaded.data.article.body));
  fill(root, render.articlePage(view, body, user));
  drawComments();
}

export async function articleClick(event: Event): Promise<void> {
  if (!article) return;
  const page = article;
  if (target(event, "data-delete-article")) {
    page.view = { ...page.view, deleting: true };
    drawArticle();
    const result = await api<unknown>("DELETE", `/articles/${page.view.article.slug}`);
    if (result.ok) go("/");
    return;
  }
  if (target(event, "data-follow")) {
    const next = await toggleFollow(page.view.article.author, (on) => {
      page.view = { ...page.view, following: on };
      drawArticle();
    });
    if (next) {
      page.view = {
        ...page.view,
        article: {
          ...page.view.article,
          author: { ...page.view.article.author, following: next.following },
        },
      };
      drawArticle();
    }
    return;
  }
  if (target(event, "data-favorite")) {
    const changed = await toggleFavorite(page.view.article, (on) => {
      page.view = { ...page.view, favoriting: on };
      drawArticle();
    });
    if (changed) {
      page.view = { ...page.view, article: changed };
      drawArticle();
    }
    return;
  }
  const remove = target(event, "data-delete-comment");
  if (remove) {
    const id = remove.getAttribute("data-delete-comment");
    const item = page.comments.find((entry) => String(entry.id) === id);
    if (!item) return;
    const errors = page.root.querySelectorAll("app-list-errors");
    const deleteErrors = errors[errors.length - 1];
    if (deleteErrors) deleteErrors.outerHTML = render.listErrors([]);
    const result = await api<unknown>(
      "DELETE",
      `/articles/${page.view.article.slug}/comments/${item.id}`,
    );
    if (result.ok) {
      page.comments = page.comments.filter((entry) => entry !== item);
      drawComments();
    } else {
      const current = page.root.querySelectorAll("app-list-errors");
      const last = current[current.length - 1];
      if (last) last.outerHTML = render.listErrors(errorList(result.errors));
    }
  }
}

export async function articleSubmit(event: Event): Promise<void> {
  if (!article) return;
  const page = article;
  const form = event.target instanceof Element ? event.target.closest("form.comment-form") : null;
  const textarea = form?.querySelector("textarea");
  const fieldset = form?.querySelector("fieldset");
  if (!form || !textarea || !fieldset) return;
  fieldset.disabled = true;
  const formErrors = form.parentElement?.querySelector("app-list-errors");
  if (formErrors) formErrors.outerHTML = render.listErrors([]);
  const result = await api<CommentResponse>(
    "POST",
    `/articles/${page.view.article.slug}/comments`,
    { comment: { body: textarea.value } },
  );
  fieldset.disabled = false;
  if (result.ok && result.data?.comment) {
    page.comments = [result.data.comment, ...page.comments];
    textarea.value = "";
    drawComments();
  } else if (!result.ok) {
    const current = form.parentElement?.querySelector("app-list-errors");
    if (current) current.outerHTML = render.listErrors(errorList(result.errors));
  }
}

let profile: { root: Element; profile: Profile; isUser: boolean; following: boolean } | undefined;

function drawProfile(): void {
  if (!profile) return;
  const button = profile.root.querySelector(".user-info [data-follow]");
  if (button) patchFollow(button, profile.profile, profile.following);
}

export async function bootProfile(root: El): Promise<void> {
  if (!root) return;
  const username = pathParam("/profile/") ?? "";
  const favorites = window.location.pathname.replace(/\/$/, "").endsWith("/favorites");
  const [outer, session] = await Promise.all([
    api<ProfileResponse>("GET", `/profiles/${username}`),
    currentUser(),
  ]);
  if (!outer.ok) {
    fill(
      root,
      `<div class="container"><div class="row"><div class="col-xs-12 col-md-10 offset-md-1">${render.listErrors(errorList(outer.errors ?? { error: ["Failed to load profile"] }))}</div></div></div>`,
    );
    return;
  }
  profile = {
    root,
    profile: outer.data.profile,
    isUser: outer.data.profile.username === session.user?.username,
    following: false,
  };
  fill(root, render.profilePage(outer.data.profile, profile.isUser, favorites));
  let currentFavorites = favorites;
  // Angular reuses ProfileComponent for any /profile/:username, reading the name only once, and swaps the child route.
  onSoftNavigation((url) => {
    const match = /^\/profile\/([^/]+)(\/favorites)?\/?$/.exec(url.pathname);
    if (!match || url.search) return false;
    const nextFavorites = Boolean(match[2]);
    // The same child route stays mounted, so only the address and the tabs' active state change.
    if (nextFavorites === currentFavorites) return () => markProfileTabs(root);
    currentFavorites = nextFavorites;
    return () => void showProfileTab(root, decodeURIComponent(match[1]!), nextFavorites);
  });
  await loadProfileTab(root, username, favorites);
}

// The old child component asks for the profile again and then for its articles; the list here is keyed by the
// name in the address, so both requests go out together and the page settles one round trip sooner.
async function loadProfileTab(root: Element, username: string, favorites: boolean): Promise<void> {
  const inner = api<ProfileResponse>("GET", `/profiles/${username}`);
  const list = startList(
    root.querySelector("app-article-list"),
    "/articles",
    favorites ? { favorited: username } : { author: username },
    1,
    false,
    false,
  );
  await Promise.all([inner, list]);
}

// The profile page stays; only its child route (posts or favorites) is replaced, as Angular's router-outlet did.
function markProfileTabs(root: Element): void {
  for (const link of root.querySelectorAll(".articles-toggle a.nav-link"))
    link.classList.toggle("active", link.getAttribute("href") === window.location.pathname);
}

async function showProfileTab(root: Element, username: string, favorites: boolean): Promise<void> {
  markProfileTabs(root);
  const child = root.querySelector("app-profile-articles, app-profile-favorites");
  if (child)
    child.outerHTML = `<${favorites ? "app-profile-favorites" : "app-profile-articles"}><app-article-list></app-article-list></${favorites ? "app-profile-favorites" : "app-profile-articles"}>`;
  await loadProfileTab(root, username, favorites);
}

export async function profileClick(event: Event): Promise<void> {
  if (!profile) return;
  if (!target(event, "data-follow")) {
    await listClick(event);
    return;
  }
  const page = profile;
  const next = await toggleFollow(page.profile, (on) => {
    page.following = on;
    drawProfile();
  });
  if (next) {
    page.profile = next;
    drawProfile();
  }
}

export interface AuthEls {
  page: El;
  errors: El;
  fieldset: El;
  button: El;
  username: El;
  email: El;
  password: El;
}

function value(el: El): string {
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el.value : "";
}

export async function bootGuestOnly(page: El): Promise<void> {
  const session = await currentUser();
  if (session.status === "authenticated") {
    (window as { __conduitUnmatched?: boolean }).__conduitUnmatched = true;
    window.history.replaceState(null, "", "/");
    page?.remove();
  }
}

export function authValidity(els: AuthEls, register: boolean): void {
  const valid =
    value(els.email) !== "" &&
    value(els.password) !== "" &&
    (!register || value(els.username) !== "");
  if (els.button instanceof HTMLButtonElement) els.button.disabled = !valid;
}

export async function submitAuth(els: AuthEls, register: boolean): Promise<void> {
  const fieldset = els.fieldset as HTMLFieldSetElement;
  fieldset.disabled = true;
  fill(els.errors, render.listErrors([]));
  const body = register
    ? {
        user: {
          email: value(els.email),
          password: value(els.password),
          username: value(els.username),
        },
      }
    : { user: { email: value(els.email), password: value(els.password) } };
  const result = await api<UserResponse>("POST", register ? "/users" : "/users/login", body);
  if (result.ok && result.data?.user) {
    rememberUser(result.data.user);
    go("/");
    return;
  }
  if (!result.ok) fill(els.errors, render.listErrors(errorList(result.errors)));
  fieldset.disabled = false;
}

export async function requireSignIn(): Promise<SessionUser | undefined> {
  const session = await currentUser();
  if (session.status === "authenticated" && session.user) return session.user;
  window.location.replace("/login");
  return undefined;
}

type SessionUser = User;

export interface SettingsEls {
  errors: El;
  fieldset: El;
  image: El;
  username: El;
  bio: El;
  email: El;
  password: El;
}

function setValue(el: El, text: string): void {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) el.value = text;
}

export async function bootSettings(els: SettingsEls): Promise<void> {
  const user = await requireSignIn();
  if (!user) return;
  setValue(els.image, user.image ?? "");
  setValue(els.username, user.username);
  setValue(els.bio, user.bio ?? "");
  setValue(els.email, user.email);
}

export async function submitSettings(els: SettingsEls): Promise<void> {
  const fieldset = els.fieldset as HTMLFieldSetElement;
  fieldset.disabled = true;
  const payload: Record<string, string> = {
    image: value(els.image),
    username: value(els.username),
    bio: value(els.bio),
    email: value(els.email),
    password: value(els.password),
  };
  if (!payload.password) delete payload.password;
  const result = await api<UserResponse>("PUT", "/user", { user: payload });
  if (result.ok && result.data?.user) {
    rememberUser({ ...result.data.user, token: result.data.user.token ?? "" });
    go(`/profile/${result.data.user.username}`);
    return;
  }
  if (!result.ok) fill(els.errors, render.listErrors(errorList(result.errors)));
  fieldset.disabled = false;
}

export function logout(): void {
  destroyToken();
  go("/");
}

export interface EditorEls {
  errors: El;
  fieldset: El;
  title: El;
  description: El;
  body: El;
  tagField: El;
  tags: El;
}

let editor: { els: EditorEls; tags: string[]; slug: string | undefined } | undefined;

function drawTags(): void {
  if (editor) fill(editor.els.tags, render.editorTags(editor.tags));
}

export async function bootEditor(els: EditorEls): Promise<void> {
  const slug = pathParam("/editor/") || undefined;
  editor = { els, tags: [], slug };
  const user = await requireSignIn();
  if (!user || !slug) return;
  const [loaded, me] = await Promise.all([
    api<ArticleResponse>("GET", `/articles/${slug}`),
    api<UserResponse>("GET", "/user"),
  ]);
  if (!loaded.ok || !me.ok) return;
  if (me.data.user.username !== loaded.data.article.author.username) {
    go("/");
    return;
  }
  editor.tags = [...loaded.data.article.tagList];
  setValue(els.title, loaded.data.article.title);
  setValue(els.description, loaded.data.article.description);
  setValue(els.body, loaded.data.article.body);
  drawTags();
}

export function addTag(): void {
  if (!editor) return;
  const tag = value(editor.els.tagField);
  if (tag.trim() !== "" && !editor.tags.includes(tag)) {
    editor.tags = [...editor.tags, tag];
    drawTags();
  }
  setValue(editor.els.tagField, "");
}

export function editorClick(event: Event): void {
  if (!editor) return;
  const remove = target(event, "data-remove-tag");
  if (!remove) return;
  const tag = remove.getAttribute("data-remove-tag");
  editor.tags = editor.tags.filter((item) => item !== tag);
  drawTags();
}

export async function publish(): Promise<void> {
  if (!editor) return;
  const page = editor;
  const fieldset = page.els.fieldset as HTMLFieldSetElement;
  fieldset.disabled = true;
  addTag();
  const data = {
    title: value(page.els.title),
    description: value(page.els.description),
    body: value(page.els.body),
    tagList: page.tags,
  };
  const result = page.slug
    ? await api<ArticleResponse>("PUT", `/articles/${page.slug}`, {
        article: { ...data, slug: page.slug },
      })
    : await api<ArticleResponse>("POST", "/articles", { article: data });
  if (result.ok && result.data?.article) {
    go(`/article/${result.data.article.slug}`);
    return;
  }
  if (!result.ok) fill(page.els.errors, render.listErrors(errorList(result.errors as Errors)));
  fieldset.disabled = false;
}
