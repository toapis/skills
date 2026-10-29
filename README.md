# ToAPIs Skills

Agent Skills for [ToAPIs](https://toapis.com): connect your agent to ToAPIs, then generate and edit images and videos with ToAPIs models and check your credits, tasks and usage from the chat.

| Skill | Description |
|---|---|
| [`toapis-setup`](skills/toapis-setup/SKILL.md) | Connect Codex or Claude to ToAPIs with browser sign-in, and check credits, tasks and usage |
| [`toapis-media`](skills/toapis-media/SKILL.md) | Generate and edit images and videos with ToAPIs models through the ToAPIs MCP server |

## Requirements

- A ToAPIs account on [toapis.com](https://toapis.com) (international) or [toapis.cn](https://toapis.cn) (mainland China).
- An agent client that supports Agent Skills and remote MCP servers. `toapis-setup` covers Codex (CLI and desktop app), Claude Code and the Claude desktop app.
- Node.js 20 or newer for the bundled helper scripts. Without Node, `toapis-media` falls back to curl.

## Install

With the [skills CLI](https://github.com/vercel-labs/skills):

```bash
npx skills add toapis/skills      # current project
npx skills add toapis/skills -g   # all projects
```

Add `--skill toapis-setup` or `--skill toapis-media` to install one skill only.

Or copy the folders under [`skills/`](skills) into your client's skills directory, for example `~/.claude/skills/` for Claude Code or `~/.agents/skills/` for Codex.

## Get started

1. Ask your agent: "Connect this agent to ToAPIs". `toapis-setup` adds the ToAPIs MCP server and starts the browser sign-in. On the ToAPIs page you choose which API key the connection uses, or create a dedicated key with a spending limit.
2. Ask for an image or video, for example: "Use ToAPIs to generate a 16:9 image of a lighthouse at dawn".
3. Ask about your account: "How many ToAPIs credits do I have left?" or "Why did my last ToAPIs task fail?"

To connect with an API key instead of browser sign-in, see [connect.md](skills/toapis-media/references/connect.md).

## How it works

The skills call the ToAPIs MCP server for every business action: `https://api.toapis.com/mcp`, or `https://api.toapis.cn/mcp` for mainland China. The helper scripts only add the ToAPIs entry to the Codex config and move files to and from ToAPIs; they never read or store API keys.

Generating images and videos spends the credits of the connected API key. `toapis-media` starts a generation only when you ask for one.

## Security

Please report vulnerabilities privately, as described in [SECURITY.md](SECURITY.md).

## License

[Apache License 2.0](LICENSE). The license covers this repository only; it grants no rights to the ToAPIs name or logo.

## Development

The helper scripts need Node 20 or newer and have no dependencies.

```bash
npm test
```
