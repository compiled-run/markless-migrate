// A seeded Postgres inside the serverless function, for the demo deployments: PGlite behind the Postgres wire
// protocol on loopback, with TLS in front because the Next Learn app connects with `ssl: 'require'`.
// Each function instance starts from the seed, so writes last only as long as that instance.
import net from 'node:net';
import tls from 'node:tls';
import { PGlite } from '@electric-sql/pglite';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

// A throwaway self-signed certificate, inline so bundlers keep it: the TLS connection never leaves 127.0.0.1.
const KEY = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCrDgWANV/HGZLS
lshikhdM7iS/p6vN7uwaOwBoJnOMwONmBFLzCBnB6z+XBMS9zu5NSSY1k0QhzzuQ
5vTafcANhRLAp5nTX2qGqjS5hFJBFD6lPnV0lFvzi5JynYPmCcW4i8Ltz0+URcZz
0/j020ZGCIiKuxVrfv7+Tt4Y3rBK6EPcL/bts9oKEQfbBZUb9ecMGcugnq62DBKj
GvRdeGyyDQir0kwzLHx1YvMHnB8/BiBFDCP0dRn939XO72DMR3U7UiBVxnMkRsuZ
mZF39PUxVemcpnkLZ/iV9Q6IJmGOKQdCCSu2tPAnqnGHYQoI3cHmbF58gdl0HTOv
LyPVEfJXAgMBAAECggEAEqFqU/Z8QhE0/p7RoHrM8uIVOpKmkb1uFcVLXAykFTaF
Df12k2XUeFyJBofMbef16JEJCljJ2OzbTgL5tDpyCobt7fHTPURtM9GiAHq7Ar+T
uye8X0Axa6tN/hHN5eY2lM0UJBaqUjnvTXpO6UxgsQwI4yNRR+4DE+u/IPJQPTg1
YKCjYkjd5IQuSicpLwNBRuuT2SFoz1qKpe6eQxKPkU14S8H/QVtFImiSJdVGlkxp
qAc8LhFWf613vWj4x86oFL9uZIoTpYM8AmOoUCbonS7nITyr5Qb8g7Ck2repoYBc
uJwDVbAFm+fENhljKgwnbxVlrl3a8bhR0ntW8E9cQQKBgQDX7gvuP4xk+kwSv67e
4xSYBGI4oYoaTSkbkxKHswtP3MEBFQWx5wcKn8Jkhlxlix70zfV7wTEPUj4oQKWq
qhrwA8GkjRPVhfHtQJJkPyBI1Vuroh/r6KsbM5Ziod5Gj2ob2eq+0rdF1hJJrKpv
9VuNA2ly2Prx/Hx7IlgwfkNrhwKBgQDKzCQIk1GOQrG0ifbVj7pZfwsJ+BPdVJxP
6udZvYxdCQxG9Ak/uijMXiM5/m+yZtSX+ZpX9fR5Yhxa5I1YSMi/6ZzaCWFXH7LZ
suqIG/O0UWEEqY0JvUgbVWrGLNgf1LaE8XP/8gBF1E58bWm8Kuqpi4tSOCpmFXUg
UB2NbNEWsQKBgD1/PYSgMrL7mjjowLwX/mCBNxwb3cI54ZBJ5cgiFQGsxIczXojZ
XGcJMwsAPUZqRenA0r5pOji72poKN2SQx9U9rKPZziFM4acJcef9FovHwDD0npTI
khrQKW9z3GNKKxU9jh7E0o+gNVsoQu5Z+bYCl8CuzWGn4CgNkwJUo4z3AoGBAKs4
4q+O2ov3SZy543r6qAbKGeLn3rW/q15aYczGGg2vBvudLXXt0maCkNF1Po9s/M/3
wVXE5w3ZRUGEuMYyZbSLJJB+3P23WMUvp48VspSrJPPPx7HSa2AQpV7/G9b8PMJQ
LnWJuKs8jqvFoUFrJsfRducLXtjkAwkuO1Vd68dxAoGBAKVUaA5EnAJPnpqNei59
cAO6q2TGWUcwcppgIacY2B0KcQ9qxydYPlMZqnMS0zQKe56A7rWIlJdsidw7GycB
FIe8ZrvvHQJsc6OUcsa4y0qSXMu651na70xmvojLfv7m5ShPkshntqPsfsClQ4U1
rHI7V0NZhRXgBfIkqcdnZQTH
-----END PRIVATE KEY-----`;
const CERT = `-----BEGIN CERTIFICATE-----
MIICpDCCAYwCCQCmjaWc2TnJbDANBgkqhkiG9w0BAQsFADAUMRIwEAYDVQQDDAkx
MjcuMC4wLjEwHhcNMjYxMDE3MTMyMzM2WhcNMzYxMDE0MTMyMzM2WjAUMRIwEAYD
VQQDDAkxMjcuMC4wLjEwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQCr
DgWANV/HGZLSlshikhdM7iS/p6vN7uwaOwBoJnOMwONmBFLzCBnB6z+XBMS9zu5N
SSY1k0QhzzuQ5vTafcANhRLAp5nTX2qGqjS5hFJBFD6lPnV0lFvzi5JynYPmCcW4
i8Ltz0+URcZz0/j020ZGCIiKuxVrfv7+Tt4Y3rBK6EPcL/bts9oKEQfbBZUb9ecM
Gcugnq62DBKjGvRdeGyyDQir0kwzLHx1YvMHnB8/BiBFDCP0dRn939XO72DMR3U7
UiBVxnMkRsuZmZF39PUxVemcpnkLZ/iV9Q6IJmGOKQdCCSu2tPAnqnGHYQoI3cHm
bF58gdl0HTOvLyPVEfJXAgMBAAEwDQYJKoZIhvcNAQELBQADggEBAItAoWC+Vvtd
4TG2OHXlhhOjccpsYvMjT6TD42yGcQayA8kcT3GRsKq02qJPD/731FCXrkz3bleX
pQJfIlfeQeG+0X5GGm3c/V1CS5IRNeuFzE8a9N0Hp+7eSIe2VcTbRaZ6Zys22TNJ
nt4SnsVaU/Xsys8uDYkr88eRe7P9+oLg9Ew2w7WESt0CELuRUO70mRCOz4hzdDjz
4eJ9/VVZt8cdBXG3+jXuFfxTFFq+6D3AfxLrSsohYnouVqHz3KnZKyY2HLuhMfxJ
B49Pdt6VhwKlPQY+PR0JQW/AEIaNTPk95EF3c7bvCQT0dmv9ExsT2DPzSlAuTNiK
bJB96mkJz+E=
-----END CERTIFICATE-----`;
const credentials = () => ({ key: KEY, cert: CERT });
const SSL_REQUEST = 80877103;

let started;

/** Starts once per process; resolves to a connection string on 127.0.0.1. */
export function startEmbeddedPostgres({ seedSql, port = 54329 }) {
	started ??= start(seedSql, port);
	return started;
}

async function start(seedSql, port) {
	const db = await PGlite.create({ extensions: { uuid_ossp } });
	await db.exec(seedSql);
	const inner = new PGLiteSocketServer({ db, host: '127.0.0.1', port: port + 1, maxConnections: 32 });
	await inner.start();
	const { key, cert } = credentials();
	const front = net.createServer((socket) => {
		socket.once('data', (first) => {
			const upstream = net.connect(port + 1, '127.0.0.1');
			const close = () => {
				socket.destroy();
				upstream.destroy();
			};
			upstream.on('error', close);
			socket.on('error', close);
			if (first.length >= 8 && first.readUInt32BE(4) === SSL_REQUEST) {
				socket.write('S');
				const secure = new tls.TLSSocket(socket, { isServer: true, key, cert });
				secure.on('error', close);
				secure.pipe(upstream).pipe(secure);
				if (first.length > 8) secure.unshift(first.subarray(8));
			} else {
				upstream.write(first);
				socket.pipe(upstream).pipe(socket);
			}
		});
	});
	await new Promise((resolve, reject) => {
		front.once('error', reject);
		front.listen(port, '127.0.0.1', resolve);
	});
	return `postgres://postgres:postgres@127.0.0.1:${port}/postgres`;
}
