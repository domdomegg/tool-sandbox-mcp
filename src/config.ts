import fs from 'node:fs';
import type {Config} from './types.js';

const DEFAULT_CONFIG_PATH = 'tool-sandbox-mcp.config.json';

export const loadConfig = (input?: string): Config => {
	const raw = input ?? process.env.TOOL_SANDBOX_MCP_CONFIG;

	if (!raw) {
		if (fs.existsSync(DEFAULT_CONFIG_PATH)) {
			return JSON.parse(fs.readFileSync(DEFAULT_CONFIG_PATH, 'utf8')) as Config;
		}

		throw new Error('No config found. Set TOOL_SANDBOX_MCP_CONFIG or create tool-sandbox-mcp.config.json');
	}

	if (!raw.startsWith('{') && fs.existsSync(raw)) {
		return JSON.parse(fs.readFileSync(raw, 'utf8')) as Config;
	}

	return JSON.parse(raw) as Config;
};
