#!/usr/bin/env node
import {loadConfig} from './config.js';
import {createApp} from './server.js';

const main = () => {
	const config = loadConfig();
	const app = createApp(config);

	const port = config.port ?? 3000;
	const host = config.host ?? '0.0.0.0';
	app.listen(port, host, () => {
		console.log(`tool-sandbox-mcp listening on ${host}:${port}`);
		console.log(`Upstream: ${config.upstream}`);
		console.log(`Self-exclusion prefix: ${config.selfPrefix ?? 'tool-sandbox'}`);
	});
};

main();
