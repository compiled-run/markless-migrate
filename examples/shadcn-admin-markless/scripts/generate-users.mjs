// The users list the old app builds at load (features/users/data/users.ts: faker seeded 67890), generated once with
// the old app's own @faker-js/faker so the rows are the same people; the new app ships the JSON, not faker.
// Usage: node scripts/generate-users.mjs <old app>
import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const old = resolve(process.argv[2]);
const { faker } = createRequire(join(old, 'package.json'))('@faker-js/faker');
faker.seed(67890);
const users = Array.from({ length: 500 }, () => {
	const firstName = faker.person.firstName();
	const lastName = faker.person.lastName();
	return {
		id: faker.string.uuid(),
		firstName,
		lastName,
		username: faker.internet.username({ firstName, lastName }).toLocaleLowerCase(),
		email: faker.internet.email({ firstName }).toLocaleLowerCase(),
		phoneNumber: faker.phone.number({ style: 'international' }),
		status: faker.helpers.arrayElement(['active', 'inactive', 'invited', 'suspended']),
		role: faker.helpers.arrayElement(['superadmin', 'admin', 'cashier', 'manager']),
		// createdAt and updatedAt (faker.date.past/recent) are drawn here too, so the stream stays aligned, but no page shows them.
		createdAt: (faker.date.past(), undefined),
		updatedAt: (faker.date.recent(), undefined),
	};
});
await writeFile(join(import.meta.dirname, '../lib/users.json'), `${JSON.stringify(users.map(({ createdAt: _a, updatedAt: _b, ...u }) => u))}\n`);
process.stdout.write(`${users.length} users -> lib/users.json\n`);
