# Connect the ToAPIs MCP server

The server is a remote MCP server over Streamable HTTP, authenticated with a ToAPIs API key:

- International: `https://api.toapis.com/mcp`
- Mainland China: `https://api.toapis.cn/mcp`

Create a dedicated API key for agents in the ToAPIs console and set a quota and model limits on it. Keep the key in an environment variable such as `TOAPIS_API_KEY`; never paste it into prompts or files tracked by git.

Set the `X-Locale` header to the language the user chats in, so error messages from the server match the conversation. Supported values: `en`, `zh`, `zh-TW`, `ja`, `ko`, `ru`. For any other language, leave the header out; messages then follow the account language setting in the console. The examples below use `zh`.

> Status: the commands below are pending client acceptance testing and are not yet marked verified.

## Codex

Add to `~/.codex/config.toml`:

```toml
[mcp_servers.toapis]
url = "https://api.toapis.com/mcp"
bearer_token_env_var = "TOAPIS_API_KEY"
http_headers = { "X-Locale" = "zh" }
```

The CLI reads `TOAPIS_API_KEY` from your shell. The Codex desktop app on macOS reads variables from the GUI session: run `launchctl setenv TOAPIS_API_KEY <your key>` and restart the app.

## Claude Code

```bash
claude mcp add --transport http toapis https://api.toapis.com/mcp --header "Authorization: Bearer ${TOAPIS_API_KEY}" --header "X-Locale: zh"
```

## Check the connection (read only)

Ask the agent: "List 5 ToAPIs image models and show the parameter docs of one of them." This calls only `list_models` and `get_model_docs`; nothing is uploaded or generated.

## Remove

- Codex: delete the `[mcp_servers.toapis]` section.
- Claude Code: `claude mcp remove toapis`.

Then delete or disable the dedicated API key in the console.
