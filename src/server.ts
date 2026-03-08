import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type {Transport} from '@modelcontextprotocol/sdk/shared/transport.js';
import {z} from 'zod';
import express from 'express';
import type {Config} from './types.js';
import {executeSandbox} from './sandbox-handler.js';

const getString = (value: unknown): string | undefined =>
	typeof value === 'string' ? value : undefined;

export const createApp = (config: Config): express.Express => {
	const app = express();
	app.use(express.json({limit: '20mb'}));
	const baseUrl = config.issuerUrl ?? `http://localhost:${config.port ?? 3000}`;

	// OAuth protected resource metadata — points clients to the upstream's auth server.
	// The client authenticates with the upstream directly; we just forward the token.
	// RFC 9728: serve at both the root and the path-aware URL
	const protectedResourceMetadata = (_req: express.Request, res: express.Response) => {
		res.json({
			resource: `${baseUrl}/mcp`,
			authorization_servers: [config.upstream],
		});
	};

	app.get('/.well-known/oauth-protected-resource', protectedResourceMetadata);
	app.get('/.well-known/oauth-protected-resource/mcp', protectedResourceMetadata);

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
		await transport.handleRequest(req, res, req.body);
	});

	return app;
};

const storeDescription = '\n'
	+ 'Returns a store_id in the result. Pass it back in subsequent calls to resume the same store. Omit store_id to start fresh. Sessions expire after 5 minutes of inactivity.\n';

const buildDescription = (storeEnabled: boolean): string => 'Run JavaScript in a sandboxed environment.\n'
	+ `\n${
		storeEnabled
			? 'Available: tool(name, args), store (persistent across calls with same store_id), store._prev (last result), atob/btoa, and standard JS built-ins (JSON, Math, Date, Promise, etc.). No logs are captured — use return to pass data back.\n'
			: 'Available: tool(name, args), store._prev (last result), atob/btoa, and standard JS built-ins (JSON, Math, Date, Promise, etc.). No logs are captured — use return to pass data back.\n'
	}${storeEnabled ? storeDescription : ''
	}\n`
	+ 'Binary data (images, audio, PDFs) from tools is automatically extracted. Tool results containing these will have the data replaced with refs like {type: \'blob_ref\', id: \'blob_k7m2x9\', mimeType: \'image/png\'}. The actual content is returned separately. If you need the raw base64 data (e.g., to crop, resize, or pass to another tool), use tool(\'get_blob\', {id}) which returns {id, data, mimeType}. Note: blobs are only available within the same execution - save to store if needed later.\n'
	+ '\n'
	+ 'IMPORTANT: Call tool(\'describe_tool\', {name}) to get a tool\'s schema before using it. Do not guess schemas.\n'
	+ '\n'
	+ 'Use tool(\'list_tools\', {}) to discover available tools.\n'
	+ '\n'
	+ 'Style: Keep code short and simple. No comments or error handling needed. Return summaries rather than large objects.';

const createMcpServer = (upstreamToken: string, config: Config): McpServer => {
	const server = new McpServer({name: 'tool-sandbox-mcp', version: '1.0.0'});
	const storeEnabled = config.store ?? false;

	const inputSchema = storeEnabled
		? {
			code: z.string().describe('JavaScript code to execute'),
			store_id: z.string().optional().describe('Session ID from a previous call to resume its store. Omit to start fresh.'),
		}
		: {
			code: z.string().describe('JavaScript code to execute'),
		};

	server.registerTool(
		'execute_code',
		{
			description: buildDescription(storeEnabled),
			inputSchema,
		},
		async (args: {code: string; store_id?: string}) => {
			try {
				const storeId = storeEnabled ? args.store_id : undefined;
				const {blobs, ...rest} = await executeSandbox(args.code, upstreamToken, config, storeId);

				const maxBlobs = 5;
				const content: ({type: 'text'; text: string} | {type: 'image'; data: string; mimeType: string} | {type: 'audio'; data: string; mimeType: string})[] = [
					{type: 'text', text: JSON.stringify(rest)},
				];

				for (const blob of blobs.slice(0, maxBlobs)) {
					if (blob.mimeType.startsWith('image/')) {
						content.push({type: 'image', data: blob.data, mimeType: blob.mimeType});
					} else if (blob.mimeType.startsWith('audio/')) {
						content.push({type: 'audio', data: blob.data, mimeType: blob.mimeType});
					} else {
						content.push({type: 'text', text: `[Blob ${blob.id}: ${blob.mimeType}, ${blob.data.length} chars base64]`});
					}
				}

				if (blobs.length > maxBlobs) {
					content.push({type: 'text', text: `[${blobs.length - maxBlobs} more blobs not shown]`});
				}

				return {content, isError: !rest.success};
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				return {
					content: [{type: 'text' as const, text: `Error: ${message}`}],
					isError: true,
				};
			}
		},
	);

	return server;
};
