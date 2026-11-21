// A recording's files are written whole or not at all: to a temporary name beside them, then renamed over.
import { randomUUID } from 'node:crypto';
import { rename, rm, writeFile } from 'node:fs/promises';

export async function writeRecording(file: string, text: string): Promise<void> {
	const temp = `${file}.${randomUUID().slice(0, 8)}.tmp`;
	try {
		await writeFile(temp, text);
		await rename(temp, file);
	} finally {
		await rm(temp, { force: true });
	}
}
