# ToAPIs Skills

Agent Skills for [ToAPIs](https://toapis.com): connect your agent to ToAPIs, then generate and edit images and videos with ToAPIs models and check your credits, tasks and usage from the chat.

| Skill | Description |
|---|---|
| [`toapis-setup`](skills/toapis-setup/SKILL.md) | Connect Codex or Claude to ToAPIs with browser sign-in, and check credits, tasks and usage |
| [`toapis-media`](skills/toapis-media/SKILL.md) | Generate and edit images and videos with ToAPIs models through the ToAPIs MCP server |

The skills call the ToAPIs MCP server for every business action: `https://api.toapis.com/mcp`, or `https://api.toapis.cn/mcp` for accounts on toapis.cn. You sign in in the browser and choose which API key the connection uses, or create a dedicated key with a spending limit; no key is copied into the agent.

## Quick start

Send the prompt for your client to your agent. For an account on toapis.cn, replace `api.toapis.com` with `api.toapis.cn`.

### Codex

```text
Set up ToAPIs for image and video generation.
1. Install the ToAPIs skills: `npx skills add toapis/skills -g --agent codex -y`.
2. Add the ToAPIs MCP server: `codex mcp add toapis --url https://api.toapis.com/mcp`.
3. Sign in: run `codex mcp login toapis`. It opens a browser, so stop there and wait for me to finish signing in.
If a command is blocked because it writes outside the workspace, stop and tell me.
Tell me when ToAPIs is ready, and that I should start a new chat to use it.
```

The Codex desktop app blocks these writes in its default permission mode. Switch the chat to Full access before sending the prompt and back afterwards, or run the three commands in a terminal yourself. Without the `codex` command, sign in from Settings, then MCP servers, then Authenticate next to toapis.

### Claude Code

```text
Set up ToAPIs for image and video generation.
1. Install the ToAPIs skills: `npx skills add toapis/skills -g --agent claude-code -y`.
2. Add the ToAPIs MCP server: `claude mcp add --transport http --scope user toapis https://api.toapis.com/mcp`.
3. Then tell me to run `/mcp`, select toapis and authenticate in the browser. Restart Claude Code first if toapis is not listed.
```

### Claude (desktop app and claude.ai)

Open [Add ToAPIs to Claude](https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=ToAPIs&connectorUrl=https%3A%2F%2Fapi.toapis.com%2Fmcp) ([toapis.cn account](https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=ToAPIs&connectorUrl=https%3A%2F%2Fapi.toapis.cn%2Fmcp)), then click Add and Connect and sign in.

### Then try

- "Use ToAPIs to generate a 16:9 image of a lighthouse at dawn"
- "How many ToAPIs credits do I have left?"
- "Why did my last ToAPIs task fail?"

## Install manually

- Skills: `npx skills add toapis/skills -g` (needs Node.js 22.20 or newer), or copy the folders under [`skills/`](skills) into `~/.agents/skills/` (Codex) or `~/.claude/skills/` (Claude Code).
- MCP server: see [clients.md](skills/toapis-setup/references/clients.md) for each client.
- With an API key instead of browser sign-in: see [connect.md](skills/toapis-media/references/connect.md).

Generating images and videos spends the credits of the connected API key. `toapis-media` starts a generation only when you ask for one.

## Security

Please report vulnerabilities privately, as described in [SECURITY.md](SECURITY.md).

## License

[Apache License 2.0](LICENSE). The license covers this repository only; it grants no rights to the ToAPIs name or logo.

## Development

The upload and download helper of `toapis-media` needs Node 20 or newer and has no dependencies.

```bash
npm test
```
