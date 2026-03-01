import {test, expect} from 'vitest';
import os from 'node:os';
import {loadConfig} from './config';

test('loadConfig throws with no config', () => {
	// Run from a temp directory so no config file is found
	const original = process.cwd();
	process.chdir(os.tmpdir());
	try {
		expect(() => loadConfig()).toThrow('No config found');
	} finally {
		process.chdir(original);
	}
});

test('loadConfig parses JSON string', () => {
	const config = loadConfig('{"upstream":"https://example.com"}');
	expect(config.upstream).toBe('https://example.com');
});
