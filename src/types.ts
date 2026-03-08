export type Config = {
	/** Upstream MCP server base URL (e.g. "https://gateway.mcp.home.adamjones.me") */
	upstream: string;
	/** Port to listen on. Defaults to 3000. */
	port?: number;
	/** Host to bind to. Defaults to "0.0.0.0". */
	host?: string;
	/** External URL of this server (e.g. "https://tool-sandbox.mcp.home.adamjones.me") */
	issuerUrl?: string;
	/** Prefix to filter out from upstream tools to prevent recursion. Defaults to "tool-sandbox". */
	selfPrefix?: string;
	/** Enable persistent store across calls (requires single-node deployment). Defaults to false. */
	store?: boolean;
};
