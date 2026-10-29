# Client setup

ToAPIs MCP endpoints:

- International: `https://api.toapis.com/mcp`
- Mainland China: `https://api.toapis.cn/mcp`

The examples use the international endpoint. Replace it with the user's site.

## Codex CLI and Codex desktop app

Both read `~/.codex/config.toml` (on Windows `%USERPROFILE%\.codex\config.toml`), so one setup serves both.

```bash
codex mcp add toapis --url https://api.toapis.com/mcp
```

If a different `toapis` server exists, ask first, then run `codex mcp remove toapis` and add it again.

If the `codex` command is not available (some desktop-only installs), add this section to the config file instead, keeping everything else in it. Copy the file to a backup first:

```toml
[mcp_servers.toapis]
url = "https://api.toapis.com/mcp"
```

Sign in:

- CLI: `codex mcp login toapis`. It opens the browser and waits until the user has signed in. If your shell may not wait that long or cannot open a browser, ask the user to run it in their own terminal.
- Desktop app: open Settings, then MCP servers, restart the servers if asked, and click Authenticate next to toapis.

## Claude Code

```bash
claude mcp add --transport http --scope user toapis https://api.toapis.com/mcp --header "X-Locale: zh"
```

Replace `zh` with the user's language, or leave the header out (see Language in `SKILL.md`). If `toapis` already exists, show it with `claude mcp get toapis` and ask before replacing it (`claude mcp remove toapis --scope user`, then add again).

Sign in: the user runs `/mcp` inside Claude Code, selects toapis and authenticates; you cannot run slash commands. If toapis is not listed, Claude Code needs a restart first.

## Claude desktop app and claude.ai

The user opens this link, which fills in the custom connector form, then clicks Add and Connect and signs in:

- International: https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=ToAPIs&connectorUrl=https%3A%2F%2Fapi.toapis.com%2Fmcp
- Mainland China: https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=ToAPIs&connectorUrl=https%3A%2F%2Fapi.toapis.cn%2Fmcp

Or by hand: Settings, then Connectors, add a custom connector named `ToAPIs` with the URL above, and leave the advanced OAuth client settings empty.

Server messages follow the language set in the ToAPIs account, because these apps cannot send `X-Locale`. On the Free plan only one custom connector is allowed.

These apps reach ToAPIs from Anthropic's servers, not from the user's computer. Do not pick a key with an IP allowlist for this connection; the authorization page warns about such keys.
