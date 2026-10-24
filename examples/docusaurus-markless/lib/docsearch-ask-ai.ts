// DocSearch 4.7's Ask AI: the chat with Algolia's assistant (the AI SDK's framework-free chat over its default HTTP
// transport, as DocSearch's useChat runs it) and the answers screen, written against the DOM.
import { AbstractChat, DefaultChatTransport, generateId, lastAssistantMessageIsCompleteWithToolCalls } from 'ai';
import type { ChatState, ChatStatus, UIMessage } from 'ai';
import { marked, type Tokens } from 'marked';
import { escapeHtml, icons, sanitizeUserInput } from './docsearch.ts';
import type { Hit, Stored } from './docsearch.ts';

const ASK_AI_API_URL = 'https://askai.algolia.com/chat';
const TOKEN_KEY = 'askai_token';

type Part = { type: string; text?: string; state?: string; input?: { query?: string }; output?: { query?: string; hits?: unknown[] } };
type Message = UIMessage<{ stopped?: boolean }> & { parts: Part[] };
export type PendingAfterReset = { kind: 'setMessages'; messages: unknown[] } | { kind: 'sendUserMessage'; text: string; body?: object };
type Translations = Record<string, string>;

const text = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const attr = (value: string): string => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

// The /token call, made once and kept in sessionStorage until 30 s before it expires.
let inflight: Promise<string> | null = null;
function isExpired(token: string | null): boolean {
	if (!token) return true;
	try {
		const { exp } = JSON.parse(atob(token.split('.')[0]!)) as { exp: number };
		return Date.now() / 1000 > exp - 30;
	} catch {
		return true;
	}
}
async function getValidToken(assistantId: string, signal: AbortSignal): Promise<string | null> {
	const cached = sessionStorage.getItem(TOKEN_KEY);
	if (!isExpired(cached)) return cached;
	inflight ??= fetch(`${ASK_AI_API_URL}/token`, { method: 'POST', headers: { 'x-algolia-assistant-id': assistantId, 'content-type': 'application/json' }, signal })
		.then((r) => r.json())
		.then(({ token, success, message }: { token: string; success: boolean; message?: string }) => {
			if (!success && message) throw new Error(message);
			sessionStorage.setItem(TOKEN_KEY, token);
			return token;
		})
		.finally(() => (inflight = null));
	return inflight;
}

