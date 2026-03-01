# tool-sandbox-mcp

> Give your AI agent a single `execute_code` tool that can call any of your upstream MCP tools — more efficiently.

When agents call tools directly, every tool definition and intermediate result flows through the context window. As I wrote about in [code execution with MCP](https://www.anthropic.com/engineering/code-execution-with-mcp), this gets expensive fast: hundreds of tool definitions consume tokens upfront, and intermediate results (like full documents being copied between tools) bloat the context further.

tool-sandbox-mcp solves this by exposing a single `execute_code` tool that runs JavaScript in a [sandboxed WASM environment](https://github.com/domdomegg/tool-sandbox) with access to all upstream MCP tools. The agent writes code to call tools, filter data, and compose logic — all without intermediate results passing through the context window. Auth is proxied transparently from the upstream server, so users authenticate once.

```
MCP Client (Claude, Cursor, etc.)
  → tool-sandbox-mcp (execute_code)
    → runs JS in sandbox
      → calls upstream MCP tools as needed
```

## Usage

Set `TOOL_SANDBOX_MCP_CONFIG` to a JSON config object and run:

```bash
TOOL_SANDBOX_MCP_CONFIG='{"upstream": "https://mcp.example.com"}' npx -y tool-sandbox-mcp
```

This starts an HTTP MCP server on localhost:3000. When a user connects, they authenticate with the upstream server (via proxied OAuth). The server exposes a single `execute_code` tool — the agent writes JavaScript that can call any tool on the upstream.

In general you'll want to point this at some kind of gateway which aggregates MCP servers. You can use [mcp-gateway](https://github.com/domdomegg/mcp-gateway) for this if you don't already have a gateway. (The `selfPrefix` config argument can prevent recursive calls if you want).

<details>
<summary>Other configuration methods</summary>

The env var can also point to a file path:

```bash
TOOL_SANDBOX_MCP_CONFIG=/path/to/config.json npx -y tool-sandbox-mcp
```

Or create `tool-sandbox-mcp.config.json` in the working directory — it's picked up automatically:

```bash
npx -y tool-sandbox-mcp
```

</details>

### Config

Only `upstream` is required. Everything else has sensible defaults.

| Field | Required | Description |
|-------|----------|-------------|
| `upstream` | Yes | URL of the upstream MCP server (e.g. `"https://mcp.example.com"`). |
| `port` | No | Port to listen on. Defaults to `3000`. |
| `host` | No | Host to bind to. Defaults to `"0.0.0.0"`. |
| `issuerUrl` | No | Public URL of this server. Required when behind a reverse proxy. |
| `selfPrefix` | No | Prefix to filter out from upstream tools to prevent recursion. Defaults to `"tool-sandbox-mcp"`. |

A full example:

```json
{
  "upstream": "https://gateway.mcp.example.com",
  "issuerUrl": "https://tool-sandbox.mcp.example.com",
  "selfPrefix": "tool-sandbox-mcp",
  "port": 3000,
}
```

## How it works

The server proxies the upstream's OAuth — logging in to tool-sandbox-mcp means logging in to the upstream server. When the agent calls `execute_code`, tool-sandbox-mcp:

1. Connects to the upstream MCP server with the user's token
2. Fetches available tools (filtering out its own to prevent recursion)
3. Runs the agent's JavaScript in a [WASM sandbox](https://github.com/domdomegg/tool-sandbox) with those tools available
4. Returns the result

Inside the sandbox, the agent can use:
- `await tool(name, args)` to call any upstream tool
- `await tool('list_tools', {})` to discover available tools
- `await tool('describe_tool', {name})` to get a tool's schema
- `return value` to return a result

## Contributing

Pull requests are welcomed on GitHub! To get started:

1. Install Git and Node.js
2. Clone the repository
3. Install dependencies with `npm install`
4. Run `npm run test` to run tests
5. Build with `npm run build`

## Releases

Versions follow the [semantic versioning spec](https://semver.org/).

To release:

1. Use `npm version <major | minor | patch>` to bump the version
2. Run `git push --follow-tags` to push with tags
3. Wait for GitHub Actions to publish to the NPM registry.
