// The tasks list the old app builds at load (features/tasks/data/tasks.ts: faker seeded 12345), generated once with
// the old app's own @faker-js/faker so the rows are the same; the new app ships the JSON, not faker.
// Usage: node scripts/generate-tasks.mjs <old app>
import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const old = resolve(process.argv[2]);
const { faker } = createRequire(join(old, 'package.json'))('@faker-js/faker');
faker.seed(12345);
const tasks = Array.from({ length: 100 }, () => {
	const task = {
		id: `TASK-${faker.number.int({ min: 1000, max: 9999 })}`,
		title: faker.lorem.sentence({ min: 5, max: 15 }),
		status: faker.helpers.arrayElement(['todo', 'in progress', 'done', 'canceled', 'backlog']),
		label: faker.helpers.arrayElement(['bug', 'feature', 'documentation']),
		priority: faker.helpers.arrayElement(['low', 'medium', 'high']),
	};
	// The rest of the old record is drawn too, so the stream stays aligned; the table shows none of it.
	faker.date.past();
	faker.date.recent();
	faker.person.fullName();
	faker.lorem.paragraph({ min: 1, max: 3 });
	faker.date.future();
	return task;
});
await writeFile(join(import.meta.dirname, '../lib/tasks.json'), `${JSON.stringify(tasks)}\n`);
process.stdout.write(`${tasks.length} tasks -> lib/tasks.json\n`);
