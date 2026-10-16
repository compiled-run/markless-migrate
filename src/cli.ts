#!/usr/bin/env node
const COMMANDS = ['plan', 'check', 'switch'] as const;

const [command] = process.argv.slice(2);
if (!COMMANDS.includes(command as (typeof COMMANDS)[number])) {
	process.stdout.write(`markless-migrate <${COMMANDS.join('|')}>\n\nNot implemented yet. See docs/plan.md.\n`);
	process.exitCode = command ? 1 : 0;
} else {
	process.stderr.write(`markless-migrate ${command}: not implemented yet.\n`);
	process.exitCode = 1;
}
