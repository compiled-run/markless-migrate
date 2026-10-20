// The search modal docusaurus.io opens from its navbar: theme-search-algolia's SearchBar around DocSearch 4.7's modal,
// written against the DOM. Its state machine is the framework-free autocomplete-core DocSearch runs and its client
// the same algoliasearch lite build DocSearch bundles (5.43), with the site's Algolia settings. Ask AI's chat
// (./docsearch-ask-ai.ts) loads while the modal is open.
import { createAutocomplete } from '@algolia/autocomplete-core';
import type { AutocompleteApi, AutocompleteSource, AutocompleteState } from '@algolia/autocomplete-core';
import { liteClient } from 'algoliasearch-docsearch/lite';
import docsVersions from './docs-versions.json';
import translations from './search-translations.json';
import { docsVersionCandidates } from './site.ts';
import type * as AskAiModule from './docsearch-ask-ai.ts';

const APP_ID = 'X1Z85QJPUV';
const API_KEY = 'bf7211c161e8205da2f933a02534105a';
const INDEX_NAME = 'docusaurus-2';
const ASK_AI = { assistantId: 'RgIMYFUmTfrN', indexName: 'docusaurus-markdown', suggestedQuestions: true };
const DOCSEARCH_VERSION = '4.7.0';
const DOCUSAURUS_VERSION = '4.0.0';
const MAX_QUERY_SIZE = 512;
const SNIPPET_LENGTH = 15;
const SUGGESTED_QUESTIONS_INDEX = 'algolia_ask_ai_suggested_questions';
const RECENT_SEARCHES_LIMIT = 7;
const RECENT_SEARCHES_WITH_FAVORITES_LIMIT = 4;

type Level = 'lvl0' | 'lvl1' | 'lvl2' | 'lvl3' | 'lvl4' | 'lvl5' | 'lvl6';
type Highlighted = { value: string };
export type Hit = {
	objectID: string;
	url: string;
	url_without_anchor?: string;
	anchor?: string | null;
	content: string | null;
	type: Level | 'content' | 'askAI';
	query?: string;
	hierarchy: Record<Level, string | null>;
	_highlightResult?: { hierarchy?: Partial<Record<Level, Highlighted>> } & Record<string, unknown>;
	_snippetResult?: Record<string, unknown>;
	__docsearch_parent?: Hit | null;
	__autocomplete_id?: number;
	messages?: unknown[];
	[key: string]: unknown;
};
export type SuggestedQuestion = { objectID: string; question: string };
type State = AutocompleteState<Hit>;
type Collection = State['collections'][number];
export type AskAiState = 'conversation-history' | 'conversation' | 'initial' | 'new-conversation';

const t = translations.modal;
export const escapeHtml = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
// React's own escaping of text and attribute values.
const text = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const attr = (value: string): string => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
export const sanitizeUserInput = (input: string): string => escapeHtml(input.replace(/<[^>]*>/g, ''));
const isModifierEvent = (event: MouseEvent | KeyboardEvent): boolean => (event as MouseEvent).button === 1 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;

