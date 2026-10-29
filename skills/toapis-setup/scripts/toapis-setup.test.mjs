import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { configureCodex, parseArgs } from './toapis-setup.mjs';

const fixedNow = () => new Date('2026-10-28T08:09:10Z');
// Windows has no POSIX file modes, and root ignores them.
const noPosixModes = process.platform === 'win32' || process.getuid?.() === 0;

async function tempConfig(content) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'toapis-setup-'));
  const file = path.join(dir, 'config.toml');
  if (content !== undefined) await fs.writeFile(file, content);
  return { dir, file };
}

const other = `model = "gpt-5"\n\n[mcp_servers.other]\ncommand = "npx"\nargs = ["-y", "other"]\n`;

test('adds the toapis section and keeps unrelated tables byte for byte', async () => {
  const { file } = await tempConfig(other);
  const result = await configureCodex({ site: 'com', locale: 'zh', config: file, now: fixedNow });
  const text = await fs.readFile(file, 'utf8');
  assert.equal(result.action, 'added');
  assert.ok(text.startsWith(other));
  assert.ok(text.endsWith('[mcp_servers.toapis]\nurl = "https://api.toapis.com/mcp"\nhttp_headers = { "X-Locale" = "zh" }\n'));
  assert.equal(path.basename(result.backup), 'config.toml.toapis-backup-20261028T080910Z');
  assert.equal(await fs.readFile(result.backup, 'utf8'), other);
});

test('replaces an existing toapis section including its subtables, and writes a backup first', async () => {
  const tail = `[profiles.fast]\nmodel = "gpt-5-mini"\n`;
  const before = `${other}\n[mcp_servers.toapis]\nurl = "https://old.example/mcp"\nbearer_token_env_var = "TOAPIS_API_KEY"\n\n[mcp_servers.toapis.env]\nA = "1"\n\n${tail}`;
  const { file } = await tempConfig(before);
  const result = await configureCodex({ site: 'cn', config: file, now: fixedNow });
  const text = await fs.readFile(file, 'utf8');
  assert.equal(result.action, 'replaced');
  assert.equal(text, `${other}\n[mcp_servers.toapis]\nurl = "https://api.toapis.cn/mcp"\n\n${tail}`);
  assert.equal(await fs.readFile(result.backup, 'utf8'), before);
});

test('refuses inline-table, dotted-key and duplicate toapis forms with unsupported_config and leaves the file untouched', async () => {
  for (const content of [
    `[mcp_servers]\ntoapis = { url = "https://api.toapis.com/mcp" }\n`,
    `mcp_servers.toapis.url = "https://api.toapis.com/mcp"\n`,
    `[mcp_servers]\ntoapis.url = "https://api.toapis.com/mcp"\n`,
    `[mcp_servers.toapis]\nurl = "a"\n[mcp_servers.toapis]\nurl = "b"\n`,
    `[mcp_servers."toapis"]\nurl = "a"\n`,
  ]) {
    const { dir, file } = await tempConfig(content);
    await assert.rejects(configureCodex({ site: 'com', config: file, now: fixedNow }), { code: 'unsupported_config' });
    assert.equal(await fs.readFile(file, 'utf8'), content);
    assert.deepEqual(await fs.readdir(dir), ['config.toml']);
  }
});

test('does not write or back up when nothing changes', async () => {
  const content = `${other}\n[mcp_servers.toapis]\nurl = "https://api.toapis.com/mcp"\n`;
  const { dir, file } = await tempConfig(content);
  const result = await configureCodex({ site: 'com', config: file, now: fixedNow });
  assert.equal(result.action, 'unchanged');
  assert.equal(result.backup, undefined);
  assert.deepEqual(await fs.readdir(dir), ['config.toml']);
});

test('creates the file when missing and uses the cn endpoint for --site cn', async () => {
  const { file } = await tempConfig();
  const result = await configureCodex({ site: 'cn', config: file, now: fixedNow });
  assert.equal(result.action, 'added');
  assert.equal(result.backup, undefined);
  assert.equal(await fs.readFile(file, 'utf8'), '[mcp_servers.toapis]\nurl = "https://api.toapis.cn/mcp"\n');
  await assert.rejects(configureCodex({ site: 'net', config: file, now: fixedNow }), { code: 'invalid_args' });
});

test('rejects a malformed --locale before touching the file', async () => {
  const { file } = await tempConfig(other);
  await assert.rejects(configureCodex({ site: 'com', locale: 'zh"; x', config: file, now: fixedNow }), { code: 'invalid_args' });
  assert.equal(await fs.readFile(file, 'utf8'), other);
});

