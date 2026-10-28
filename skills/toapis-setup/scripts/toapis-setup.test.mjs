import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { configureCodex, parseArgs } from './toapis-setup.mjs';

const fixedNow = () => new Date('2026-10-28T08:09:10Z');

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

test('keeps the file mode and writes through a symlinked config', async () => {
  const { dir, file } = await tempConfig(other);
  await fs.chmod(file, 0o600);
  const link = path.join(dir, 'link.toml');
  await fs.symlink(file, link);
  await configureCodex({ site: 'com', config: link, now: fixedNow });
  assert.ok((await fs.lstat(link)).isSymbolicLink(), 'symlink must stay a symlink');
  assert.ok((await fs.readFile(file, 'utf8')).includes('[mcp_servers.toapis]'));
  assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
});

test('creates a missing config readable only by the owner', async () => {
  const { file } = await tempConfig();
  await configureCodex({ site: 'com', config: file, now: fixedNow });
  assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
});