// Icons, as DocSearch draws them.
export const icons = {
	search: (size = 20) => `<svg width="${size}" height="${size}" class="DocSearch-Search-Icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="8" stroke="currentColor" fill="none" stroke-width="1.4"></circle><path d="m21 21-4.3-4.3" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"></path></svg>`,
	loading: (className?: string) => `<svg viewBox="0 0 38 38"${className ? ` class="${className}"` : ''} stroke="currentColor" stroke-opacity=".5"><g fill="none" fill-rule="evenodd"><g transform="translate(1 1)" stroke-width="2"><circle stroke-opacity=".3" cx="18" cy="18" r="18"></circle><path d="M36 18c0-9.94-8.06-18-18-18"><animateTransform attributeName="transform" type="rotate" from="0 18 18" to="360 18 18" dur="1s" repeatCount="indefinite"></animateTransform></path></g></g></svg>`,
	close: '<svg width="20" height="20" viewBox="0 0 20 20"><path d="M10 10l5.09-5.09L10 10l5.09 5.09L10 10zm0 0L4.91 4.91 10 10l-5.09 5.09L10 10z" stroke="currentColor" fill="none" fill-rule="evenodd" stroke-linecap="round" stroke-linejoin="round"></path></svg>',
	recent: '<svg width="20" height="20" viewBox="0 0 20 20"><g stroke="currentColor" fill="none" fill-rule="evenodd" stroke-linecap="round" stroke-linejoin="round"><path d="M3.18 6.6a8.23 8.23 0 1112.93 9.94h0a8.23 8.23 0 01-11.63 0"></path><path d="M6.44 7.25H2.55V3.36M10.45 6v5.6M10.45 11.6L13 13"></path></g></svg>',
	star: '<svg width="20" height="20" viewBox="0 0 20 20"><path d="M10 14.2L5 17l1-5.6-4-4 5.5-.7 2.5-5 2.5 5 5.6.8-4 4 .9 5.5z" stroke="currentColor" fill="none" fill-rule="evenodd" stroke-linejoin="round"></path></svg>',
	sparkles: (className = '') => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" class="DocSearch-Hit-icon-sparkles ${className}"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"></path><path d="M20 3v4"></path><path d="M22 5h-4"></path><path d="M4 17v2"></path><path d="M5 18H3"></path></svg>`,
	select: '<svg class="DocSearch-Hit-Select-Icon" width="20" height="20" viewBox="0 0 20 20"><g stroke="currentColor" fill="none" fill-rule="evenodd" stroke-linecap="round" stroke-linejoin="round"><path d="M18 3v4c0 2-2 4-4 4H2"></path><path d="M8 17l-6-6 6-6"></path></g></svg>',
	lvl: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"></path><path d="M14 2v4a2 2 0 0 0 2 2h4"></path><path d="M10 9H8"></path><path d="M16 13H8"></path><path d="M16 17H8"></path></svg>',
	content: '<svg width="20" height="20" viewBox="0 0 20 20"><path d="M17 5H3h14zm0 5H3h14zm0 5H3h14z" stroke="currentColor" fill="none" fill-rule="evenodd" stroke-linejoin="round"></path></svg>',
	anchor: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="4" x2="20" y1="9" y2="9"></line><line x1="4" x2="20" y1="15" y2="15"></line><line x1="10" x2="8" y1="3" y2="21"></line><line x1="16" x2="14" y1="3" y2="21"></line></svg>',
	noResults: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#5a5e9a" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m13.5 8.5-5 5"></path><path d="m8.5 8.5 5 5"></path><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg>',
	error: '<svg width="40" height="40" viewBox="0 0 20 20" fill="none" fill-rule="evenodd" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M19 4.8a16 16 0 00-2-1.2m-3.3-1.2A16 16 0 001.1 4.7M16.7 8a12 12 0 00-2.8-1.4M10 6a12 12 0 00-6.7 2M12.3 14.7a4 4 0 00-4.5 0M14.5 11.4A8 8 0 0010 10M3 16L18 2M10 18h0"></path></svg>',
	back: '<svg width="20" height="20" class="DocSearch-Back-Icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 19-7-7 7-7"></path><path d="M19 12H5"></path></svg>',
	stop: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18" fill="none"><path fill-rule="evenodd" clip-rule="evenodd" d="M8.99984 1.29102C4.74264 1.29102 1.2915 4.74215 1.2915 8.99935C1.2915 13.2565 4.74264 16.7077 8.99984 16.7077C13.257 16.7077 16.7082 13.2565 16.7082 8.99935C16.7082 4.74215 13.257 1.29102 8.99984 1.29102ZM0.0415039 8.99935C0.0415039 4.0518 4.05229 0.0410156 8.99984 0.0410156C13.9474 0.0410156 17.9582 4.0518 17.9582 8.99935C17.9582 13.9469 13.9474 17.9577 8.99984 17.9577C4.05229 17.9577 0.0415039 13.9469 0.0415039 8.99935ZM5.87484 6.49935C5.87484 6.15417 6.15466 5.87435 6.49984 5.87435H11.4998C11.845 5.87435 12.1248 6.15417 12.1248 6.49935V11.4993C12.1248 11.8445 11.845 12.1243 11.4998 12.1243H6.49984C6.15466 12.1243 5.87484 11.8445 5.87484 11.4993V6.49935ZM7.12484 7.12435V10.8743H10.8748V7.12435H7.12484Z" fill="currentcolor"></path></svg>',
	moreVertical:
		'<svg xmlns="http://www.w3.org/2000/svg" width="4" height="16" viewBox="0 0 4 16" fill="none"><path fill-rule="evenodd" clip-rule="evenodd" d="M1.99984 1.95898C1.88478 1.95898 1.7915 2.05226 1.7915 2.16732C1.7915 2.28238 1.88478 2.37565 1.99984 2.37565C2.1149 2.37565 2.20817 2.28238 2.20817 2.16732C2.20817 2.05226 2.1149 1.95898 1.99984 1.95898ZM0.541504 2.16732C0.541504 1.3619 1.19442 0.708984 1.99984 0.708984C2.80525 0.708984 3.45817 1.3619 3.45817 2.16732C3.45817 2.97273 2.80525 3.62565 1.99984 3.62565C1.19442 3.62565 0.541504 2.97273 0.541504 2.16732ZM1.99984 7.79232C1.88478 7.79232 1.7915 7.88559 1.7915 8.00065C1.7915 8.11571 1.88478 8.20898 1.99984 8.20898C2.1149 8.20898 2.20817 8.11571 2.20817 8.00065C2.20817 7.88559 2.1149 7.79232 1.99984 7.79232ZM0.541504 8.00065C0.541504 7.19524 1.19442 6.54232 1.99984 6.54232C2.80525 6.54232 3.45817 7.19524 3.45817 8.00065C3.45817 8.80607 2.80525 9.45898 1.99984 9.45898C1.19442 9.45898 0.541504 8.80607 0.541504 8.00065ZM1.99984 13.6257C1.88478 13.6257 1.7915 13.7189 1.7915 13.834C1.7915 13.949 1.88478 14.0423 1.99984 14.0423C2.1149 14.0423 2.20817 13.949 2.20817 13.834C2.20817 13.7189 2.1149 13.6257 1.99984 13.6257ZM0.541504 13.834C0.541504 13.0286 1.19442 12.3757 1.99984 12.3757C2.80525 12.3757 3.45817 13.0286 3.45817 13.834C3.45817 14.6394 2.80525 15.2923 1.99984 15.2923C1.19442 15.2923 0.541504 14.6394 0.541504 13.834Z" fill="currentcolor"></path></svg>',
	newConversation:
		'<svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 19 19" fill="none"><path fill-rule="evenodd" clip-rule="evenodd" d="M0.712717 3.38039C1.14249 2.95062 1.72538 2.70917 2.33317 2.70917H8.1665C8.51168 2.70917 8.7915 2.989 8.7915 3.33417C8.7915 3.67935 8.51168 3.95917 8.1665 3.95917H2.33317C2.0569 3.95917 1.79195 4.06892 1.5966 4.26427C1.40125 4.45962 1.2915 4.72457 1.2915 5.00084V16.6675C1.2915 16.9438 1.40125 17.2087 1.5966 17.4041C1.79195 17.5994 2.0569 17.7092 2.33317 17.7092H13.9998C14.2761 17.7092 14.5411 17.5994 14.7364 17.4041C14.9318 17.2087 15.0415 16.9438 15.0415 16.6675V10.8342C15.0415 10.489 15.3213 10.2092 15.6665 10.2092C16.0117 10.2092 16.2915 10.489 16.2915 10.8342V16.6675C16.2915 17.2753 16.0501 17.8582 15.6203 18.288C15.1905 18.7177 14.6076 18.9592 13.9998 18.9592H2.33317C1.72538 18.9592 1.14249 18.7177 0.712717 18.288C0.282947 17.8582 0.0415039 17.2753 0.0415039 16.6675V5.00084C0.0415039 4.39305 0.282947 3.81016 0.712717 3.38039Z" fill="currentcolor"></path><path fill-rule="evenodd" clip-rule="evenodd" d="M15.6665 2.19141C15.3634 2.19141 15.0728 2.3118 14.8584 2.52611L7.06419 10.3204L6.52548 12.4752L8.68031 11.9365L16.4746 4.14223C16.6889 3.92792 16.8093 3.63725 16.8093 3.33417C16.8093 3.03109 16.6889 2.74043 16.4746 2.52611C16.2603 2.3118 15.9696 2.19141 15.6665 2.19141ZM13.9746 1.64223C14.4233 1.1935 15.0319 0.941406 15.6665 0.941406C16.3011 0.941406 16.9097 1.1935 17.3584 1.64223C17.8072 2.09096 18.0593 2.69957 18.0593 3.33417C18.0593 3.96877 17.8072 4.57738 17.3584 5.02611L9.44178 12.9428C9.36168 13.0229 9.26132 13.0797 9.15142 13.1072L5.81809 13.9405C5.6051 13.9938 5.3798 13.9314 5.22456 13.7761C5.06932 13.6209 5.00692 13.3956 5.06016 13.1826L5.8935 9.84925C5.92097 9.73936 5.9778 9.639 6.0579 9.5589L13.9746 1.64223Z" fill="currentcolor"></path></svg>',
	conversationHistory:
		'<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 0.875C10.6068 0.875 12.1776 1.35149 13.5137 2.24414C14.8498 3.13693 15.8919 4.40598 16.5068 5.89062C17.1218 7.37522 17.2822 9.00892 16.9688 10.585C16.6552 12.1611 15.8814 13.6088 14.7451 14.7451C13.6088 15.8814 12.1611 16.6552 10.585 16.9688C9.00892 17.2822 7.37523 17.1218 5.89062 16.5068C4.40598 15.8919 3.13693 14.8498 2.24414 13.5137C1.35149 12.1776 0.875 10.6068 0.875 9C0.875 8.65482 1.15482 8.375 1.5 8.375C1.84518 8.375 2.125 8.65482 2.125 9C2.125 10.3596 2.52792 11.6888 3.2832 12.8193C4.03864 13.9499 5.1129 14.8312 6.36914 15.3516C7.62523 15.8718 9.00736 16.0083 10.3408 15.7432C11.6744 15.4779 12.8998 14.8228 13.8613 13.8613C14.8228 12.8998 15.4779 11.6744 15.7432 10.3408C16.0083 9.00736 15.8718 7.62523 15.3516 6.36914C14.8312 5.1129 13.9499 4.03864 12.8193 3.2832C11.6888 2.52792 10.3596 2.125 9 2.125C7.06829 2.125 5.21604 2.89096 3.82129 4.22949L3.00879 5.04199H5.66699C6.01202 5.04217 6.29199 5.32192 6.29199 5.66699C6.29182 6.01191 6.01191 6.29182 5.66699 6.29199H1.5C1.45939 6.29199 1.41889 6.28716 1.37891 6.2793C1.36148 6.27587 1.345 6.26949 1.32812 6.26465C1.267 6.24714 1.20782 6.22205 1.15332 6.18555C1.08536 6.14005 1.02604 6.08256 0.980469 6.01465C0.970244 5.99942 0.962841 5.98268 0.954102 5.9668C0.904937 5.87756 0.875056 5.77606 0.875 5.66699V1.5C0.875 1.15482 1.15482 0.875002 1.5 0.875C1.84518 0.875 2.125 1.15482 2.125 1.5V4.15723L2.94141 3.3418L2.9502 3.33301C4.57158 1.77433 6.73388 0.875 9 0.875ZM9.33301 4.20801C9.67808 4.20801 9.95783 4.48798 9.95801 4.83301V9.44727L12.9463 10.9414C13.2548 11.0958 13.3798 11.4707 13.2256 11.7793C13.0712 12.088 12.6955 12.213 12.3867 12.0586L9.05371 10.3926C8.84198 10.2867 8.70801 10.0697 8.70801 9.83301V4.83301C8.70818 4.48809 8.98809 4.20819 9.33301 4.20801Z" fill="currentcolor"></path></svg>',
};
const sourceIcon = (type: string): string => (type === 'lvl1' ? icons.lvl : type === 'content' ? icons.content : icons.anchor);

const ALGOLIA_LOGO =
	'<span class="DocSearch-Label">{poweredBy}</span><svg width="80" height="24" aria-label="Algolia" role="img" id="Layer_1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2196.2 500"><defs><style>.cls-1,.cls-2{fill:#003dff;}.cls-2{fill-rule:evenodd;}</style></defs><path class="cls-2" d="M1070.38,275.3V5.91c0-3.63-3.24-6.39-6.82-5.83l-50.46,7.94c-2.87,.45-4.99,2.93-4.99,5.84l.17,273.22c0,12.92,0,92.7,95.97,95.49,3.33,.1,6.09-2.58,6.09-5.91v-40.78c0-2.96-2.19-5.51-5.12-5.84-34.85-4.01-34.85-47.57-34.85-54.72Z"></path><rect class="cls-1" x="1845.88" y="104.73" width="62.58" height="277.9" rx="5.9" ry="5.9"></rect><path class="cls-2" d="M1851.78,71.38h50.77c3.26,0,5.9-2.64,5.9-5.9V5.9c0-3.62-3.24-6.39-6.82-5.83l-50.77,7.95c-2.87,.45-4.99,2.92-4.99,5.83v51.62c0,3.26,2.64,5.9,5.9,5.9Z"></path><path class="cls-2" d="M1764.03,275.3V5.91c0-3.63-3.24-6.39-6.82-5.83l-50.46,7.94c-2.87,.45-4.99,2.93-4.99,5.84l.17,273.22c0,12.92,0,92.7,95.97,95.49,3.33,.1,6.09-2.58,6.09-5.91v-40.78c0-2.96-2.19-5.51-5.12-5.84-34.85-4.01-34.85-47.57-34.85-54.72Z"></path><path class="cls-2" d="M1631.95,142.72c-11.14-12.25-24.83-21.65-40.78-28.31-15.92-6.53-33.26-9.85-52.07-9.85-18.78,0-36.15,3.17-51.92,9.85-15.59,6.66-29.29,16.05-40.76,28.31-11.47,12.23-20.38,26.87-26.76,44.03-6.38,17.17-9.24,37.37-9.24,58.36,0,20.99,3.19,36.87,9.55,54.21,6.38,17.32,15.14,32.11,26.45,44.36,11.29,12.23,24.83,21.62,40.6,28.46,15.77,6.83,40.12,10.33,52.4,10.48,12.25,0,36.78-3.82,52.7-10.48,15.92-6.68,29.46-16.23,40.78-28.46,11.29-12.25,20.05-27.04,26.25-44.36,6.22-17.34,9.24-33.22,9.24-54.21,0-20.99-3.34-41.19-10.03-58.36-6.38-17.17-15.14-31.8-26.43-44.03Zm-44.43,163.75c-11.47,15.75-27.56,23.7-48.09,23.7-20.55,0-36.63-7.8-48.1-23.7-11.47-15.75-17.21-34.01-17.21-61.2,0-26.89,5.59-49.14,17.06-64.87,11.45-15.75,27.54-23.52,48.07-23.52,20.55,0,36.63,7.78,48.09,23.52,11.47,15.57,17.36,37.98,17.36,64.87,0,27.19-5.72,45.3-17.19,61.2Z"></path><path class="cls-2" d="M894.42,104.73h-49.33c-48.36,0-90.91,25.48-115.75,64.1-14.52,22.58-22.99,49.63-22.99,78.73,0,44.89,20.13,84.92,51.59,111.1,2.93,2.6,6.05,4.98,9.31,7.14,12.86,8.49,28.11,13.47,44.52,13.47,1.23,0,2.46-.03,3.68-.09,.36-.02,.71-.05,1.07-.07,.87-.05,1.75-.11,2.62-.2,.34-.03,.68-.08,1.02-.12,.91-.1,1.82-.21,2.73-.34,.21-.03,.42-.07,.63-.1,32.89-5.07,61.56-30.82,70.9-62.81v57.83c0,3.26,2.64,5.9,5.9,5.9h50.42c3.26,0,5.9-2.64,5.9-5.9V110.63c0-3.26-2.64-5.9-5.9-5.9h-56.32Zm0,206.92c-12.2,10.16-27.97,13.98-44.84,15.12-.16,.01-.33,.03-.49,.04-1.12,.07-2.24,.1-3.36,.1-42.24,0-77.12-35.89-77.12-79.37,0-10.25,1.96-20.01,5.42-28.98,11.22-29.12,38.77-49.74,71.06-49.74h49.33v142.83Z"></path><path class="cls-2" d="M2133.97,104.73h-49.33c-48.36,0-90.91,25.48-115.75,64.1-14.52,22.58-22.99,49.63-22.99,78.73,0,44.89,20.13,84.92,51.59,111.1,2.93,2.6,6.05,4.98,9.31,7.14,12.86,8.49,28.11,13.47,44.52,13.47,1.23,0,2.46-.03,3.68-.09,.36-.02,.71-.05,1.07-.07,.87-.05,1.75-.11,2.62-.2,.34-.03,.68-.08,1.02-.12,.91-.1,1.82-.21,2.73-.34,.21-.03,.42-.07,.63-.1,32.89-5.07,61.56-30.82,70.9-62.81v57.83c0,3.26,2.64,5.9,5.9,5.9h50.42c3.26,0,5.9-2.64,5.9-5.9V110.63c0-3.26-2.64-5.9-5.9-5.9h-56.32Zm0,206.92c-12.2,10.16-27.97,13.98-44.84,15.12-.16,.01-.33,.03-.49,.04-1.12,.07-2.24,.1-3.36,.1-42.24,0-77.12-35.89-77.12-79.37,0-10.25,1.96-20.01,5.42-28.98,11.22-29.12,38.77-49.74,71.06-49.74h49.33v142.83Z"></path><path class="cls-2" d="M1314.05,104.73h-49.33c-48.36,0-90.91,25.48-115.75,64.1-11.79,18.34-19.6,39.64-22.11,62.59-.58,5.3-.88,10.68-.88,16.14s.31,11.15,.93,16.59c4.28,38.09,23.14,71.61,50.66,94.52,2.93,2.6,6.05,4.98,9.31,7.14,12.86,8.49,28.11,13.47,44.52,13.47h0c17.99,0,34.61-5.93,48.16-15.97,16.29-11.58,28.88-28.54,34.48-47.75v50.26h-.11v11.08c0,21.84-5.71,38.27-17.34,49.36-11.61,11.08-31.04,16.63-58.25,16.63-11.12,0-28.79-.59-46.6-2.41-2.83-.29-5.46,1.5-6.27,4.22l-12.78,43.11c-1.02,3.46,1.27,7.02,4.83,7.53,21.52,3.08,42.52,4.68,54.65,4.68,48.91,0,85.16-10.75,108.89-32.21,21.48-19.41,33.15-48.89,35.2-88.52V110.63c0-3.26-2.64-5.9-5.9-5.9h-56.32Zm0,64.1s.65,139.13,0,143.36c-12.08,9.77-27.11,13.59-43.49,14.7-.16,.01-.33,.03-.49,.04-1.12,.07-2.24,.1-3.36,.1-1.32,0-2.63-.03-3.94-.1-40.41-2.11-74.52-37.26-74.52-79.38,0-10.25,1.96-20.01,5.42-28.98,11.22-29.12,38.77-49.74,71.06-49.74h49.33Z"></path><path class="cls-1" d="M249.83,0C113.3,0,2,110.09,.03,246.16c-2,138.19,110.12,252.7,248.33,253.5,42.68,.25,83.79-10.19,120.3-30.03,3.56-1.93,4.11-6.83,1.08-9.51l-23.38-20.72c-4.75-4.21-11.51-5.4-17.36-2.92-25.48,10.84-53.17,16.38-81.71,16.03-111.68-1.37-201.91-94.29-200.13-205.96,1.76-110.26,92-199.41,202.67-199.41h202.69V407.41l-115-102.18c-3.72-3.31-9.42-2.66-12.42,1.31-18.46,24.44-48.53,39.64-81.93,37.34-46.33-3.2-83.87-40.5-87.34-86.81-4.15-55.24,39.63-101.52,94-101.52,49.18,0,89.68,37.85,93.91,85.95,.38,4.28,2.31,8.27,5.52,11.12l29.95,26.55c3.4,3.01,8.79,1.17,9.63-3.3,2.16-11.55,2.92-23.58,2.07-35.92-4.82-70.34-61.8-126.93-132.17-131.26-80.68-4.97-148.13,58.14-150.27,137.25-2.09,77.1,61.08,143.56,138.19,145.26,32.19,.71,62.03-9.41,86.14-26.95l150.26,133.2c6.44,5.71,16.61,1.14,16.61-7.47V9.48C499.66,4.25,495.42,0,490.18,0H249.83Z"></path></svg>';

// Recent and favourite searches, and Ask AI's stored conversations, kept in localStorage under DocSearch's keys.
function storageSupported(): boolean {
	try {
		window.localStorage.setItem('__TEST_KEY__', '');
		window.localStorage.removeItem('__TEST_KEY__');
		return true;
	} catch {
		return false;
	}
}
function cleanupStorage(): void {
	const keys: { key: string; size: number }[] = [];
	for (const key in window.localStorage) if (key.includes('__DOCSEARCH_')) keys.push({ key, size: window.localStorage[key].length + key.length });
	keys.sort((a, b) => b.size - a.size);
	for (let i = 0; i < Math.ceil(keys.length / 2) && i < keys.length; i++) {
		try {
			window.localStorage.removeItem(keys[i]!.key);
		} catch {
			// as DocSearch: a failing cleanup is ignored
		}
	}
}
function safeSet(key: string, value: unknown): void {
	try {
		window.localStorage.setItem(key, JSON.stringify(value));
	} catch (error) {
		if (error instanceof DOMException && error.name === 'QuotaExceededError') {
			try {
				cleanupStorage();
				window.localStorage.setItem(key, JSON.stringify(value));
			} catch {
				// still full: dropped
			}
		}
	}
}
function manageStorageQuota(): void {
	if (!window.localStorage) return;
	let total = 0;
	for (const key in window.localStorage) if (Object.prototype.hasOwnProperty.call(window.localStorage, key)) total += window.localStorage[key].length + key.length;
	if (total > 4 * 1024 * 1024) cleanupStorage();
}
function createStorage<T>(key: string): { setItem: (items: T[]) => void; getItem: () => T[] } {
	if (!storageSupported()) return { setItem() {}, getItem: () => [] };
	return {
		setItem: (items) => safeSet(key, items),
		getItem() {
			const item = window.localStorage.getItem(key);
			if (item === null) return [];
			try {
				const parsed = JSON.parse(item);
				return Array.isArray(parsed) ? parsed : [];
			} catch {
				window.localStorage.removeItem(key);
				return [];
			}
		},
	};
}
export type Stored<T> = { add: (item: T) => void; remove: (item: T) => void; getAll: () => T[]; addFeedback?: (messageId: string, feedback: 'dislike' | 'like') => void; getOne?: (messageId: string) => { feedback?: 'dislike' | 'like' } | undefined };
function createStoredSearches(key: string, limit: number): Stored<Hit> {
	const storage = createStorage<Hit>(key);
	let items = storage.getItem().slice(0, limit);
	return {
		add(item) {
			const { _highlightResult, _snippetResult, ...hit } = item;
			const at = items.findIndex((x) => x.objectID === hit.objectID);
			if (at > -1) items.splice(at, 1);
			items.unshift(hit as Hit);
			items = items.slice(0, limit);
			storage.setItem(items);
		},
		remove(item) {
			items = items.filter((x) => x.objectID !== item.objectID);
			storage.setItem(items);
		},
		getAll: () => items,
	};
}
type StoredMessage = { id: string; feedback?: 'dislike' | 'like' };
function createStoredConversations(key: string, limit: number): Stored<Hit> {
	const storage = createStorage<Hit>(key);
	let items = storage.getItem().slice(0, limit);
	const messagesOf = (conversation: Hit) => conversation.messages as StoredMessage[] | undefined;
	return {
		add(item) {
			const at = items.findIndex((x) => x.objectID === item.objectID || x.query === item.query);
			if (at > -1) items[at] = item;
			else {
				items.unshift(item);
				items = items.slice(0, limit);
			}
			storage.setItem(items);
		},
		addFeedback(messageId, feedback) {
			const message = items.flatMap((c) => messagesOf(c) ?? []).find((m) => m.id === messageId);
			if (!message) return;
			message.feedback = feedback;
			storage.setItem(items);
		},
		getOne: (messageId) => items.flatMap((c) => messagesOf(c) ?? []).find((m) => m.id === messageId),
		getAll: () => items,
		remove(item) {
			items = items.filter((x) => x.objectID !== item.objectID);
			storage.setItem(items);
		},
	};
}

function groupBy(values: Hit[], predicate: (value: Hit) => string, max?: number): Record<string, Hit[]> {
	return values.reduce<Record<string, Hit[]>>((acc, item) => {
		const key = predicate(item);
		if (!Object.prototype.hasOwnProperty.call(acc, key)) acc[key] = [];
		if (acc[key]!.length < (max || 5)) acc[key]!.push(item);
		return acc;
	}, {});
}
function removeHighlightTags(hit: Hit): string {
	if (!hit.__docsearch_parent && !hit._highlightResult) return hit.hierarchy.lvl0 ?? '';
	const lvl0 = hit.__docsearch_parent ? hit.__docsearch_parent._highlightResult?.hierarchy?.lvl0 : hit._highlightResult?.hierarchy?.lvl0;
	if (!lvl0) return hit.hierarchy.lvl0 ?? '';
	return lvl0.value && /(<mark>|<\/mark>)/.test(lvl0.value) ? lvl0.value.replace(/(<mark>|<\/mark>)/g, '') : lvl0.value;
}
function property(object: Record<string, unknown>, path: string): unknown {
	return path.split('.').reduce<unknown>((prev, key) => ((prev as Record<string, unknown> | null)?.[key] ? (prev as Record<string, unknown>)[key] : null), object);
}
const snippet = (className: string, hit: Hit, attribute: string): string => `<span class="${className}">${String(property(hit, `_snippetResult.${attribute}.value`) || property(hit, attribute) || '')}</span>`;

function meta(name: string): string | undefined {
	return document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') ?? undefined;
}
// Docusaurus's contextual search: the site's language and the default tag plus, per docs plugin, its active,
// preferred or latest version.
function facetFilters(): (string | string[])[] {
	const tags = ['default', ...Object.keys(docsVersions).map((plugin) => `docs-${plugin}-${docsVersionCandidates(plugin)[0]?.name}`)];
	return [`language:${meta('docsearch:language') ?? 'en'}`, tags.map((tag) => `docusaurus_tag:${tag}`)];
}
// theme-search-algolia's useSearchResultUrlProcessor: results from the site's own domain become relative URLs.
function processUrl(url: string): string {
	const parsed = new URL(url);
	return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

// The router follows a link the page clicks, as Docusaurus's history.push does.
function navigate(url: string): void {
	const link = document.createElement('a');
	link.href = url;
	link.hidden = true;
	document.body.append(link);
	link.click();
	link.remove();
}

let askAiModule: Promise<typeof AskAiModule> | undefined;
const loadAskAi = () => (askAiModule ??= import('./docsearch-ask-ai.ts'));

// theme-search-algolia prepends one <div> to the body and portals the modal into it.
let holder: HTMLDivElement | undefined;
let current: Modal | undefined;
let askAiActive = false;

// The holder outlives the pages a visitor moves between, as React's portal container does.
export function keepHolder(): void {
	if (holder && !holder.isConnected) document.body.insertBefore(holder, document.body.firstChild);
}
export function isOpen(): boolean {
	return Boolean(current);
}
export function open(): void {
	if (current) return;
	if (!holder?.isConnected) {
		holder = document.createElement('div');
		document.body.insertBefore(holder, document.body.firstChild);
	}
	current = new Modal(holder);
}
export function close(): void {
	if (!current) return;
	// SearchBar's closeModal: focus back on the button, then the modal unmounts.
	(document.querySelector('.navbarSearchContainer_dDCC button.DocSearch-Button') as HTMLElement | null)?.focus();
	setAskAiActive(false);
	const modal = current;
	current = undefined;
	modal.destroy();
}
function setAskAiActive(active: boolean): void {
	if (askAiActive === active) return;
	askAiActive = active;
	current?.askAiToggled();
}

function isEditingContent(event: KeyboardEvent): boolean {
	const element = event.composedPath()[0] as HTMLElement;
	return element.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(element.tagName);
}
// useDocSearchKeyboardEvents: Escape closes (or leaves Ask AI), Ctrl/Cmd+K opens and closes, "/" opens.
export function onKeyDown(event: KeyboardEvent): void {
	if (current && event.code === 'Escape' && askAiActive) {
		setAskAiActive(false);
		return;
	}
	const isCmdK = event.key?.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey);
	const isSlash = event.key === '/';
	if ((event.code === 'Escape' && current) || isCmdK || (!isEditingContent(event) && isSlash && !current)) {
		event.preventDefault();
		if (current) close();
		else if (!document.body.classList.contains('DocSearch--active')) open();
	}
}

type ItemHandlers = { onClick: (event: MouseEvent) => void; onMouseMove: (event: MouseEvent) => void; onMouseDown: (event: MouseEvent) => void };

class Modal {
	readonly holder: HTMLElement;
	readonly container: HTMLDivElement;
	readonly modal: HTMLDivElement;
	readonly form: HTMLFormElement;
	readonly input: HTMLInputElement;
	readonly actions: HTMLDivElement;
	readonly footer: HTMLElement;
	dropdown: HTMLDivElement | null = null;
	lead: Element | null = null;
	heading: Element | null = null;
	readonly autocomplete: AutocompleteApi<Hit, Event, MouseEvent, KeyboardEvent>;
	state: State = { query: '', collections: [], completion: null, context: {}, isOpen: false, activeItemId: null, status: 'idle' };
	readonly favoriteSearches: Stored<Hit>;
	readonly recentSearches: Stored<Hit>;
	readonly conversations: Stored<Hit>;
	readonly searchClient: ReturnType<typeof liteClient>;
	suggestedQuestions: SuggestedQuestion[] = [];
	askAiState: AskAiState = 'initial';
	chat: AskAiModule.AskAiChat | undefined;
	readonly initialScrollY = window.scrollY;
	readonly initialQuery: string;
	readonly fromSelection: string;
	readonly items = new Map<string, ItemHandlers>();
	readonly cleanups: (() => void)[] = [];
	shown = { lead: '', heading: '', actions: '', screen: '', footer: '' };
	trapped = false;
	menuOpen = false;
	clearShown = false;
	stoppedStream = false;
	previousChatStatus = 'ready';
	destroyed = false;

	constructor(holder: HTMLElement) {
		this.holder = holder;
		this.fromSelection = window.getSelection()?.toString().slice(0, MAX_QUERY_SIZE) ?? '';
		this.initialQuery = this.fromSelection;
		const client = liteClient(APP_ID, API_KEY);
		client.addAlgoliaAgent('docsearch', DOCSEARCH_VERSION);
		if (!/docsearch.js \(.*\)/.test(client.transporter.algoliaAgent.value)) client.addAlgoliaAgent('docsearch-react', DOCSEARCH_VERSION);
		client.addAlgoliaAgent('docusaurus', DOCUSAURUS_VERSION);
		this.searchClient = client;
		this.favoriteSearches = createStoredSearches(`__DOCSEARCH_FAVORITE_SEARCHES__${INDEX_NAME}`, 10);
		this.recentSearches = createStoredSearches(`__DOCSEARCH_RECENT_SEARCHES__${INDEX_NAME}`, this.favoriteSearches.getAll().length === 0 ? RECENT_SEARCHES_LIMIT : RECENT_SEARCHES_WITH_FAVORITES_LIMIT);
		this.conversations = createStoredConversations(`__DOCSEARCH_ASKAI_CONVERSATIONS__${ASK_AI.indexName}`, 10);
		this.autocomplete = this.createAutocomplete();

		holder.insertAdjacentHTML(
			'beforeend',
			`<div role="button" aria-expanded="true" aria-haspopup="listbox" aria-labelledby="docsearch-label" class="DocSearch DocSearch-Container" tabindex="0"><div class="DocSearch-Modal"><header class="DocSearch-SearchBar"><form class="DocSearch-Form"><input class="DocSearch-Input" aria-autocomplete="both" aria-labelledby="docsearch-label" id="docsearch-input" autocomplete="off" autocorrect="off" autocapitalize="off" enterkeyhint="search" spellcheck="false" placeholder="" maxlength="${MAX_QUERY_SIZE}" type="search" value=""><div class="DocSearch-Actions"></div></form></header><footer class="DocSearch-Footer"></footer></div></div>`,
		);
		this.container = holder.lastElementChild as HTMLDivElement;
		this.modal = this.container.firstElementChild as HTMLDivElement;
		this.form = this.modal.querySelector('form')!;
		this.input = this.form.querySelector('input')!;
		this.actions = this.form.querySelector('.DocSearch-Actions')!;
		this.footer = this.modal.querySelector('footer')!;
		this.render();
		this.wire();

		// The modal's effects, in DocSearch's order.
		document.body.classList.add('DocSearch--active');
		manageStorageQuota();
		document.body.style.marginInlineEnd = `${window.innerWidth - document.body.clientWidth}px`;
		const setViewportHeight = () => this.modal.style.setProperty('--docsearch-vh', `${window.innerHeight * 0.01}px`);
		setViewportHeight();
		this.listen(window, 'resize', setViewportHeight);
		void this.loadSuggestedQuestions();
		if (this.initialQuery.length === 0) this.input.focus();
		if (this.initialQuery && this.initialQuery === this.fromSelection) this.input.select();
		if (this.initialQuery.length > 0) {
			void this.autocomplete.refresh();
			this.input.focus();
		}
		// Ask AI's chat is part of DocSearch's modal code: it loads once the modal has shown, so choosing it fetches
		// nothing more.
		const loadChat = () =>
			void loadAskAi().then((module) => {
				if (!this.destroyed) this.chat ??= this.createChat(module);
			});
		if (window.requestIdleCallback) window.requestIdleCallback(loadChat, { timeout: 1000 });
		else setTimeout(loadChat, 200);
	}

	listen<K extends keyof WindowEventMap>(target: Window | Document | Element, type: K | string, listener: (event: never) => void, options?: AddEventListenerOptions): void {
		target.addEventListener(type, listener as EventListener, options);
		this.cleanups.push(() => target.removeEventListener(type, listener as EventListener, options));
	}

	createChat(module: typeof AskAiModule, messages?: unknown[]): AskAiModule.AskAiChat {
		return module.createAskAiChat({
			assistantId: ASK_AI.assistantId,
			apiKey: API_KEY,
			appId: APP_ID,
			indexName: ASK_AI.indexName,
			searchParameters: { facetFilters: facetFilters() },
			conversations: this.conversations,
			messages,
			onChange: () => this.chatChanged(),
		});
	}

	async loadSuggestedQuestions(): Promise<void> {
		if (!ASK_AI.suggestedQuestions || !ASK_AI.assistantId) return;
		const { results } = await this.searchClient.search<SuggestedQuestion>({ requests: [{ indexName: SUGGESTED_QUESTIONS_INDEX, filters: `state:published AND assistantId:${ASK_AI.assistantId}`, hitsPerPage: 3 }] });
		this.suggestedQuestions = (results[0] as { hits: SuggestedQuestion[] }).hits;
		this.render();
	}

	createAutocomplete(): AutocompleteApi<Hit, Event, MouseEvent, KeyboardEvent> {
		const saveRecentSearch = (item: Hit) => this.saveRecentSearch(item);
		const onClose = () => close();
		const onSelect = ({ item, event }: { item: Hit; event: Event }) => {
			saveRecentSearch(item);
			if (!isModifierEvent(event as MouseEvent)) onClose();
		};
		return createAutocomplete<Hit, Event, MouseEvent, KeyboardEvent>({
			id: 'docsearch',
			defaultActiveItemId: 0,
			openOnFocus: true,
			initialState: { query: this.initialQuery, context: { searchSuggestions: [] } },
			insights: false,
			navigator: {
				navigate: ({ itemUrl }) => navigate(itemUrl),
				navigateNewTab: ({ itemUrl }) => window.open(itemUrl, '_blank', 'noopener')?.focus(),
				navigateNewWindow: ({ itemUrl }) => void window.open(itemUrl, '_blank', 'noopener'),
			},
			onStateChange: ({ state }) => {
				this.state = state;
				this.render();
			},
			getSources: ({ query, state, setContext, setStatus }) => {
				if (!query) {
					const stored: AutocompleteSource<Hit>[] = [
						{ sourceId: 'recentSearches', onSelect, getItemUrl: ({ item }) => item.url, getItems: () => this.recentSearches.getAll() },
						{ sourceId: 'favoriteSearches', onSelect, getItemUrl: ({ item }) => item.url, getItems: () => this.favoriteSearches.getAll() },
						{
							sourceId: 'recentConversations',
							getItems: () => this.conversations.getAll(),
							onSelect: ({ item }) => {
								if (item.messages) {
									this.resetChatSession({ kind: 'setMessages', messages: item.messages });
									setAskAiActive(true);
								}
							},
						},
					];
					return stored;
				}
				const askAi: AutocompleteSource<Hit> = {
					sourceId: 'askAI',
					getItems: () => [{ type: 'askAI', query, url_without_anchor: '', objectID: 'ask-ai-button', content: null, url: '', anchor: null, hierarchy: { lvl0: 'Ask AI', lvl1: query, lvl2: null, lvl3: null, lvl4: null, lvl5: null, lvl6: null }, _highlightResult: {}, _snippetResult: {}, __docsearch_parent: null }],
					onSelect: ({ item }) => {
						if (item.type === 'askAI' && item.query) this.selectAskAiQuestion(true, item.query);
					},
				};
				return this.querySources(query, state.context, setContext, setStatus, onSelect).then((sources) => [askAi, ...sources]);
			},
		});
	}

	async querySources(query: string, context: State['context'], setContext: (context: Record<string, unknown>) => void, setStatus: (status: State['status']) => void, onSelect: (params: { item: Hit; event: Event }) => void): Promise<AutocompleteSource<Hit>[]> {
		try {
			const { results } = await this.searchClient.search<Hit>({
				requests: [
					{
						query,
						indexName: INDEX_NAME,
						attributesToRetrieve: ['hierarchy.lvl0', 'hierarchy.lvl1', 'hierarchy.lvl2', 'hierarchy.lvl3', 'hierarchy.lvl4', 'hierarchy.lvl5', 'hierarchy.lvl6', 'content', 'type', 'url'],
						attributesToSnippet: [`hierarchy.lvl1:${SNIPPET_LENGTH}`, `hierarchy.lvl2:${SNIPPET_LENGTH}`, `hierarchy.lvl3:${SNIPPET_LENGTH}`, `hierarchy.lvl4:${SNIPPET_LENGTH}`, `hierarchy.lvl5:${SNIPPET_LENGTH}`, `hierarchy.lvl6:${SNIPPET_LENGTH}`, `content:${SNIPPET_LENGTH}`],
						snippetEllipsisText: '…',
						highlightPreTag: '<mark>',
						highlightPostTag: '</mark>',
						hitsPerPage: 20,
						clickAnalytics: false,
						facetFilters: facetFilters(),
					},
				],
			});
			return results.flatMap((res) => {
				const result = res as { hits: Hit[]; nbHits?: number; index?: string };
				const hits = result.hits.map((item) => ({ ...item, url: processUrl(item.url) }));
				const sources = groupBy(hits, (hit) => removeHighlightTags(hit));
				if ((context.searchSuggestions as string[]).length < Object.keys(sources).length) setContext({ searchSuggestions: { ...((context.searchSuggestions as string[]) ?? []), ...Object.keys(sources) } });
				if (result.nbHits) setContext({ nbHits: ((context.nbHits as number | undefined) ?? 0) + result.nbHits });
				return Object.values(sources).map<AutocompleteSource<Hit>>((items, index) => ({
					sourceId: `hits_${result.index}_${index}`,
					onSelect,
					getItemUrl: ({ item }) => item.url,
					getItems: () =>
						Object.values(groupBy(items, (item) => item.hierarchy.lvl1 ?? ''))
							.map((grouped) =>
								grouped.map((item) => {
									const parent = grouped.find((sibling) => sibling.type === 'lvl1' && sibling.hierarchy.lvl1 === item.hierarchy.lvl1);
									return { ...item, __docsearch_parent: item.type !== 'lvl1' && parent ? parent : null };
								}),
							)
							.flat(),
				}));
			});
		} catch (error) {
			if ((error as Error).name === 'RetryError') setStatus('error');
			throw error;
		}
	}

	saveRecentSearch(item: Hit): void {
		const levels: Level[] = ['lvl6', 'lvl5', 'lvl4', 'lvl3', 'lvl2', 'lvl1', 'lvl0'];
		const search = item.type === 'content' ? item.__docsearch_parent || { ...item, type: levels.find((level) => item.hierarchy[level]) || 'lvl0', content: null } : item;
		if (search && this.favoriteSearches.getAll().findIndex((x) => x.objectID === search.objectID) === -1) this.recentSearches.add(search);
	}

	// Ask AI.
	get chatStatus(): string {
		return this.chat?.status ?? 'ready';
	}
	get askAiStreaming(): boolean {
		return this.chatStatus === 'streaming' || this.chatStatus === 'submitted';
	}
	get threadDepthError(): boolean {
		return Boolean(this.chat?.promptBlocked) && this.askAiState !== 'new-conversation';
	}
	resetChatSession(pending?: AskAiModule.PendingAfterReset): void {
		void loadAskAi().then((module) => {
			if (this.destroyed) return;
			this.chat?.abort();
			this.chat = this.createChat(module, pending?.kind === 'setMessages' ? pending.messages : undefined);
			if (pending?.kind === 'sendUserMessage') this.chat.send(pending.text, pending.body);
			this.render();
		});
	}
	selectAskAiQuestion(toggle: boolean, query: string, suggested?: SuggestedQuestion): void {
		if (toggle && this.askAiState === 'new-conversation') this.askAiState = 'initial';
		setAskAiActive(toggle);
		this.stoppedStream = false;
		void loadAskAi().then((module) => {
			if (this.destroyed) return;
			this.chat ??= this.createChat(module);
			this.chat.resetAbortScope();
			this.chat.clearError();
			this.chat.send(query, suggested ? { suggestedQuestionId: suggested.objectID } : undefined);
		});
		this.dropdown?.scrollTo({ top: 0, behavior: 'smooth' });
		this.autocomplete.setQuery('');
	}
	askAiToggled(): void {
		// Leaving Ask AI refreshes the results and starts a fresh chat; either way its screen starts over.
		if (!askAiActive) {
			void this.autocomplete.refresh();
			this.chat?.clearError();
			this.resetChatSession();
		}
		this.askAiState = 'initial';
		this.render();
	}
	chatChanged(): void {
		const status = this.chatStatus;
		if (this.previousChatStatus === 'streaming' && status === 'ready') {
			const messages = this.chat!.messages as { parts?: { type: string; text?: string }[]; metadata?: { stopped?: boolean } }[];
			if (this.stoppedStream && messages.at(-1)) messages.at(-1)!.metadata = { stopped: true };
			for (const part of messages[0]?.parts ?? []) if (part.type === 'text') this.conversations.add(this.chat!.storedHit(part.text ?? ''));
		}
		const statusChanged = status !== this.previousChatStatus;
		this.previousChatStatus = status;
		this.render();
		// SearchBox: once an answer is no longer on its way, the input takes the focus back.
		if (statusChanged && !this.askAiStreaming) this.input.focus();
	}
	newConversation(): void {
		this.chat?.clearError();
		this.resetChatSession();
		this.askAiState = 'new-conversation';
		this.render();
	}

	// What a click, a key or the pointer does in the modal.
	wire(): void {
		this.listen(this.container, 'mousedown', (event: MouseEvent) => {
			if (event.target === this.container) close();
		});
		this.listen(this.form, 'submit', (event: Event) => event.preventDefault());
		this.listen(this.form, 'reset', (event: Event) => this.autocomplete.getFormProps({ inputElement: this.input }).onReset(event));
		const inputProps = () => this.autocomplete.getInputProps({ inputElement: this.input, autoFocus: this.initialQuery.length === 0, maxLength: MAX_QUERY_SIZE });
		this.listen(this.input, 'input', (event: Event) => {
			if (askAiActive) {
				this.autocomplete.setQuery(this.input.value);
				return;
			}
			inputProps().onChange(event);
		});
		this.listen(this.input, 'compositionend', (event: Event) => inputProps().onCompositionEnd(event));
		this.listen(this.input, 'keydown', (event: KeyboardEvent) => {
			if (askAiActive && ['ArrowUp', 'ArrowDown', 'Enter'].includes(event.key)) {
				if (event.key === 'Enter' && !this.askAiStreaming && this.state.query) this.selectAskAiQuestion(true, this.state.query);
				event.preventDefault();
				event.stopPropagation();
				return;
			}
			inputProps().onKeyDown(event);
		});
		this.listen(this.input, 'focus', (event: Event) => inputProps().onFocus(event));
		this.listen(this.input, 'click', (event: MouseEvent) => inputProps().onClick(event));
		this.listen(this.form, 'click', (event: MouseEvent) => this.formClick(event));
		this.listen(this.container, 'keydown', (event: KeyboardEvent) => this.trapFocus(event));
		const environment = () => this.dropdown && this.autocomplete.getEnvironmentProps({ inputElement: this.input, formElement: this.form.parentElement!, panelElement: this.dropdown });
		this.listen(window, 'touchstart', (event: TouchEvent) => environment()?.onTouchStart(event));
		this.listen(window, 'touchmove', (event: TouchEvent) => environment()?.onTouchMove(event));
		// The Ask AI menu closes on a click anywhere outside it.
		this.listen(window, 'click', (event: MouseEvent) => {
			if (this.menuOpen && !this.actions.querySelector('.DocSearch-Menu')?.contains(event.target as Node)) {
				this.menuOpen = false;
				this.render();
			}
		});
		this.listen(this.modal, 'click', (event: MouseEvent) => this.dropdownClick(event));
		this.listen(this.modal, 'keydown', (event: KeyboardEvent) => this.dropdownKey(event));
		this.listen(this.modal, 'mousemove', (event: MouseEvent) => this.itemFor(event)?.onMouseMove(event));
		this.listen(this.modal, 'mousedown', (event: MouseEvent) => this.itemFor(event)?.onMouseDown(event));
	}

	itemFor(event: Event): ItemHandlers | undefined {
		const li = (event.target as Element | null)?.closest?.('li[role="option"]');
		return li && this.dropdown?.contains(li) ? this.items.get(li.id) : undefined;
	}

	formClick(event: MouseEvent): void {
		const target = event.target as Element;
		if (target.closest('.DocSearch-Close')) return close();
		if (target.closest('.DocSearch-AskAi-Return')) {
			if (this.threadDepthError) return this.newConversation();
			if (this.askAiState === 'conversation-history') {
				setAskAiActive(true);
				this.askAiState = 'initial';
				return this.render();
			}
			return setAskAiActive(false);
		}
		if (target.closest('.DocSearch-StopStreaming')) {
			this.stoppedStream = true;
			void this.chat?.stop();
			return;
		}
		if (target.closest('.DocSearch-Menu-trigger')) {
			this.menuOpen = !this.menuOpen;
			return this.render();
		}
		const menuItem = target.closest('.DocSearch-Menu-item');
		if (menuItem) {
			if (menuItem.previousElementSibling) this.askAiState = 'conversation-history';
			else this.newConversation();
			this.menuOpen = false;
			this.render();
		}
	}

	dropdownClick(event: MouseEvent): void {
		const target = event.target as Element;
		if (!this.dropdown?.contains(target)) return;
		const action = target.closest('button.DocSearch-Hit-action-button');
		if (action) {
			event.preventDefault();
			event.stopPropagation();
			const found = this.itemOf(action);
			if (!found) return;
			const { item, source } = found;
			// Recent searches have a save and a remove button; favourites and conversations a remove button.
			const first = action.closest('.DocSearch-Hit-action')?.previousElementSibling?.classList.contains('DocSearch-Hit-action') !== true;
			if (source === 'recentSearches' && first) {
				this.favoriteSearches.add(item);
				this.recentSearches.remove(item);
			} else if (source === 'recentSearches') this.recentSearches.remove(item);
			else if (source === 'favoriteSearches') this.favoriteSearches.remove(item);
			else if (source === 'recentConversations') this.conversations.remove(item);
			void this.autocomplete.refresh();
			return;
		}
		const prefill = target.closest('button.DocSearch-Prefill');
		if (prefill) {
			this.autocomplete.setQuery(`${prefill.textContent!.toLowerCase()} `);
			void this.autocomplete.refresh();
			this.input.focus();
			return;
		}
		if (target.closest('.DocSearch-HitsFooter a')) return close();
		const suggested = target.closest('button.DocSearch-NewConversationScreen-SuggestedQuestion');
		if (suggested) {
			const question = this.suggestedQuestions[[...suggested.parentElement!.children].indexOf(suggested)];
			if (question) this.selectAskAiQuestion(true, question.question, question);
			return;
		}
		if (this.chat?.click(event, (query) => this.searchFromAnswer(query), () => this.newConversation())) return;
		this.itemFor(event)?.onClick(event);
	}
	dropdownKey(event: KeyboardEvent): void {
		if (this.dropdown?.contains(event.target as Node)) this.chat?.key(event, (query) => this.searchFromAnswer(query));
	}
	// A search query in an answer: back to keyword search with that query.
	searchFromAnswer(query: string): void {
		setAskAiActive(false);
		this.autocomplete.setQuery(query);
	}

	itemOf(element: Element): { item: Hit; source: string } | undefined {
		const id = element.closest('li[role="option"]')?.id;
		for (const collection of this.state.collections) for (const item of collection.items) if (this.itemId(collection, item) === id) return { item, source: collection.source.sourceId };
		return undefined;
	}
	itemId(collection: Collection, item: Hit): string {
		return this.autocomplete.getItemProps({ item, source: collection.source }).id;
	}

	// useTrapFocus: Tab cycles between the first and the last control the modal had once it settled.
	focusables: HTMLElement[] = [];
	trapFocus(event: KeyboardEvent): void {
		if (event.key !== 'Tab' || !this.trapped) return;
		const first = this.focusables[0];
		const last = this.focusables[this.focusables.length - 1];
		if (event.shiftKey) {
			if (document.activeElement === first) {
				event.preventDefault();
				last?.focus();
			}
		} else if (document.activeElement === last) {
			event.preventDefault();
			first?.focus();
		}
	}

	onItemClick(item: Hit, event: MouseEvent): void {
		if (item.type === 'askAI' && item.query) {
			if (item.anchor === 'stored' && 'messages' in item) {
				this.resetChatSession({ kind: 'setMessages', messages: item.messages! });
				setAskAiActive(true);
			} else this.selectAskAiQuestion(true, item.query);
			this.askAiState = 'initial';
			event.preventDefault();
			this.render();
			return;
		}
		this.saveRecentSearch(item);
		if (!isModifierEvent(event)) close();
	}

	render(): void {
		if (this.destroyed) return;
		const state = this.state;
		const root = this.autocomplete.getRootProps({});
		const classes = ['DocSearch', 'DocSearch-Container', state.status === 'stalled' && 'DocSearch-Container--Stalled', state.status === 'error' && 'DocSearch-Container--Errored'].filter(Boolean).join(' ');
		if (this.container.className !== classes) this.container.className = classes;
		setAttr(this.container, 'aria-controls', root['aria-controls']);
		this.renderSearchBox();
		this.renderDropdown();
		const footer = this.footerHtml();
		if (footer !== this.shown.footer) {
			this.footer.innerHTML = footer;
			this.shown.footer = footer;
		}
		if (!this.trapped && this.state.status !== 'idle') {
			this.trapped = true;
			this.focusables = [...this.container.querySelectorAll<HTMLElement>('a[href]:not([disabled]), button:not([disabled]), input:not([disabled])')];
		}
	}

	renderSearchBox(): void {
		const s = t.searchBox;
		const streaming = this.askAiStreaming;
		const threadDepth = this.threadDepthError;
		let placeholder = askAiActive ? s.placeholderTextAskAi : s.placeholderText;
		if (this.askAiState === 'new-conversation') placeholder = 'Ask a question';
		if (threadDepth && askAiActive && !this.chat?.minimalBlocking) placeholder = 'Conversation limit reached';
		let heading: string | null = null;
		if (streaming) heading = s.placeholderTextAskAiStreaming;
		if (this.askAiState === 'conversation-history') heading = 'My conversation history';

		const lead = askAiActive
			? `<button type="button" tabindex="0" class="DocSearch-Action DocSearch-AskAi-Return" title="${attr(s.backToKeywordSearchButtonText)}" aria-label="${attr(s.backToKeywordSearchButtonAriaLabel)}">${icons.back}</button>`
			: this.state.status === 'stalled'
				? `<div class="DocSearch-LoadingIndicator">${icons.loading()}</div>`
				: `<label class="DocSearch-MagnifierLabel" for="docsearch-input" id="docsearch-label">${icons.search()}<span class="DocSearch-VisuallyHiddenForAccessibility">${text(s.searchInputLabel)}</span></label>`;
		if (lead !== this.shown.lead) {
			this.lead?.remove();
			this.input.insertAdjacentHTML('beforebegin', lead);
			this.lead = this.form.firstElementChild;
			this.shown.lead = lead;
		}
		const headingHtml = heading ? `<span class="DocSearch-Modal-heading${streaming ? ' shimmer' : ''}">${text(heading)}</span>` : '';
		if (headingHtml !== this.shown.heading) {
			this.heading?.remove();
			this.heading = null;
			if (headingHtml) {
				this.input.insertAdjacentHTML('beforebegin', headingHtml);
				this.heading = this.input.previousElementSibling;
			}
			this.shown.heading = headingHtml;
		}

		const props = this.autocomplete.getInputProps({ inputElement: this.input, autoFocus: this.initialQuery.length === 0, maxLength: MAX_QUERY_SIZE });
		setAttr(this.input, 'aria-activedescendant', props['aria-activedescendant']);
		setAttr(this.input, 'aria-controls', props['aria-controls']);
		setAttr(this.input, 'enterkeyhint', askAiActive ? 'enter' : 'search');
		setAttr(this.input, 'placeholder', placeholder);
		const value = String(props.value ?? '');
		if (this.input.value !== value) this.input.value = value;
		setAttr(this.input, 'value', value);
		this.input.disabled = streaming || (threadDepth && askAiActive);
		this.input.hidden = Boolean(heading);

		const query = this.state.query;
		if (query) this.clearShown = true;
		const hasConversations = (this.state.collections[2]?.items.length ?? 0) > 0;
		const moreOptions = askAiActive && this.askAiState !== 'conversation-history';
		const actions = [
			// (React leaves the hidden attribute it adds back after its first removal at the end.)
			`<button class="DocSearch-Clear" type="reset" aria-label="${attr(s.clearButtonAriaLabel)}"${query || this.clearShown ? '' : ' hidden=""'} tabindex="${query ? 0 : -1}" aria-hidden="${query ? 'false' : 'true'}"${!query && this.clearShown ? ' hidden=""' : ''}>${text(s.clearButtonTitle)}</button>`,
			query ? '<div class="DocSearch-Divider"></div>' : '',
			streaming ? `<button type="button" class="DocSearch-Action DocSearch-StopStreaming">${icons.stop}</button><div class="DocSearch-Divider"></div>` : '',
			moreOptions
				? `<div class="DocSearch-Menu"><button type="button" class="DocSearch-Menu-trigger DocSearch-Action">${icons.moreVertical}</button><div class="DocSearch-Menu-content${this.menuOpen ? ' open' : ''}"><button type="button" class="DocSearch-Menu-item ">${icons.newConversation}Start a new conversation</button>${hasConversations ? `<button type="button" class="DocSearch-Menu-item ">${icons.conversationHistory}Conversation history</button>` : ''}</div></div><div class="DocSearch-Divider"></div>`
				: '',
			`<button type="button" title="${attr(s.closeButtonText)}" class="DocSearch-Action DocSearch-Close" aria-label="${attr(s.closeButtonAriaLabel)}">${icons.close}</button>`,
		].join('');
		if (actions !== this.shown.actions) {
			const focused = this.actions.contains(document.activeElement) ? (document.activeElement as HTMLElement).className : undefined;
			patchChildren(this.actions, actions);
			this.shown.actions = actions;
			if (focused) (this.actions.querySelector(`[class="${focused}"]`) as HTMLElement | null)?.focus();
		}
	}

	renderDropdown(): void {
		const state = this.state;
		const hasCollections = state.collections.some((collection) => collection.items.length > 0);
		const show = !(state.status === 'idle' && !hasCollections && state.query.length === 0 && !askAiActive);
		if (!show) {
			if (this.dropdown) {
				this.dropdown.remove();
				this.dropdown = null;
				this.shown.screen = '';
				this.items.clear();
			}
			return;
		}
		let created = false;
		if (!this.dropdown) {
			this.modal.querySelector('header')!.insertAdjacentHTML('afterend', '<div class="DocSearch-Dropdown"></div>');
			this.dropdown = this.modal.querySelector('.DocSearch-Dropdown');
			created = true;
		}
		// ScreenState does not update while a search is loading or stalled, so no screen flashes in between.
		if (created || !(state.status === 'loading' || state.status === 'stalled')) {
			this.items.clear();
			const screen = this.screenHtml(hasCollections);
			if (screen !== this.shown.screen) {
				const queryChanged = !created && this.shownQuery !== state.query;
				this.dropdown!.innerHTML = screen;
				this.shown.screen = screen;
				if (queryChanged && !askAiActive) this.dropdown!.scrollTo({ top: 0, behavior: 'smooth' });
			}
			this.shownQuery = state.query;
			this.chat?.mounted(this.dropdown!);
		}
		for (const li of this.dropdown!.querySelectorAll('li[role="option"]')) li.setAttribute('aria-selected', String(this.selectedId === li.id));
	}
	shownQuery = '';
	selectedId: string | undefined;

	screenHtml(hasCollections: boolean): string {
		const state = this.state;
		this.selectedId = undefined;
		if (askAiActive) {
			if (this.askAiState === 'conversation-history') {
				const collection = state.collections[2];
				if (!collection || collection.items.length === 0) queueMicrotask(() => setAskAiActive(true));
				return `<div class="DocSearch-Dropdown-Container DocSearch-Conversation-History">${collection ? this.resultsHtml(collection, '', () => `<div class="DocSearch-Hit-icon">${icons.sparkles()}</div>`, () => `<div class="DocSearch-Hit-action"><button type="button" class="DocSearch-Hit-action-button">${icons.close}</button></div>`) : ''}</div>`;
			}
			if (this.askAiState === 'new-conversation') {
				return `<div class="DocSearch-NewConversationScreen"><h3 class="DocSearch-NewConversationScreen-Title">How can I help you today?</h3><p class="DocSearch-NewConversationScreen-Description">I search through your documentation to help you find setup guides, feature details and troubleshooting tips, fast.</p><div class="DocSearch-NewConversationScreen-SuggestedQuestions">${this.suggestedQuestions.map((q) => `<button type="button" class="DocSearch-NewConversationScreen-SuggestedQuestion">${text(q.question)}</button>`).join('')}</div></div>`;
			}
			return this.chat?.screenHtml(t.askAiScreen) ?? '';
		}
		if (state.status === 'error') return `<div class="DocSearch-ErrorScreen"><div class="DocSearch-Screen-Icon">${icons.error}</div><p class="DocSearch-Title">${text(t.errorScreen.titleText)}</p><p class="DocSearch-Help">${text(t.errorScreen.helpText)}</p></div>`;
		if (!state.query) {
			const st = t.startScreen;
			const [recent, favorite, conversations] = state.collections;
			return `<div class="DocSearch-Dropdown-Container">${[
				recent && this.resultsHtml(recent, st.recentSearchesTitle, () => `<div class="DocSearch-Hit-icon">${icons.recent}</div>`, () => `<div class="DocSearch-Hit-action"><button class="DocSearch-Hit-action-button" title="${attr(st.saveRecentSearchButtonTitle)}" type="submit">${icons.star}</button></div><div class="DocSearch-Hit-action"><button class="DocSearch-Hit-action-button" title="${attr(st.removeRecentSearchButtonTitle)}" type="submit">${icons.close}</button></div>`),
				favorite && this.resultsHtml(favorite, st.favoriteSearchesTitle, () => `<div class="DocSearch-Hit-icon">${icons.star}</div>`, () => `<div class="DocSearch-Hit-action"><button class="DocSearch-Hit-action-button" title="${attr(st.removeFavoriteSearchButtonTitle)}" type="submit">${icons.close}</button></div>`),
				conversations && this.resultsHtml(conversations, st.recentConversationsTitle, () => `<div class="DocSearch-Hit-icon">${icons.sparkles()}</div>`, () => `<div class="DocSearch-Hit-action"><button class="DocSearch-Hit-action-button" title="${attr(st.removeRecentConversationButtonTitle)}" type="submit">${icons.close}</button></div>`),
			].join('')}</div>`;
		}
		const results = state.collections
			.map((collection) => {
				if (collection.items.length === 0) return '';
				return this.resultsHtml(
					collection,
					removeHighlightTags(collection.items[0]!),
					(item, index) => {
						const tree = item.__docsearch_parent ? `<svg class="DocSearch-Hit-Tree" viewBox="0 0 24 54"><g stroke="currentColor" fill="none" fill-rule="evenodd" stroke-linecap="round" stroke-linejoin="round">${item.__docsearch_parent !== collection.items[index + 1]?.__docsearch_parent ? '<path d="M8 6v21M20 27H8.3"></path>' : '<path d="M8 6v42M20 27H8.3"></path>'}</g></svg>` : '';
						return `${tree}<div class="DocSearch-Hit-icon">${sourceIcon(item.type)}</div>`;
					},
					() => `<div class="DocSearch-Hit-action">${icons.select}</div>`,
				);
			})
			.join('');
		const nbHits = state.context.nbHits as number | undefined;
		const footer = `<section class="DocSearch-HitsFooter"><a href="/search?q=${encodeURIComponent(state.query)}">${text(`See all ${nbHits ?? '{count}'} results`)}</a></section>`;
		const noResults = state.collections.length === 1 ? this.noResultsHtml() : '';
		return `<div class="DocSearch-Dropdown-Container">${results}${footer}</div>${noResults}`;
	}

	noResultsHtml(): string {
		const nr = t.noResultsScreen;
		const suggestions = this.state.context.searchSuggestions as string[] | undefined;
		const list =
			suggestions && suggestions.length > 0
				? `<div class="DocSearch-NoResults-Prefill-List"><p class="DocSearch-Help">${text(nr.suggestedQueryText)}:</p><div class="DocSearch-NoResults-Prefill-List-Items">${suggestions
						.slice(0, 3)
						.map((search) => `<p>${icons.search(16)}<button class="DocSearch-Prefill" type="button">${text(search)}</button></p>`)
						.join('')}</div></div>`
				: '';
		return `<div class="DocSearch-NoResults DocSearch-NoResults--withAskAi"><div class="DocSearch-Screen-Icon">${icons.noResults}</div><p class="DocSearch-Title">${text(nr.noResultsText)} "<strong>${text(this.state.query)}</strong>"</p>${list}</div>`;
	}

	resultsHtml(collection: Collection, title: string, renderIcon: (item: Hit, index: number) => string, renderAction: (item: Hit) => string): string {
		if (!collection || collection.items.length === 0) return '';
		const list = this.autocomplete.getListProps({ source: collection.source });
		const listOpen = `<ul role="listbox" aria-labelledby="${attr(list['aria-labelledby'])}" id="${attr(list.id)}">`;
		if (collection.source.sourceId === 'askAI') {
			const item = collection.items[0]!;
			const placeholder = this.state.collections.length === 1 ? "Didn't find it in the docs? Ask AI to help: " : t.resultsScreen.askAiPlaceholder;
			return `<section class="DocSearch-AskAi-Section">${listOpen}<li class="DocSearch-Hit"${this.itemAttrs(collection, item)}><div class="DocSearch-Hit--AskAI"><div class="DocSearch-Hit-AskAIButton DocSearch-Hit-Container"><div class=" DocSearch-Hit-AskAIButton-icon DocSearch-Hit-icon">${icons.sparkles()}</div><div class="DocSearch-Hit-AskAIButton-title"><span class="DocSearch-Hit-AskAIButton-title-highlight">${text(placeholder)}</span><mark class="DocSearch-Hit-AskAIButton-title-query">${text(String(item.query || ''))}</mark></div></div></div></li></ul></section>`;
		}
		const decoded = title.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'");
		const items = collection.items
			.map((item, index) => {
				let content = '';
				if (item.hierarchy[item.type as Level] && item.type === 'lvl1') content = `<div class="DocSearch-Hit-content-wrapper">${snippet('DocSearch-Hit-title', item, 'hierarchy.lvl1')}${item.content ? snippet('DocSearch-Hit-path', item, 'content') : ''}</div>`;
				else if (item.type === 'askAI') content = `<div class="DocSearch-Hit-content-wrapper"><span class="DocSearch-Hit-title">${text(sanitizeUserInput(item.hierarchy.lvl1 || ''))}</span></div>`;
				else if (item.hierarchy[item.type as Level] && ['lvl2', 'lvl3', 'lvl4', 'lvl5', 'lvl6'].includes(item.type)) content = `<div class="DocSearch-Hit-content-wrapper">${snippet('DocSearch-Hit-title', item, `hierarchy.${item.type}`)}${snippet('DocSearch-Hit-path', item, 'hierarchy.lvl1')}</div>`;
				else if (item.type === 'content') content = `<div class="DocSearch-Hit-content-wrapper">${snippet('DocSearch-Hit-title', item, 'content')}${snippet('DocSearch-Hit-path', item, 'hierarchy.lvl1')}</div>`;
				return `<li class="${['DocSearch-Hit', item.__docsearch_parent && 'DocSearch-Hit--Child'].filter(Boolean).join(' ')}"${this.itemAttrs(collection, item)}><a href="${attr(item.url)}"><div class="DocSearch-Hit-Container">${renderIcon(item, index)}${content}${renderAction(item)}</div></a></li>`;
			})
			.join('');
		return `<section class="DocSearch-Hits"><div class="DocSearch-Hit-source">${text(decoded)}</div>${listOpen}${items}</ul></section>`;
	}

	itemAttrs(collection: Collection, item: Hit): string {
		const props = this.autocomplete.getItemProps({ item, source: collection.source, onClick: (event: MouseEvent) => this.onItemClick(item, event) });
		this.items.set(props.id, { onClick: props.onClick, onMouseMove: props.onMouseMove, onMouseDown: props.onMouseDown });
		if (props['aria-selected']) this.selectedId = props.id;
		return ` id="${attr(props.id)}" role="option" aria-selected="false"`;
	}

	footerHtml(): string {
		const f = t.footer;
		const command = (label: string, paths: string) => `<svg width="20" height="20" aria-label="${attr(label)}" viewBox="0 0 24 24" role="img"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.4">${paths}</g></svg>`;
		return `<div class="DocSearch-Logo"><a href="https://www.algolia.com/ref/docsearch/?utm_source=${attr(window.location.hostname)}&amp;utm_medium=referral&amp;utm_content=powered_by&amp;utm_campaign=docsearch" target="_blank" rel="noopener noreferrer">${ALGOLIA_LOGO.replace('{poweredBy}', text(f.poweredByText))}</a></div><ul class="DocSearch-Commands"><li><kbd class="DocSearch-Commands-Key">${command(f.navigateDownKeyAriaLabel, '<path d="M12 5v14"></path><path d="m19 12-7 7-7-7"></path>')}</kbd><kbd class="DocSearch-Commands-Key">${command(f.navigateUpKeyAriaLabel, '<path d="m5 12 7-7 7 7"></path><path d="M12 19V5"></path>')}</kbd><span class="DocSearch-Label">${text(f.navigateText)}</span></li><li><kbd class="DocSearch-Commands-Key">${command(f.selectKeyAriaLabel, '<polyline points="9 10 4 15 9 20"></polyline><path d="M20 4v7a4 4 0 0 1-4 4H4"></path>')}</kbd><span class="DocSearch-Label">${text(askAiActive ? f.submitQuestionText : f.selectText)}</span></li><li><kbd class="DocSearch-Commands-Key"><span class="DocSearch-Escape-Key">ESC</span></kbd><span class="DocSearch-Label" aria-label="${attr(f.closeKeyAriaLabel)}">${text(askAiActive ? f.backToSearchText : f.closeText)}</span></li></ul>`;
	}

	destroy(): void {
		this.destroyed = true;
		this.chat?.abort();
		for (const cleanup of this.cleanups) cleanup();
		this.container.remove();
		document.body.classList.remove('DocSearch--active');
		window.scrollTo?.(0, this.initialScrollY);
		document.body.style.marginInlineEnd = '0px';
	}
}

