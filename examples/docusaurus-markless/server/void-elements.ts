// Fixes two Markless 0.4.0 serializer defects in HTML responses:
// - <br /> is written <br></br>; an HTML parser reads </br> as a second <br>, doubling line breaks and shifting the
//   element order the runtime resumes by;
// - text inside a <script> is entity-escaped (&quot;, &amp;, &gt;), which breaks JSON-LD and inline code.
const SCRIPT = /(<script\b[^>]*>)([\s\S]*?)(<\/script>)/g;
const ENTITIES: Record<string, string> = { '&quot;': '"', '&#39;': "'", '&lt;': '<', '&gt;': '>', '&amp;': '&' };

export function repairHtml(html: string): string {
	return html.split('</br>').join('').replace(SCRIPT, (whole, open: string, body: string, close: string) => {
		if (/type="(?:markless\/|@markless\/)/.test(open) || !/&(?:quot|#39|lt|gt|amp);/.test(body)) return whole;
		return open + body.replace(/&(?:quot|#39|lt|gt|amp);/g, (entity) => ENTITIES[entity]!) + close;
	});
}

export default (nitroApp: { fetch: (request: Request) => Promise<Response> | Response }) => {
	const fetch = nitroApp.fetch;
	nitroApp.fetch = async (request) => {
		const response = await fetch(request);
		if (!response.body || !response.headers.get('content-type')?.includes('text/html')) return response;
		const headers = new Headers(response.headers);
		headers.delete('content-length');
		return new Response(repairHtml(await response.text()), { status: response.status, statusText: response.statusText, headers });
	};
};