test('--dry-run reports the action without writing', async () => {
  const { dir, file } = await tempConfig(other);
  const result = await configureCodex({ site: 'com', config: file, dryRun: true, now: fixedNow });
  assert.equal(result.action, 'added');
  assert.equal(result.dry_run, true);
  assert.equal(await fs.readFile(file, 'utf8'), other);
  assert.deepEqual(await fs.readdir(dir), ['config.toml']);
});

test('parses CLI arguments', () => {
  assert.deepEqual(parseArgs(['codex', '--site', 'cn', '--locale', 'ja', '--dry-run']), { command: 'codex', options: { site: 'cn', locale: 'ja', dryRun: true } });
  assert.throws(() => parseArgs(['codex', '--bogus']), { code: 'invalid_args' });
});

test('keeps the file mode and writes through a symlinked config', { skip: noPosixModes }, async () => {
  const { dir, file } = await tempConfig(other);
  await fs.chmod(file, 0o600);
  const link = path.join(dir, 'link.toml');
  await fs.symlink(file, link);
  await configureCodex({ site: 'com', config: link, now: fixedNow });
  assert.ok((await fs.lstat(link)).isSymbolicLink(), 'symlink must stay a symlink');
  assert.ok((await fs.readFile(file, 'utf8')).includes('[mcp_servers.toapis]'));
  assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
});

test('creates a missing config readable only by the owner', { skip: noPosixModes }, async () => {
  const { file } = await tempConfig();
  await configureCodex({ site: 'com', config: file, now: fixedNow });
  assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
});

test('keeps CRLF line endings and reports unchanged on the next run', async () => {
  const crlf = other.replaceAll('\n', '\r\n');
  const { file } = await tempConfig(crlf);
  assert.equal((await configureCodex({ site: 'com', locale: 'zh', config: file, now: fixedNow })).action, 'added');
  const text = await fs.readFile(file, 'utf8');
  assert.ok(text.startsWith(crlf));
  assert.ok(text.endsWith('[mcp_servers.toapis]\r\nurl = "https://api.toapis.com/mcp"\r\nhttp_headers = { "X-Locale" = "zh" }\r\n'));
  assert.ok(!/[^\r]\n/.test(text), 'every line ends with CRLF');
  assert.equal((await configureCodex({ site: 'com', locale: 'zh', config: file, now: fixedNow })).action, 'unchanged');
});

test('reports write_failed and leaves no temporary file when the config cannot be written', { skip: noPosixModes }, async () => {
  const { dir, file } = await tempConfig(other);
  await fs.chmod(dir, 0o500);
  try {
    await assert.rejects(configureCodex({ site: 'com', config: file, now: fixedNow }), { code: 'write_failed' });
  } finally {
    await fs.chmod(dir, 0o700);
  }
  assert.equal(await fs.readFile(file, 'utf8'), other);
  assert.deepEqual(await fs.readdir(dir), ['config.toml']);
});

test('treats a config with mixed line endings as before: LF output, unchanged when already set', async () => {
  const content = `model = "x"\r\n\n[mcp_servers.toapis]\nurl = "https://api.toapis.com/mcp"\n`;
  const { file } = await tempConfig(content);
  assert.equal((await configureCodex({ site: 'com', config: file, now: fixedNow })).action, 'unchanged');
  assert.equal(await fs.readFile(file, 'utf8'), content);
});

test('removes the backup it made when the write fails afterwards', async () => {
  const { dir, file } = await tempConfig(other);
  // A directory at the temporary path makes the write fail after the backup was copied.
  const blocker = `${file}.toapis-tmp-${process.pid}`;
  await fs.mkdir(blocker);
  await assert.rejects(configureCodex({ site: 'com', config: file, now: fixedNow }), { code: 'write_failed' });
  assert.equal(await fs.readFile(file, 'utf8'), other);
  assert.deepEqual((await fs.readdir(dir)).sort(), ['config.toml', path.basename(blocker)].sort());
});

test('the CLI still answers when started through a symlinked directory', { skip: process.platform === 'win32' && 'symlinks need extra rights on Windows' }, async () => {
  const { dir, file } = await tempConfig();
  const link = path.join(dir, 'scripts');
  await fs.symlink(path.dirname(fileURLToPath(import.meta.url)), link);
  const result = spawnSync(process.execPath, [path.join(link, 'toapis-setup.mjs'), 'codex', '--site', 'com', '--config', file, '--dry-run'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).action, 'added');
});
