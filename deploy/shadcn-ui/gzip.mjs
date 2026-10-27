// The compression `next start` gives the old side, for a server in front of the port, so a slow-network check compares the two over the same encoding.
import { createGzip } from 'node:zlib';

const COMPRESSIBLE = /^(text\/|application\/(javascript|json|xml|manifest\+json|ld\+json)|image\/svg\+xml)/;

/** Whether `next start`'s compression middleware would gzip this response: a type it compresses, at least 1 kB or of unknown length, to a browser that accepts gzip. */
export function gzips(req, headers, length) {
	const type = String(headers['content-type'] ?? '');
	return /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? '')) && COMPRESSIBLE.test(type) && !headers['content-encoding'] && (length === undefined || length >= 1024) && req.method !== 'HEAD';
}

/** Writes the response, gzipped when `gzips` says so. */
export function send(req, res, status, headers, stream, length) {
	if (!gzips(req, headers, length)) {
		res.writeHead(status, headers);
		return void (stream ? stream.pipe(res) : res.end());
	}
	const { 'content-length': _, ...rest } = headers;
	res.writeHead(status, { ...rest, 'content-encoding': 'gzip', vary: 'accept-encoding' });
	if (stream) stream.pipe(createGzip()).pipe(res);
	else res.end();
}