// Error messages, as DocSearch tells a blocked conversation from a failed answer.
const threadDepth = (message: string) => message.toLowerCase().includes('ai-217') || /conversation\s+depth/i.test(message.toLowerCase());
function isThreadDepthError(error?: Error): boolean {
	if (!error) return false;
	const message = error.message ?? '';
	if (threadDepth(message)) return true;
	try {
		const parsed = JSON.parse(message) as { code?: string; errorCode?: string; message?: string };
		const code = parsed.code ?? parsed.errorCode;
		if (typeof code === 'string' && code.toUpperCase() === 'AI-217') return true;
		return threadDepth(typeof parsed.message === 'string' ? parsed.message : '');
	} catch {
		return false;
	}
}
function isTokenOutputLimitError(error?: Error): boolean {
	if (!error) return false;
	const message = error.message ?? '';
	if (/TokenOutputLimitError/i.test(message) || /could not complete response due to token output limits/i.test(message)) return true;
	try {
		const parsed = JSON.parse(message) as { type?: string; error?: string };
		return (typeof parsed.type === 'string' && /^TokenOutputLimitError$/i.test(parsed.type.trim())) || (typeof parsed.error === 'string' && /token output limits/i.test(parsed.error));
	} catch {
		return false;
	}
}
function readField(o: Record<string, unknown>, key: string): string | undefined {
	for (const [k, v] of Object.entries(o)) if (k.toLowerCase() === key.toLowerCase() && typeof v === 'string' && v.trim() !== '') return v.trim();
	return undefined;
}
function extractErrorField(raw: string): string | undefined {
	let s = raw.trim();
	if (!s) return undefined;
	for (let i = 0; i < 10; i++) {
		try {
			const v: unknown = JSON.parse(s);
			if (typeof v === 'string') {
				if (!v.trim()) return undefined;
				s = v.trim();
			} else if (v && typeof v === 'object' && !Array.isArray(v)) return readField(v as Record<string, unknown>, 'message') ?? readField(v as Record<string, unknown>, 'error');
			else return undefined;
		} catch {
			if (/\\"/.test(s)) s = s.replace(/\\"/g, '"').replace(/\\\\/g, '\\').trim();
			else {
				const m = /"message"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(s) ?? /"error"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(s);
				return m?.[1] ? m[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\').trim() : undefined;
			}
		}
	}
	return undefined;
}
function bannerMessage(error?: Error): string | undefined {
	if (!error) return undefined;
	const raw = error.message ?? '';
	const message = extractErrorField(raw) ?? (raw.trim().replace(/\s*\(AI-\d{3}\)\s*$/i, '').trim() || undefined);
	if (isTokenOutputLimitError(error)) {
		const t = message?.trim() ?? '';
		return message && !(t.startsWith('{') && t.endsWith('}')) ? message : 'Could not complete response due to token output limits';
	}
	return message;
}

// Markdown, rendered as DocSearch renders answers: links open in a new tab, raw HTML is shown as text.
function sanitizeUrl(url: string | null | undefined): string {
	if (!url) return '';
	const trimmed = url.trim();
	if (!trimmed) return '';
	let decoded = trimmed;
	for (let i = 0; i < 3; i++) {
		try {
			const next = decodeURIComponent(decoded);
			if (next === decoded) break;
			decoded = next;
		} catch {
			break;
		}
	}
	let normalized = '';
	for (const ch of decoded) if (ch.charCodeAt(0) > 0x20 && ch.charCodeAt(0) !== 0x7f) normalized += ch;
	if (!normalized || normalized.startsWith('//')) return '';
	if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(normalized)) return trimmed;
	try {
		const parsed = new URL(normalized);
		if (['http:', 'https:', 'mailto:'].includes(parsed.protocol)) return normalized;
	} catch {
		return '';
	}
	return '';
}
const renderer = new marked.Renderer();
renderer.code = ({ text: code, lang = '', escaped }: Tokens.Code): string => {
	const safeLang = /^[a-zA-Z0-9_-]+$/.test(lang) ? lang : '';
	const copyIcon = '<svg class="DocSearch-CodeSnippet-CopyIcon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>';
	const checkIcon = '<svg class="DocSearch-CodeSnippet-CheckIcon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>';
	return `
    <div class="DocSearch-CodeSnippet">
      <button class="DocSearch-CodeSnippet-CopyButton" data-code="${encodeURIComponent(code)}" aria-label="copy code">${copyIcon}${checkIcon}<span class="DocSearch-CodeSnippet-CopyButton-Label"></span></button>
      <pre><code class="${safeLang ? `language-${safeLang}` : ''}">${escaped ? code : escapeHtml(code)}</code></pre>
    </div>
  `;
};
renderer.link = ({ href, title, text: label }: Tokens.Link): string => {
	const safe = escapeHtml(sanitizeUrl(href));
	if (!safe) return escapeHtml(label);
	return `<a href="${safe}"${title ? ` title="${escapeHtml(title)}"` : ''} target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
};
renderer.image = ({ href, title, text: alt }: Tokens.Image): string => {
	const safe = escapeHtml(sanitizeUrl(href));
	if (!safe) return escapeHtml(alt);
	return `<img src="${safe}" alt="${escapeHtml(alt)}"${title ? ` title="${escapeHtml(title)}"` : ''} />`;
};
renderer.html = ({ text: html }: Tokens.HTML | Tokens.Tag): string => escapeHtml(html);
function markdown(content: string, copyText: string, streaming: boolean): string {
	const html = (marked.parse(content, { gfm: true, breaks: true, renderer }) as string).replace(/<span class="DocSearch-CodeSnippet-CopyButton-Label"><\/span>/g, `<span class="DocSearch-CodeSnippet-CopyButton-Label">${text(copyText)}</span>`);
	return `<div class="DocSearch-Markdown-Content ${streaming ? 'DocSearch-Markdown-Content--streaming' : ''}">${html}</div>`;
}

const contentOf = (message: Message | null): string =>
	(message?.parts ?? [])
		.filter((part) => part.type === 'text')
		.map((part) => part.text ?? '')
		.join('\n\n');
function linksOf(message: Message | null): { url: string; title?: string }[] {
	const links: { url: string; title?: string }[] = [];
	const seen = new Set<string>();
	for (const part of message?.parts ?? []) {
		if (part.type !== 'text' || !part.text) continue;
		const clean = part.text.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '');
		for (const match of clean.matchAll(/\[([^\]]*)\]\(([^)]+)\)/g)) {
			const url = sanitizeUrl(match[2]);
			if (url && !seen.has(url)) {
				seen.add(url);
				links.push({ url, title: match[1]!.trim() || undefined });
			}
		}
		for (const match of clean.matchAll(/(?<!\]\()https?:\/\/[^\s<>"{}|\\^`[\]]+/g)) {
			const url = sanitizeUrl(match[0].replace(/[.,;:!?]+$/, ''));
			if (url && !seen.has(url)) {
				seen.add(url);
				links.push({ url });
			}
		}
	}
	return links;
}
type DisplayPart = Part | { type: 'aggregated-tool-call'; queries: string[] };
function groupToolResults(parts: Part[]): DisplayPart[] {
	const out: DisplayPart[] = [];
	for (let i = 0; i < parts.length; i++) {
		const part = parts[i]!;
		if (part.type === 'tool-searchIndex' && part.state === 'output-available') {
			const queries: string[] = [];
			let j = i;
			while (j < parts.length && parts[j]!.type === 'tool-searchIndex' && parts[j]!.state === 'output-available') {
				const q = (parts[j]!.output?.query ?? '').trim();
				if (q) queries.push(q);
				j++;
			}
			if (queries.length > 1) out.push({ type: 'aggregated-tool-call', queries });
			else if (queries.length === 1) out.push(part);
			i = j - 1;
		} else out.push(part);
	}
	return out;
}

