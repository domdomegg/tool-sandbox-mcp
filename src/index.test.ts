import {test, expect} from 'vitest';
import {loadConfig} from './config';

test('loadConfig throws with no config', () => {
	expect(() => loadConfig()).toThrow('No config found');
});

test('loadConfig parses JSON string', () => {
	const config = loadConfig('{"upstream":"https://example.com"}');
	expect(config.upstream).toBe('https://example.com');
});
