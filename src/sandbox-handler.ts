import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {createSandbox, fromMcpClients, type ExecuteResult} from 'tool-sandbox';
import type {Config} from './types.js';

export const executeSandbox = async (
	code: string,
	upstreamToken: string,
	config: Config,
): Promise<ExecuteResult> => {
	const selfPrefix = config.selfPrefix ?? 'tool-sandbox';
	const upstreamUrl = new URL('/mcp', config.upstream);

	// Connect to upstream as MCP client, forwarding the user's token
	const client = new Client({name: 'tool-sandbox-mcp', version: '1.0.0'});
	const transport = new StreamableHTTPClientTransport(upstreamUrl, {
		requestInit: {
			headers: {Authorization: `Bearer ${upstreamToken}`},
		},
	});
	await client.connect(transport as Parameters<Client['connect']>[0]);

	try {
		// Convert upstream MCP tools to sandbox tools, filtering out self
		const allTools = await fromMcpClients({upstream: client});
		const filteredTools = allTools.filter((t) => !t.name.startsWith(`upstream__${selfPrefix}__`));

		// Strip the "upstream__" prefix since there's only one upstream
		for (const tool of filteredTools) {
			tool.name = tool.name.replace(/^upstream__/, '');
		}

		const sandbox = await createSandbox({tools: filteredTools});
		const result = await sandbox.execute.handler({code});
		return result;
	} finally {
		await client.close();
	}
};
