/* eslint-disable @typescript-eslint/no-deprecated -- Using low-level Server to avoid JSON Schema → Zod conversion */
import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import type {Transport} from '@modelcontextprotocol/sdk/shared/transport.js';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
	ListToolsRequestSchema,
	CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import type {Config} from './types.js';
import {executeSandbox} from './sandbox-handler.js';

const getString = (value: unknown): string | undefined =>
	typeof value === 'string' ? value : undefined;

export const createApp = (config: Config): express.Express => {
	const app = express();
	const baseUrl = config.issuerUrl ?? `http://localhost:${config.port ?? 3000}`;

	// OAuth protected resource metadata — points clients to the upstream's auth server.
	// The client authenticates with the upstream directly; we just forward the token.
	app.get('/.well-known/oauth-protected-resource', (_req, res) => {
		res.json({
			resource: `${baseUrl}/mcp`,
			authorization_servers: [config.upstream],
		});
	});

	// Protected MCP endpoint
	app.all('/mcp', async (req, res) => {
		// Extract bearer token — we don't validate it, the upstream does
		const authHeader = getString(req.headers.authorization);
		if (!authHeader?.startsWith('Bearer ')) {
			const resourceMetadataUrl = `${baseUrl}/.well-known/oauth-protected-resource`;
			res.status(401)
				.header('WWW-Authenticate', `Bearer resource_metadata="${resourceMetadataUrl}"`)
				.json({error: 'unauthorized'});
			return;
		}

		const upstreamToken = authHeader.slice(7);

		const transport = new StreamableHTTPServerTransport({
			enableJsonResponse: true,
		});

		const server = createMcpServer(upstreamToken, config);
		await server.connect(transport as unknown as Transport);
		await transport.handleRequest(req, res);
	});

	return app;
};

const createMcpServer = (upstreamToken: string, config: Config): Server => {
	const server = new Server(
		{name: 'tool-sandbox-mcp', version: '1.0.0'},
		{capabilities: {tools: {}}},
	);

	server.setRequestHandler(ListToolsRequestSchema, async () => ({
		tools: [{
			name: 'execute_code',
			description: 'Execute JavaScript code in a sandboxed environment with access to all upstream MCP tools. '
				+ 'Use `await tool(name, args)` to call tools, `await tool(\'list_tools\', {})` to list available tools, '
				+ 'and `await tool(\'describe_tool\', {name})` to get tool details. '
				+ 'Use `return value` to return a result. `console.log()` output is captured.',
			inputSchema: {
				type: 'object' as const,
				properties: {
					code: {type: 'string', description: 'JavaScript code to execute'},
				},
				required: ['code'],
			},
		}],
	}));

	server.setRequestHandler(CallToolRequestSchema, async (request) => {
		if (request.params.name !== 'execute_code') {
			return {
				content: [{type: 'text' as const, text: `Unknown tool: ${request.params.name}`}],
				isError: true,
			};
		}

		const code = getString(request.params.arguments?.code);
		if (!code) {
			return {
				content: [{type: 'text' as const, text: 'Missing required parameter: code'}],
				isError: true,
			};
		}

		try {
			const result = await executeSandbox(code, upstreamToken, config);

			if (!result.success) {
				return {
					content: [{type: 'text' as const, text: `Execution error: ${result.error ?? 'Unknown error'}`}],
					isError: true,
				};
			}

			const text = result.result !== undefined
				? (typeof result.result === 'string' ? result.result : JSON.stringify(result.result, null, 2))
				: '(no return value)';

			return {
				content: [{type: 'text' as const, text}],
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return {
				content: [{type: 'text' as const, text: `Error: ${message}`}],
				isError: true,
			};
		}
	});

	return server;
};