function setAttr(el: Element, name: string, value: string | undefined | null): void {
	if (value === undefined || value === null) {
		if (el.hasAttribute(name)) el.removeAttribute(name);
	} else if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}

// Brings parent's children to html's, keeping every element whose tag and class stay as React keeps it, so a kept
// button's fade-in does not run again.
function patchChildren(parent: Element, html: string): void {
	const template = document.createElement('template');
	template.innerHTML = html;
	patchNodes(parent, template.content);
}
function patchNodes(parent: Element, source: ParentNode): void {
	let old = parent.firstElementChild;
	for (const wanted of [...source.children]) {
		let match = old;
		while (match && !(match.tagName === wanted.tagName && match.className === wanted.className)) match = match.nextElementSibling;
		if (!match) {
			parent.insertBefore(wanted, old);
			continue;
		}
		while (old !== match) {
			const next = old!.nextElementSibling;
			old!.remove();
			old = next;
		}
		for (const { name } of [...match.attributes]) if (!wanted.hasAttribute(name)) match.removeAttribute(name);
		for (const { name, value } of [...wanted.attributes]) setAttr(match, name, value);
		if (match.innerHTML !== wanted.innerHTML) {
			if (match.children.length > 0 && ownText(match) === ownText(wanted)) patchNodes(match, wanted);
			else match.innerHTML = wanted.innerHTML;
		}
		old = match.nextElementSibling;
	}
	while (old) {
		const next = old.nextElementSibling;
		old.remove();
		old = next;
	}
}
const ownText = (el: Element): string => [...el.childNodes].map((node) => (node.nodeType === Node.ELEMENT_NODE ? '<>' : (node.textContent ?? ''))).join('');
