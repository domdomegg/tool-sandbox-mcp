import crypto from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {createSandbox, toolSourceFromMcpClient, type ExecuteResult} from 'tool-sandbox';
import type {Config} from './types.js';

// eslint-disable-next-line @typescript-eslint/no-empty-function -- Intentional no-op for ignoring close errors
const noop = () => {};

type Session = {
	store: Record<string, unknown>;
	timer: ReturnType<typeof setTimeout>;
};

const sessions = new Map<string, Session>();

const SESSION_TTL_MS = 5 * 60 * 1000; // 5 minutes

const evict = (id: string) => {
	const session = sessions.get(id);
	if (session) {
		clearTimeout(session.timer);
		sessions.delete(id);
	}
};

const getOrCreateSession = (storeId?: string): {id: string; store: Record<string, unknown>} => {
	if (storeId) {
		const session = sessions.get(storeId);
		if (session) {
			clearTimeout(session.timer);
			session.timer = setTimeout(() => {
				evict(storeId);
			}, SESSION_TTL_MS);
			return {id: storeId, store: session.store};
		}
	}

	const id = crypto.randomUUID();
	const store: Record<string, unknown> = {};
	const timer = setTimeout(() => {
		evict(id);
	}, SESSION_TTL_MS);
	sessions.set(id, {store, timer});
	return {id, store};
};

export type SandboxResult = ExecuteResult & {storeId?: string};

export const executeSandbox = async (
	code: string,
	upstreamToken: string,
	config: Config,
	storeId?: string,
): Promise<SandboxResult> => {
	const selfPrefix = config.selfPrefix ?? 'tool-sandbox';
	const upstreamUrl = new URL('/mcp', config.upstream);

	// Tools resolve lazily: the upstream is only contacted when the code
	// actually calls a tool, and only listed when the code asks for a listing.
	// (An upfront listing of a large aggregator used to dominate every call.)
	let clientPromise: Promise<Client> | undefined;
	const getClient = async () => {
		clientPromise ??= (async () => {
			const client = new Client({name: 'tool-sandbox-mcp', version: '1.0.0'});
			const transport = new StreamableHTTPClientTransport(upstreamUrl, {
				requestInit: {
					headers: {Authorization: `Bearer ${upstreamToken}`},
				},
			});
			await client.connect(transport as Parameters<Client['connect']>[0]);
			return client;
		})();
		return clientPromise;
	};

	const toolSource = toolSourceFromMcpClient(getClient, {
		// Never call back into ourselves — that would recurse.
		exclude: (name) => name.startsWith(`${selfPrefix}__`),
	});

	try {
		const sandbox = await createSandbox({tools: [], toolSource});

		const storeEnabled = config.store ?? false;
		let session: {id: string; store: Record<string, unknown>} | undefined;

		if (storeEnabled) {
			session = getOrCreateSession(storeId);
			sandbox.store = session.store;
		}

		const result = await sandbox.execute.handler({code});

		if (storeEnabled && session) {
			const existing = sessions.get(session.id);
			if (existing) {
				existing.store = sandbox.store;
			}

			return {...result, storeId: session.id};
		}

		return result;
	} finally {
		if (clientPromise) {
			await clientPromise.then(async (client) => client.close()).catch(noop);
		}
	}
};
