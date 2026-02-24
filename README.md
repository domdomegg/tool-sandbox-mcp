# tool-sandbox-mcp

MCP server that provides sandboxed code execution (via [tool-sandbox](https://github.com/domdomegg/tool-sandbox)) with access to upstream MCP tools via loopback. Auth is proxied from the upstream server.

## Usage

```bash
npx tool-sandbox-mcp
```

Configure via `TOOL_SANDBOX_MCP_CONFIG` environment variable or `tool-sandbox-mcp.config.json`:

```json
{
  "upstream": "https://gateway.mcp.home.adamjones.me",
  "port": 3000,
  "issuerUrl": "https://tool-sandbox.mcp.home.adamjones.me",
  "selfPrefix": "tool-sandbox-mcp"
}
```

The server proxies the upstream's OAuth — logging in to tool-sandbox-mcp means logging in to the upstream server.

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