const ALERT_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" fill-rule="evenodd" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" class="lucide lucide-triangle-alert-icon lucide-triangle-alert"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path></svg>';
const LIKE_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-thumbs-up-icon lucide-thumbs-up"><path d="M7 10v12"></path><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"></path></svg>';
const DISLIKE_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-thumbs-down-icon lucide-thumbs-down"><path d="M17 14V2"></path><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"></path></svg>';
const COPY_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-copy-icon lucide-copy"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg>';
const CHECK_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check-icon lucide-check"><path d="M20 6 9 17l-5-5"></path></svg>';
const SOURCE_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="4" x2="20" y1="9" y2="9"></line><line x1="4" x2="20" y1="15" y2="15"></line><line x1="10" x2="8" y1="3" y2="21"></line><line x1="16" x2="14" y1="3" y2="21"></line></svg>';

// useChat's state: every change re-renders the screen.
class Observed implements ChatState<Message> {
	#status: ChatStatus = 'ready';
	#error: Error | undefined;
	#messages: Message[];
	constructor(
		messages: Message[],
		readonly changed: () => void,
	) {
		this.#messages = messages;
	}
	get status(): ChatStatus {
		return this.#status;
	}
	set status(status: ChatStatus) {
		this.#status = status;
		this.changed();
	}
	get error(): Error | undefined {
		return this.#error;
	}
	set error(error: Error | undefined) {
		this.#error = error;
		this.changed();
	}
	get messages(): Message[] {
		return this.#messages;
	}
	set messages(messages: Message[]) {
		this.#messages = [...messages];
		this.changed();
	}
	pushMessage = (message: Message): void => {
		this.#messages = this.#messages.concat(message);
		this.changed();
	};
	popMessage = (): void => {
		this.#messages = this.#messages.slice(0, -1);
		this.changed();
	};
	replaceMessage = (index: number, message: Message): void => {
		this.#messages = [...this.#messages.slice(0, index), this.snapshot(message), ...this.#messages.slice(index + 1)];
		this.changed();
	};
	snapshot = <T>(value: T): T => structuredClone(value);
}
class Chat extends AbstractChat<Message> {
	constructor(init: ConstructorParameters<typeof AbstractChat<Message>>[0]) {
		super(init);
	}
}

