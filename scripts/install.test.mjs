// Runs the same cases against install.sh (bash) and install.ps1 (PowerShell, when pwsh or powershell is on PATH).
// Each case uses a temporary HOME and a fake claude CLI, so the real user configuration is never touched.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const scripts = path.dirname(fileURLToPath(import.meta.url));
const nodeDir = path.dirname(process.execPath);

function which(name) {
  const finder = process.platform === 'win32' ? 'where' : 'which';
  try {
    return execFileSync(finder, [name], { encoding: 'utf8' }).split(/\r?\n/)[0].trim() || null;
  } catch {
    return null;
  }
}

const bash = process.platform === 'win32' ? null : '/bin/bash';
const pwsh = which('pwsh');
// Windows PowerShell 5.1 is what `powershell` starts on Windows, and it differs from PowerShell 7 in error handling.
const winps = process.platform === 'win32' ? which('powershell') : null;
const psArgs = (o) => ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(scripts, 'install.ps1'), ...flags(o, (k) => `-${k[0].toUpperCase()}${k.slice(1)}`)];

// Option names differ between the shells: --client codex vs -Client codex.
const shells = [
  {
    name: 'install.sh',
    skip: bash ? false : 'bash is not available',
    command: bash,
    args: (o) => [path.join(scripts, 'install.sh'), ...flags(o, (k) => `--${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`)],
  },
  { name: 'install.ps1', ps: true, skip: pwsh ? false : 'PowerShell 7 is not available', command: pwsh, args: psArgs },
  ...(winps ? [{ name: 'install.ps1 (Windows PowerShell)', ps: true, skip: false, command: winps, args: psArgs }] : []),
];

function flags(options, name) {
  const out = [];
  for (const [key, value] of Object.entries(options)) {
    if (value === true) out.push(name(key));
    else out.push(name(key), value);
  }
  return out;
}

async function sandbox({ withNode = true } = {}) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'toapis-install-'));
  const bin = path.join(home, 'bin');
  await fs.mkdir(bin);
  const log = path.join(home, 'claude.log');
  if (process.platform !== 'win32') {
    await fs.writeFile(
      path.join(bin, 'claude'),
      // Like the real CLI, a failed lookup writes to stderr (Windows PowerShell 5.1 turns that into an error record).
      '#!/bin/sh\nprintf \'%s\\n\' "$*" >> "$FAKE_CLAUDE_LOG"\nif [ "$1 $2" = "mcp get" ]; then [ -n "$FAKE_CLAUDE_HAS_TOAPIS" ] && exit 0; echo \'No MCP server found with name: toapis\' >&2; exit 1; fi\nexit 0\n',
      { mode: 0o755 },
    );
  }
  const searchPath = [bin, ...(withNode ? [nodeDir] : []), '/usr/bin', '/bin'].join(path.delimiter);
  // Keep only what the shells need; CODEX_HOME and the real HOME must not leak in, or the real config would be changed.
  const env = { HOME: home, USERPROFILE: home, PATH: searchPath, FAKE_CLAUDE_LOG: log, TMPDIR: os.tmpdir() };
  for (const name of ['SystemRoot', 'SystemDrive', 'WINDIR', 'TEMP', 'TMP', 'ComSpec', 'PATHEXT']) {
    if (process.env[name]) env[name] = process.env[name];
  }
  return { home, log, env };
}

function run(shell, box, options, extraEnv = {}, args = shell.args(options)) {
  const result = spawnSync(shell.command, args, { env: { ...box.env, ...extraEnv }, encoding: 'utf8' });
  return { code: result.status, out: result.stdout + result.stderr };
}

const exists = (p) => fs.access(p).then(() => true, () => false);
// A system node in /usr/bin (common on Linux) cannot be hidden from PATH.
const systemNode = ['/usr/bin/node', '/bin/node'].some((p) => {
  try {
    execFileSync(p, ['--version']);
    return true;
  } catch {
    return false;
  }
});
const noSymlinks = process.platform === 'win32' && 'symlinks need extra rights on Windows';
const read = (p) => fs.readFile(p, 'utf8');
const claudeCalls = async (box) => ((await exists(box.log)) ? (await read(box.log)).trim().split('\n') : []);

