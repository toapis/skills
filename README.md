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

## Quick start

Paste this prompt into Codex or Claude Code. The agent follows [docs/agent-setup.md](docs/agent-setup.md): it installs both skills, adds the ToAPIs MCP server, and opens the browser for you to sign in. On the ToAPIs page you choose which API key the connection uses, or create a dedicated key with a spending limit.

```text
Read the official ToAPIs setup guide at https://raw.githubusercontent.com/toapis/skills/main/docs/agent-setup.md and follow its steps to connect this AI client to ToAPIs. Reply in English. Never ask me for my password, verification codes or API key, and tell me what you will change before you change any configuration.
```

<details>
<summary>简体中文</summary>

```text
请阅读 ToAPIs 官方接入文档 https://raw.githubusercontent.com/toapis/skills/main/docs/agent-setup.md ，按其中的步骤把当前 AI 客户端接入 ToAPIs。全程用简体中文回复；不要向我索要密码、验证码或 API Key；修改任何配置前先告诉我要改什么。
```

</details>

<details>
<summary>繁體中文</summary>

```text
請閱讀 ToAPIs 官方連接指南 https://raw.githubusercontent.com/toapis/skills/main/docs/agent-setup.md ，依照其中的步驟將目前的 AI 用戶端連接到 ToAPIs。全程使用繁體中文回覆；不要向我索取密碼、驗證碼或 API Key；修改任何設定前先告訴我要改什麼。
```

</details>

<details>
<summary>日本語</summary>

```text
ToAPIs 公式の接続ガイド https://raw.githubusercontent.com/toapis/skills/main/docs/agent-setup.md を読み、その手順に従ってこの AI クライアントを ToAPIs に接続してください。返答はすべて日本語でお願いします。パスワード、認証コード、API キーは求めないでください。設定を変更する前に、何を変更するか説明してください。
```

</details>

<details>
<summary>한국어</summary>

```text
ToAPIs 공식 연결 가이드를 읽고, 안내된 단계에 따라 이 AI 클라이언트를 ToAPIs에 연결해 주세요. 가이드 주소: https://raw.githubusercontent.com/toapis/skills/main/docs/agent-setup.md . 모든 답변은 한국어로 해 주세요. 비밀번호, 인증 코드, API 키는 요청하지 마세요. 설정을 변경하기 전에 무엇을 바꿀지 먼저 알려 주세요.
```

</details>

<details>
<summary>Русский</summary>

```text
Прочитай официальное руководство ToAPIs по подключению https://raw.githubusercontent.com/toapis/skills/main/docs/agent-setup.md и по его шагам подключи этот AI-клиент к ToAPIs. Отвечай на русском. Не спрашивай у меня пароль, коды подтверждения или API-ключ и перед любым изменением настроек сообщи, что именно изменишь.
```

</details>

Then try, in a new session:

- "Use ToAPIs to generate a 16:9 image of a lighthouse at dawn"
- "How many ToAPIs credits do I have left?"
- "Why did my last ToAPIs task fail?"

## Install manually

Clone this repository and run the install script. It previews with `--dry-run` (`-DryRun`), refuses to replace an existing ToAPIs skill or server unless you add `--force` (`-Force`), and backs up what it replaces.

```bash
# macOS and Linux
bash scripts/install.sh --client codex --site com --locale en
```

```powershell
# Windows
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install.ps1 -Client codex -Site com -Locale en
```

Use `--client claude-code` for Claude Code and `--site cn` for an account on toapis.cn. Then sign in as the script prints.

You can also install the skills only, with the [skills CLI](https://github.com/vercel-labs/skills) (`npx skills add toapis/skills -g`) or by copying the folders under [`skills/`](skills) into `~/.agents/skills/` (Codex) or `~/.claude/skills/` (Claude Code), and then ask your agent: "Connect this agent to ToAPIs".

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

The `install.ps1` cases run only when `pwsh` (or Windows PowerShell on Windows) is on `PATH`; otherwise they are skipped.