export type AskAiChat = ReturnType<typeof createAskAiChat>;

export function createAskAiChat(options: { assistantId: string; apiKey: string; appId: string; indexName: string; searchParameters?: object; conversations: Stored<Hit>; messages?: unknown[]; onChange: () => void }) {
	const { assistantId, apiKey, appId, indexName, searchParameters, conversations, onChange } = options;
	let abortController = new AbortController();
	const transport = new DefaultChatTransport<Message>({
		api: ASK_AI_API_URL,
		headers: async () => {
			const token = await getValidToken(assistantId, abortController.signal);
			return { ...(token ? { authorization: `TOKEN ${token}` } : {}), 'X-Algolia-API-Key': apiKey, 'X-Algolia-Application-Id': appId, 'X-Algolia-Index-Name': indexName, 'X-Algolia-Assistant-Id': assistantId || '', 'X-AI-SDK-Version': 'v5' };
		},
		body: searchParameters ? { searchParameters } : {},
	});
	const state = new Observed((options.messages as Message[] | undefined) ?? [], () => onChange());
	const chat = new Chat({ id: generateId(), state, transport, sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls });

	// Per answer: the feedback given (or being sent) and whether its text was just copied.
	const feedback = new Map<string, { value: 'dislike' | 'like' | null; saving: boolean; error: Error | null }>();
	const copied = new Set<string>();
	const feedbackOf = (id: string) => {
		let entry = feedback.get(id);
		if (!entry) feedback.set(id, (entry = { value: conversations.getOne?.(id)?.feedback ?? null, saving: false, error: null }));
		return entry;
	};
	async function sendFeedback(id: string, value: 'dislike' | 'like'): Promise<void> {
		const entry = feedbackOf(id);
		if (entry.saving) return;
		entry.error = null;
		entry.saving = true;
		onChange();
		try {
			const token = await getValidToken(assistantId, abortController.signal);
			const res = await fetch(`${ASK_AI_API_URL}/feedback`, { method: 'POST', body: JSON.stringify({ appId, messageId: id, thumbs: value === 'like' ? 1 : 0 }), headers: { 'x-algolia-assistant-id': assistantId, 'content-type': 'application/json', authorization: `TOKEN ${token}` } });
			if (res.status >= 300) throw new Error('Failed, try again later.');
			conversations.addFeedback?.(id, value);
			entry.value = value;
		} catch (error) {
			entry.error = error as Error;
		} finally {
			entry.saving = false;
			onChange();
		}
	}

	const blocking = () => chat.status === 'error' && isThreadDepthError(chat.error);
	// The questions and their answers, in the order they were asked; the screen shows the latest first.
	function exchanges(): { user: Message; assistant: Message | null }[] {
		const messages = chat.messages;
		const grouped: { user: Message; assistant: Message | null }[] = [];
		for (let i = 0; i < messages.length; i++) {
			if (messages[i]!.role !== 'user') continue;
			const assistant = messages[i + 1]?.role === 'assistant' ? messages[i + 1]! : null;
			grouped.push({ user: messages[i]!, assistant });
			if (assistant) i++;
		}
		return grouped;
	}
	function exchangeOf(element: Element): { user: Message; assistant: Message | null } | undefined {
		const card = element.closest('.DocSearch-AskAiScreen-Response-Container');
		if (!card?.parentElement) return undefined;
		return exchanges().reverse()[[...card.parentElement.children].indexOf(card)];
	}
	// A search query shown in an answer reads "query" (after the tool's result text, with a leading space).
	const queryOf = (element: Element): string => (element.textContent ?? '').trim().replace(/^"|"$/g, '');

	function exchangeHtml(user: Message, assistant: Message | null, isLast: boolean, tr: Translations): string {
		const status = chat.status;
		const error = chat.error;
		const parts = groupToolResults(assistant?.parts ?? []);
		const stopped = user.metadata?.stopped || assistant?.metadata?.stopped;
		const showActions = !stopped && (!isLast || (status === 'ready' && Boolean(assistant)));
		const thinking = ['submitted', 'streaming'].includes(status) && isLast && !parts.some((part) => part.type !== 'step-start');
		const id = user.id;
		const assistantText = contentOf(assistant);
		const body = parts
			.map((part) => {
				if (part.type === 'aggregated-tool-call') {
					const queries = (part as { queries: string[] }).queries;
					return `<div class="DocSearch-AskAiScreen-MessageContent-Tool Tool--AggregatedResult">${icons.search(18)}<span><span>Searched for </span>${queries.map((q, i) => `<span role="button" tabindex="0" class="DocSearch-AskAiScreen-MessageContent-Tool-Query">"${text(q)}"</span>${i < queries.length - 2 ? ', ' : i === queries.length - 2 ? ' and ' : ''}`).join('')}</span></div>`;
				}
				const p = part as Part;
				if (p.type === 'reasoning' && p.state === 'streaming') return `<div class="DocSearch-AskAiScreen-MessageContent-Reasoning shimmer">${icons.loading('DocSearch-AskAiScreen-SmallerLoadingIcon')}<span class="shimmer">Reasoning...</span></div>`;
				if (p.type === 'text') return markdown(p.text ?? '', tr.copyButtonText || 'Copy', p.state === 'streaming');
				if (p.type === 'tool-searchIndex' || p.type === 'tool-algolia_search_index') {
					if (p.state === 'input-streaming') return `<div class="DocSearch-AskAiScreen-MessageContent-Tool Tool--PartialCall shimmer">${icons.loading('DocSearch-AskAiScreen-SmallerLoadingIcon')}<span>${text(tr.duringToolCallText || 'Searching...')}</span></div>`;
					if (p.state === 'input-available') return `<div class="DocSearch-AskAiScreen-MessageContent-Tool Tool--Call shimmer">${icons.loading('DocSearch-AskAiScreen-SmallerLoadingIcon')}<span>${text(tr.preToolCallText || 'Searching...')} ${text(`"${p.input?.query || ''}" ...`)}</span></div>`;
					if (p.state === 'output-available') {
						const query = (p.type === 'tool-searchIndex' ? p.output?.query : p.input?.query) || '';
						return `<div class="DocSearch-AskAiScreen-MessageContent-Tool Tool--Result">${icons.search()}<span>${text(tr.afterToolCallText || 'Searched for')} <span role="button" tabindex="0" class="DocSearch-AskAiScreen-MessageContent-Tool-Query"> "${text(query)}"</span> found ${p.output?.hits?.length ?? 0} results</span></div>`;
					}
				}
				return '';
			})
			.join('');
		const errorHtml = status === 'error' && error && isLast && !isThreadDepthError(error) ? `<div class="DocSearch-AskAiScreen-MessageContent DocSearch-AskAiScreen-Error">${ALERT_ICON}<div class="DocSearch-AskAiScreen-Error-Content"><h4 class="DocSearch-AskAiScreen-Error-Title">Chat error</h4>${markdown(error.message, '', false)}</div></div>` : '';
		const thinkingHtml = thinking ? `<div class="DocSearch-AskAiScreen-MessageContent-Reasoning"><span class="shimmer">${text(tr.thinkingText || 'Thinking...')}</span></div>` : '';
		let actions = '';
		if (showActions && assistantText) {
			const entry = feedbackOf(id);
			const isCopied = copied.has(id);
			const votes =
				entry.value === null
					? `${entry.saving ? icons.loading('DocSearch-AskAiScreen-SmallerLoadingIcon') : `<button type="button" class="DocSearch-AskAiScreen-ActionButton DocSearch-AskAiScreen-LikeButton" title="${attr(tr.likeButtonTitle || 'Like')}">${LIKE_ICON}</button><button type="button" class="DocSearch-AskAiScreen-ActionButton DocSearch-AskAiScreen-DislikeButton" title="${attr(tr.dislikeButtonTitle || 'Dislike')}">${DISLIKE_ICON}</button>`}${entry.error ? `<p class="DocSearch-AskAiScreen-FeedbackText">${text(entry.error.message || 'An error occured')}</p>` : ''}`
					: `<p class="DocSearch-AskAiScreen-FeedbackText DocSearch-AskAiScreen-FeedbackText--visible">${text(tr.thanksForFeedbackText || 'Thanks for your feedback!')}</p>`;
			actions = `<div class="DocSearch-AskAiScreen-Actions">${votes}<button type="button" class="DocSearch-AskAiScreen-ActionButton DocSearch-AskAiScreen-CopyButton ${isCopied ? 'DocSearch-AskAiScreen-CopyButton--copied' : ''}"${isCopied ? ' disabled=""' : ''} title="${attr(isCopied ? tr.copyButtonCopiedText || 'Copied!' : tr.copyButtonTitle || 'Copy')}">${isCopied ? CHECK_ICON : COPY_ICON}</button></div>`;
		}
		const links = linksOf(assistant);
		const sources = links.length ? `<div class="DocSearch-AskAiScreen-RelatedSources"><p class="DocSearch-AskAiScreen-RelatedSources-Title">${text(tr.relatedSourcesText || 'Related sources')}</p><div class="DocSearch-AskAiScreen-RelatedSources-List">${links.map((link) => `<a href="${attr(link.url)}" class="DocSearch-AskAiScreen-RelatedSources-Item-Link" target="_blank" rel="noopener noreferrer">${SOURCE_ICON}<span>${text(link.title || link.url)}</span></a>`).join('')}</div></div>` : '';
		return `<div class="DocSearch-AskAiScreen-Response-Container"><div class="DocSearch-AskAiScreen-Response"><div class="DocSearch-AskAiScreen-Message DocSearch-AskAiScreen-Message--user"><p class="DocSearch-AskAiScreen-Query">${text(contentOf(user))}</p></div><div class="DocSearch-AskAiScreen-Message DocSearch-AskAiScreen-Message--assistant"><div class="DocSearch-AskAiScreen-MessageContent">${errorHtml}${thinkingHtml}${body}</div>${stopped ? `<p class="DocSearck-AskAiScreen-MessageContent-Stopped">${text('You stopped this response')}</p>` : ''}</div><div class="DocSearch-AskAiScreen-Answer-Footer">${actions}</div></div>${sources}</div>`;
	}

	return {
		get status(): ChatStatus {
			return chat.status;
		},
		get messages(): Message[] {
			return chat.messages;
		},
		// A blocked conversation (its depth limit reached) is answered with a banner instead of a new answer.
		get promptBlocked(): boolean {
			return blocking();
		},
		get minimalBlocking(): boolean {
			return isTokenOutputLimitError(chat.error);
		},
		send(query: string, body?: object): void {
			void chat.sendMessage({ role: 'user', parts: [{ type: 'text', text: query }] }, body ? { body } : {});
		},
		async stop(): Promise<void> {
			abortController.abort();
			await chat.stop();
			abortController = new AbortController();
		},
		clearError: () => chat.clearError(),
		resetAbortScope(): void {
			abortController.abort();
			abortController = new AbortController();
		},
		abort(): void {
			abortController.abort();
			void chat.stop();
		},
		storedHit(firstText: string): Hit {
			const sanitized = sanitizeUserInput(firstText);
			return { query: firstText, objectID: sanitized, messages: chat.messages, type: 'askAI', anchor: 'stored', content: null, hierarchy: { lvl0: 'askAI', lvl1: sanitized, lvl2: null, lvl3: null, lvl4: null, lvl5: null, lvl6: null }, url: '', url_without_anchor: '' };
		},
		screenHtml(tr: Translations): string {
			const messages = chat.messages;
			const blocked = blocking();
			const showBanner = blocked && (isThreadDepthError(chat.error) ? messages.some((m) => m.role === 'assistant') : true);
			const banner = bannerMessage(chat.error);
			const link = !chat.error || (!isTokenOutputLimitError(chat.error) && true);
			const bannerHtml = showBanner ? `<div class="DocSearch-AskAiScreen-MessageContent DocSearch-AskAiScreen-Error DocSearch-AskAiScreen-Error--ThreadDepth"><div class="DocSearch-AskAiScreen-Error-Content">${banner ? `<p class="DocSearch-AskAiScreen-Error-Title">${text(banner)}</p>` : ''}${link ? '<p><button type="button" class="DocSearch-ThreadDepthError-Link">Start a new conversation</button> to continue.</p>' : ''}</div></div>` : '';
			const list = exchanges()
				.reverse()
				.map((exchange, index) => exchangeHtml(exchange.user, exchange.assistant, index === 0, tr))
				.join('');
			return `<div class="DocSearch-AskAiScreen DocSearch-AskAiScreen-Container">${bannerHtml}<p class="DocSearch-AskAiScreen-Disclaimer">${text(tr.disclaimerText || 'Answers are generated with AI which can make mistakes. Verify responses.')}</p><div class="DocSearch-AskAiScreen-Body"><div class="DocSearch-AskAiScreen-ExchangesList">${list}</div></div></div>`;
		},
		mounted(_dropdown: Element): void {},
		// Clicks on the answers: copy, feedback, a search query, a code block's copy button, a new conversation.
		click(event: MouseEvent, search: (query: string) => void, newConversation?: () => void): boolean {
			const target = event.target as Element;
			const vote = target.closest('.DocSearch-AskAiScreen-LikeButton, .DocSearch-AskAiScreen-DislikeButton');
			const exchange = exchangeOf(target);
			if (vote && exchange) {
				void sendFeedback(exchange.user.id, vote.classList.contains('DocSearch-AskAiScreen-LikeButton') ? 'like' : 'dislike');
				return true;
			}
			const copy = target.closest('.DocSearch-AskAiScreen-CopyButton');
			if (copy && exchange) {
				const id = exchange.user.id;
				void navigator.clipboard.writeText(contentOf(exchange.assistant));
				copied.add(id);
				onChange();
				setTimeout(() => {
					copied.delete(id);
					onChange();
				}, 1500);
				return true;
			}
			const query = target.closest('.DocSearch-AskAiScreen-MessageContent-Tool-Query');
			if (query) {
				search(queryOf(query));
				return true;
			}
			const code = target.closest<HTMLButtonElement>('.DocSearch-CodeSnippet-CopyButton');
			if (code) {
				navigator.clipboard.writeText(decodeURIComponent(code.getAttribute('data-code') ?? '')).catch(() => {});
				const label = code.querySelector<HTMLElement>('.DocSearch-CodeSnippet-CopyButton-Label');
				if (!label) return true;
				// An answer's code says Copy, then Copied!; an error's says nothing either way.
				const original = label.textContent ?? '';
				code.classList.add('DocSearch-CodeSnippet-CopyButton--copied');
				label.textContent = original ? 'Copied!' : '';
				setTimeout(() => {
					code.classList.remove('DocSearch-CodeSnippet-CopyButton--copied');
					label.textContent = original;
				}, 1500);
				return true;
			}
			if (target.closest('.DocSearch-ThreadDepthError-Link')) {
				newConversation?.();
				return true;
			}
			return false;
		},
		key(event: KeyboardEvent, search: (query: string) => void): void {
			const query = (event.target as Element).closest('.DocSearch-AskAiScreen-MessageContent-Tool-Query');
			if (query && (event.key === 'Enter' || event.key === ' ')) {
				event.preventDefault();
				search(queryOf(query));
			}
		},
	};
}