for (const shell of shells) {
  test(`${shell.name}: installs both skills and the Codex server, then reports unchanged`, { skip: shell.skip }, async () => {
    const box = await sandbox();
    const first = run(shell, box, { client: 'codex', site: 'com', locale: 'zh' });
    assert.equal(first.code, 0, first.out);
    for (const name of ['toapis-setup', 'toapis-media']) {
      assert.ok(await exists(path.join(box.home, '.agents/skills', name, 'SKILL.md')), name);
    }
    const config = await read(path.join(box.home, '.codex/config.toml'));
    assert.equal(config, '[mcp_servers.toapis]\nurl = "https://api.toapis.com/mcp"\nhttp_headers = { "X-Locale" = "zh" }\n');
    assert.match(first.out, /codex mcp login toapis/);
    assert.match(first.out, /Authenticate next to toapis/);

    const second = run(shell, box, { client: 'codex', site: 'com', locale: 'zh' });
    assert.equal(second.code, 0, second.out);
    assert.match(second.out, /skill toapis-setup: unchanged/);
    assert.match(second.out, /mcp server toapis: unchanged/);
    assert.equal(await exists(path.join(box.home, '.toapis-backup')), false);
  });

  test(`${shell.name}: --dry-run changes nothing`, { skip: shell.skip }, async () => {
    const box = await sandbox();
    const result = run(shell, box, { client: 'codex', site: 'cn', dryRun: true });
    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /skill toapis-media: add/);
    assert.match(result.out, /mcp server toapis: add \(https:\/\/api\.toapis\.cn\/mcp\)/);
    assert.equal(await exists(path.join(box.home, '.agents')), false);
    assert.equal(await exists(path.join(box.home, '.codex')), false);
  });

  test(`${shell.name}: stops before any change when a different skill exists, and --force moves it to a backup`, { skip: shell.skip }, async () => {
    const box = await sandbox();
    const old = path.join(box.home, '.agents/skills/toapis-media');
    await fs.mkdir(old, { recursive: true });
    await fs.writeFile(path.join(old, 'SKILL.md'), 'old\n');

    const refused = run(shell, box, { client: 'codex', site: 'com' });
    assert.equal(refused.code, 1, refused.out);
    assert.match(refused.out, /already exists and differs/);
    assert.equal(await read(path.join(old, 'SKILL.md')), 'old\n');
    assert.equal(await exists(path.join(box.home, '.agents/skills/toapis-setup')), false);
    assert.equal(await exists(path.join(box.home, '.codex')), false);

    const forced = run(shell, box, { client: 'codex', site: 'com', force: true });
    assert.equal(forced.code, 0, forced.out);
    assert.notEqual(await read(path.join(old, 'SKILL.md')), 'old\n');
    const [stamp] = await fs.readdir(path.join(box.home, '.toapis-backup'));
    assert.equal(await read(path.join(box.home, '.toapis-backup', stamp, 'toapis-media/SKILL.md')), 'old\n');
  });

  test(`${shell.name}: keeps an existing different toapis server in the Codex config unless --force`, { skip: shell.skip }, async () => {
    const box = await sandbox();
    const file = path.join(box.home, '.codex/config.toml');
    await fs.mkdir(path.dirname(file), { recursive: true });
    const before = '[mcp_servers.toapis]\nurl = "https://api.toapis.com/mcp"\nbearer_token_env_var = "TOAPIS_API_KEY"\n';
    await fs.writeFile(file, before);

    const refused = run(shell, box, { client: 'codex', site: 'com' });
    assert.equal(refused.code, 1, refused.out);
    assert.match(refused.out, /already has a different toapis server/);
    assert.equal(await read(file), before);
    assert.equal(await exists(path.join(box.home, '.agents')), false);

    const forced = run(shell, box, { client: 'codex', site: 'com', force: true });
    assert.equal(forced.code, 0, forced.out);
    assert.equal(await read(file), '[mcp_servers.toapis]\nurl = "https://api.toapis.com/mcp"\n');
    assert.ok((await fs.readdir(path.dirname(file))).some((n) => n.startsWith('config.toml.toapis-backup-')));
  });

  test(`${shell.name}: without Node prints the Codex section to add by hand and changes nothing`, { skip: shell.skip || (process.platform === 'win32' && 'PATH without node is not reproducible here') || (systemNode && 'node is installed in /usr/bin') }, async () => {
    const box = await sandbox({ withNode: false });
    const result = run(shell, box, { client: 'codex', site: 'com', locale: 'ja' });
    assert.equal(result.code, 1, result.out);
    assert.match(result.out, /Node\.js 20 or newer/);
    assert.match(result.out, /http_headers = \{ "X-Locale" = "ja" \}/);
    assert.equal(await exists(path.join(box.home, '.agents')), false);
  });

  test(`${shell.name}: adds the Claude Code server in the user scope, and refuses to replace one without --force`, { skip: shell.skip || (process.platform === 'win32' && 'the fake claude CLI is a POSIX script') }, async () => {
    const box = await sandbox();
    const added = run(shell, box, { client: 'claude-code', site: 'cn', locale: 'ja' });
    assert.equal(added.code, 0, added.out);
    assert.ok(await exists(path.join(box.home, '.claude/skills/toapis-setup/SKILL.md')));
    assert.deepEqual(await claudeCalls(box), ['mcp get toapis', 'mcp add --transport http --scope user toapis https://api.toapis.cn/mcp --header X-Locale: ja']);
    assert.match(added.out, /run \/mcp/);

    await fs.rm(box.log);
    const refused = run(shell, box, { client: 'claude-code', site: 'cn' }, { FAKE_CLAUDE_HAS_TOAPIS: '1' });
    assert.equal(refused.code, 1, refused.out);
    assert.match(refused.out, /already has an MCP server named toapis/);
    assert.deepEqual(await claudeCalls(box), ['mcp get toapis']);

    await fs.rm(box.log);
    const forced = run(shell, box, { client: 'claude-code', site: 'cn', force: true }, { FAKE_CLAUDE_HAS_TOAPIS: '1' });
    assert.equal(forced.code, 0, forced.out);
    assert.deepEqual(await claudeCalls(box), ['mcp get toapis', 'mcp remove toapis --scope user', 'mcp add --transport http --scope user toapis https://api.toapis.cn/mcp']);
  });

  test(`${shell.name}: works when the repository is reached through a symlink`, { skip: shell.skip || noSymlinks }, async () => {
    const box = await sandbox();
    const link = path.join(box.home, 'repo-link');
    await fs.symlink(path.dirname(scripts), link);
    const linked = shell.args({ client: 'codex', site: 'com' }).map((a) => a.replace(path.dirname(scripts), link));
    const result = run(shell, box, {}, {}, linked);
    assert.equal(result.code, 0, result.out);
    assert.match(await read(path.join(box.home, '.codex/config.toml')), /\[mcp_servers\.toapis\]/);
  });

  test(`${shell.name}: treats a broken link at a skill path as different and replaces it with --force`, { skip: shell.skip || noSymlinks }, async () => {
    const box = await sandbox();
    const dest = path.join(box.home, '.claude/skills/toapis-setup');
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.symlink(path.join(box.home, 'missing'), dest);
    const refused = run(shell, box, { client: 'claude-code', site: 'com' });
    assert.equal(refused.code, 1, refused.out);
    assert.match(refused.out, /already exists and differs/);
    const forced = run(shell, box, { client: 'claude-code', site: 'com', force: true });
    assert.equal(forced.code, 0, forced.out);
    assert.ok(await exists(path.join(dest, 'SKILL.md')));
  });

  test(`${shell.name}: rejects bad arguments`, { skip: shell.skip }, async () => {
    const box = await sandbox();
    for (const options of [{ client: 'cursor', site: 'com' }, { client: 'codex', site: 'net' }, { client: 'codex', site: 'com', locale: 'zh"; x' }, { site: 'com' }]) {
      const result = run(shell, box, options);
      assert.equal(result.code, 1, `${JSON.stringify(options)}: ${result.out}`);
    }
    assert.equal(await exists(path.join(box.home, '.agents')), false);
  });
}

for (const shell of shells.filter((s) => s.ps)) {
  test(`${shell.name}: installs into USERPROFILE when HOME points elsewhere`, { skip: shell.skip || (process.platform === 'win32' && 'the fake claude CLI is a POSIX script') }, async () => {
    const box = await sandbox();
    const otherHome = path.join(box.home, 'network-home');
    await fs.mkdir(otherHome);
    const result = run(shell, box, { client: 'claude-code', site: 'com' }, { HOME: otherHome });
    assert.equal(result.code, 0, result.out);
    assert.ok(await exists(path.join(box.home, '.claude/skills/toapis-setup/SKILL.md')));
    assert.equal(await exists(path.join(otherHome, '.claude')), false);
  });
}
