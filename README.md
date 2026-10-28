# ToAPIs Skills

Agent Skills for [ToAPIs](https://toapis.com).

| Skill | Description |
|---|---|
| [`toapis-media`](skills/toapis-media/SKILL.md) | Generate and edit images and videos with ToAPIs models through the ToAPIs MCP server |
| [`toapis-setup`](skills/toapis-setup/SKILL.md) | Connect Codex or Claude to ToAPIs with browser sign-in, and check credits, tasks and usage |

The skills call the ToAPIs MCP server for every business action. Connect it first with [`toapis-setup`](skills/toapis-setup/SKILL.md), or with an API key: see [connect.md](skills/toapis-media/references/connect.md).

## Development

The helper scripts need Node 20 or newer and have no dependencies.

```bash
npm test
```
