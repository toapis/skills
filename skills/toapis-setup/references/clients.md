# Client setup

ToAPIs MCP endpoints:

- International: `https://api.toapis.com/mcp`
- Mainland China: `https://api.toapis.cn/mcp`

The examples use the international endpoint and `zh` for `X-Locale`. Replace them with the user's site and language.

## Codex CLI and Codex desktop app

Both read `~/.codex/config.toml` (or `$CODEX_HOME/config.toml`; on Windows `%USERPROFILE%\.codex\config.toml`). The script writes this section:

```toml
[mcp_servers.toapis]
url = "https://api.toapis.com/mcp"
http_headers = { "X-Locale" = "zh" }
```

Sign in:

- CLI: run `codex mcp login toapis`. If the command is unknown, the user needs a newer Codex CLI.
- Desktop app: open Settings, then MCP servers, restart the servers if asked, and click Authenticate next to toapis.

## Claude Code

```bash
claude mcp add --transport http --scope user toapis https://api.toapis.com/mcp --header "X-Locale: zh"
```

If `toapis` already exists, show it with `claude mcp get toapis` and ask before replacing it (`claude mcp remove toapis --scope user`, then add again). Then run `/mcp` inside Claude Code, select toapis and authenticate.

## Claude desktop app

Open Settings, then Connectors, and add a custom connector:

- Name: `ToAPIs`
- URL: `https://api.toapis.com/mcp`
- Leave the advanced OAuth client settings empty.

Then click Connect and sign in. The desktop app cannot send `X-Locale`; server messages follow the language set in the ToAPIs account. On the Free plan only one custom connector is allowed.

The Claude desktop app reaches ToAPIs from Anthropic's servers, not from the user's computer. Do not pick a key with an IP allowlist for this connection; the authorization page warns about such keys.
