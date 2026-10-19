// features/chats: the inbox list and its search, a conversation grouped by day, and the new-chat command list
// (cmdk's scoring, ordering and selection, which mount and move its items as the search changes).
import { conversations } from './chats-convo.ts';

export type ChatUser = (typeof conversations)[number];

export interface ChatListItem {
	readonly id: string;
	readonly profile: string;
	readonly username: string;
	readonly fullName: string;
	readonly lastMsg: string;
}

export interface ConvoItem {
	readonly key: string;
	readonly day: boolean;
	readonly text: string;
	readonly time: string;
	readonly mine: boolean;
	readonly cls: string;
	readonly timeCls: string;
}

export const USERS = conversations.map(({ messages, ...user }) => user);

export function chatList(search: string): ChatListItem[] {
	return conversations
		.filter(({ fullName }) => fullName.toLowerCase().includes(search.trim().toLowerCase()))
		.map(({ id, profile, username, fullName, messages }) => ({ id, profile, username, fullName, lastMsg: messages[0].sender === 'You' ? `You: ${messages[0].message}` : messages[0].message }));
}

export function chatUser(id: string): ChatUser | undefined {
	return conversations.find((c) => c.id === id);
}

export function initials(displayName: string): string {
	const parts = displayName.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return '?';
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return ((parts[0][0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')).toUpperCase();
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** date-fns format(timestamp, 'd MMM, yyyy'), in the browser's own time zone. */
export function formatDay(timestamp: string): string {
	const d = new Date(timestamp);
	return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${d.getFullYear()}`;
}

/** date-fns format(timestamp, 'h:mm a'). */
export function formatTime(timestamp: string): string {
	const d = new Date(timestamp);
	const h = d.getHours() % 12 || 12;
	return `${h}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
}

const MINE = 'chat-box max-w-72 px-3 py-2 wrap-break-word shadow-lg self-end rounded-[16px_16px_0_16px] bg-primary/90 text-primary-foreground/75';
const THEIRS = 'chat-box max-w-72 px-3 py-2 wrap-break-word shadow-lg self-start rounded-[16px_16px_16px_0] bg-muted';
const MINE_TIME = 'mt-1 block text-xs font-light italic text-end text-primary-foreground/85';
const THEIR_TIME = 'mt-1 block text-xs font-light text-foreground/75 italic';

/** The conversation as the page lays it out: each day's messages, then the day's label, newest day first. */
export function conversation(id: string): ConvoItem[] {
	const user = chatUser(id);
	if (!user) return [];
	const groups = new Map<string, ConvoItem[]>();
	user.messages.forEach((msg) => {
		const key = formatDay(msg.timestamp);
		const list = groups.get(key) ?? [];
		const mine = msg.sender === 'You';
		list.push({ key: `${msg.sender}-${msg.timestamp}-${list.length}`, day: false, text: `${msg.message} `, time: formatTime(msg.timestamp), mine, cls: mine ? MINE : THEIRS, timeCls: mine ? MINE_TIME : THEIR_TIME });
		groups.set(key, list);
	});
	return [...groups].flatMap(([day, list]) => [...list, { key: `day-${day}`, day: true, text: day, time: '', mine: false, cls: 'text-center text-xs', timeCls: '' }]);
}

const SCORE_CONTINUE_MATCH = 1;
const SCORE_SPACE_WORD_JUMP = 0.9;
const SCORE_NON_SPACE_WORD_JUMP = 0.8;
const SCORE_CHARACTER_JUMP = 0.17;
const SCORE_TRANSPOSITION = 0.1;
const PENALTY_SKIPPED = 0.999;
const PENALTY_CASE_MISMATCH = 0.9999;
const PENALTY_NOT_COMPLETE = 0.99;
const IS_GAP = /[\\/_+.#"@[({&]/;
const COUNT_GAPS = /[\\/_+.#"@[({&]/g;
const IS_SPACE = /[\s-]/;
const COUNT_SPACE = /[\s-]/g;

function scoreFrom(value: string, abbreviation: string, lowerValue: string, lowerAbbreviation: string, valueIndex: number, abbreviationIndex: number, memo: Record<string, number>): number {
	if (abbreviationIndex === abbreviation.length) return valueIndex === value.length ? SCORE_CONTINUE_MATCH : PENALTY_NOT_COMPLETE;
	const memoKey = `${valueIndex},${abbreviationIndex}`;
	if (memo[memoKey] !== undefined) return memo[memoKey];
	const abbreviationChar = lowerAbbreviation.charAt(abbreviationIndex);
	let index = lowerValue.indexOf(abbreviationChar, valueIndex);
	let highScore = 0;
	while (index >= 0) {
		let score = scoreFrom(value, abbreviation, lowerValue, lowerAbbreviation, index + 1, abbreviationIndex + 1, memo);
		if (score > highScore) {
			if (index === valueIndex) score *= SCORE_CONTINUE_MATCH;
			else if (IS_GAP.test(value.charAt(index - 1))) {
				score *= SCORE_NON_SPACE_WORD_JUMP;
				const gaps = value.slice(valueIndex, index - 1).match(COUNT_GAPS);
				if (gaps && valueIndex > 0) score *= Math.pow(PENALTY_SKIPPED, gaps.length);
			} else if (IS_SPACE.test(value.charAt(index - 1))) {
				score *= SCORE_SPACE_WORD_JUMP;
				const spaces = value.slice(valueIndex, index - 1).match(COUNT_SPACE);
				if (spaces && valueIndex > 0) score *= Math.pow(PENALTY_SKIPPED, spaces.length);
			} else {
				score *= SCORE_CHARACTER_JUMP;
				if (valueIndex > 0) score *= Math.pow(PENALTY_SKIPPED, index - valueIndex);
			}
			if (value.charAt(index) !== abbreviation.charAt(abbreviationIndex)) score *= PENALTY_CASE_MISMATCH;
		}
		if ((score < SCORE_TRANSPOSITION && lowerValue.charAt(index - 1) === lowerAbbreviation.charAt(abbreviationIndex + 1)) || (lowerAbbreviation.charAt(abbreviationIndex + 1) === lowerAbbreviation.charAt(abbreviationIndex) && lowerValue.charAt(index - 1) !== lowerAbbreviation.charAt(abbreviationIndex))) {
			const transposed = scoreFrom(value, abbreviation, lowerValue, lowerAbbreviation, index + 1, abbreviationIndex + 2, memo);
			if (transposed * SCORE_TRANSPOSITION > score) score = transposed * SCORE_TRANSPOSITION;
		}
		if (score > highScore) highScore = score;
		index = lowerValue.indexOf(abbreviationChar, index + 1);
	}
	memo[memoKey] = highScore;
	return highScore;
}

const formatInput = (s: string) => s.toLowerCase().replace(COUNT_SPACE, ' ');

/** cmdk's command-score. */
export function commandScore(value: string, search: string): number {
	return scoreFrom(value, search, formatInput(value), formatInput(search), 0, 0, {});
}

const valueOf = (id: string) => {
	const u = USERS.find((x) => x.id === id);
	return u ? `${u.fullName}${u.username}` : '';
};

const ALL_IDS = USERS.map((u) => u.id);

/** The order cmdk leaves its items in after the search changes, as comma-joined ids of the mounted items: cmdk sorts
 * what is mounted, the items scoring 0 unmount, and items that come back are placed by React before their next
 * sibling that stayed mounted. */
export function commandOrder(previous: string, search: string): string {
	const scores = new Map(ALL_IDS.map((id) => [id, search ? commandScore(valueOf(id), search) : 1]));
	const before = previous ? previous.split(',') : [];
	const sorted = search ? before.slice().sort((a, b) => (scores.get(b) ?? 0) - (scores.get(a) ?? 0)) : before;
	const kept = sorted.filter((id) => (scores.get(id) ?? 0) > 0);
	const dom = [...kept];
	ALL_IDS.forEach((id, at) => {
		if (kept.includes(id) || (scores.get(id) ?? 0) <= 0) return;
		const next = ALL_IDS.slice(at + 1).find((other) => kept.includes(other));
		if (next) dom.splice(dom.indexOf(next), 0, id);
		else dom.push(id);
	});
	return dom.join(',');
}

export interface CommandUser {
	readonly id: string;
	readonly domId: string;
	readonly value: string;
	readonly profile: string;
	readonly username: string;
	readonly fullName: string;
}

export function commandUsers(order: string): CommandUser[] {
	return (order ? order.split(',') : []).map((id) => {
		const u = USERS.find((x) => x.id === id)!;
		return { id, domId: `new-chat-item-${id}`, value: `${u.fullName}${u.username}`, profile: u.profile, username: u.username, fullName: u.fullName };
	});
}

export function firstOf(order: string): string {
	return order.split(',')[0] ?? '';
}

/** ArrowDown/ArrowUp/Home/End over the mounted items, without wrapping. */
export function moveActive(order: string, active: string, key: string): string {
	const list = order ? order.split(',') : [];
	if (!list.length) return active;
	const at = list.indexOf(active);
	if (key === 'Home') return list[0];
	if (key === 'End') return list[list.length - 1];
	if (key === 'ArrowDown') return at + 1 < list.length ? list[at + 1] : active;
	return at > 0 ? list[at - 1] : at < 0 ? active : active;
}

/** handleSelectUser: add the user, or remove it when it is already chosen. */
export function toggleChosen(chosen: string, id: string): string {
	const list = chosen ? chosen.split(',') : [];
	return (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]).join(',');
}

export function chosenUsers(chosen: string): (typeof USERS)[number][] {
	return (chosen ? chosen.split(',') : []).map((id) => USERS.find((u) => u.id === id)!).filter(Boolean);
}

export function submitted(chosen: string): string {
	return JSON.stringify(chosenUsers(chosen), null, 2);
}
