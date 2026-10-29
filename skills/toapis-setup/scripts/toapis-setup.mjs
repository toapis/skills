#!/usr/bin/env node
// Add or replace the ToAPIs MCP server in the Codex config (shared by the Codex CLI and the Codex desktop app).
// No dependencies, Node 20+. Never reads or writes API keys: sign-in happens later in the browser via OAuth.
//
//   node toapis-setup.mjs codex --site com|cn [--locale <code>] [--config <path>] [--dry-run]
//
// Prints one JSON line to stdout: {"ok":true,"action":"added|replaced|unchanged",...} or {"ok":false,"error":"<code>","message":"..."}.
// Only the standard form [mcp_servers.toapis] (plus its [mcp_servers.toapis.*] subtables) is edited. Any other way of
// defining the toapis server stops with unsupported_config and leaves the file untouched.

import { realpathSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ENDPOINTS = { com: 'https://api.toapis.com/mcp', cn: 'https://api.toapis.cn/mcp' };
// Same pattern as toapis-files.mjs; the value is written into TOML, so it must stay this strict.
const LOCALE_PATTERN = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;
const HEADER = /^\s*\[\[?\s*([^\]]+?)\s*\]\]?\s*(#.*)?$/;

export class SetupError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function defaultConfigPath() {
  const home = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  return path.join(home, 'config.toml');
}

function tableName(line) {
  const match = HEADER.exec(line);
  return match ? match[1].replace(/\s*\.\s*/g, '.') : null;
}

const isToapisTable = (name) => name === 'mcp_servers.toapis' || name.startsWith('mcp_servers.toapis.');

/**
 * Find the standard [mcp_servers.toapis] block. Returns { start, end } line indexes (end exclusive, trailing blank
 * lines excluded) or null. Throws unsupported_config for inline tables, dotted keys, quoted or duplicate headers.
 */
function findToapisBlock(lines) {
  let current = '';
  let start = -1;
  let end = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const name = tableName(line);
    if (name !== null) {
      if (/^mcp_servers\.["']toapis["']/.test(name)) throw new SetupError('unsupported_config', 'quoted [mcp_servers."toapis"] header');
      if (name === 'mcp_servers.toapis') {
        if (start !== -1) throw new SetupError('unsupported_config', 'duplicate [mcp_servers.toapis] sections');
        start = i;
      } else if (start !== -1 && end === -1 && !isToapisTable(name)) {
        end = i;
      }
      current = name;
      continue;
    }
    const key = line.trimStart();
    if ((current === '' && /^mcp_servers\s*\.\s*["']?toapis["']?\s*[.=]/.test(key)) || (current === 'mcp_servers' && /^["']?toapis["']?\s*[.=]/.test(key))) {
      throw new SetupError('unsupported_config', 'toapis is defined with an inline table or dotted keys');
    }
  }
  if (start === -1) return null;
  if (end === -1) end = lines.length;
  while (end > start + 1 && lines[end - 1].trim() === '') end--;
  return { start, end };
}

function utcStamp(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

/** Write the ToAPIs MCP server into the Codex config. now exists for tests only. */
export async function configureCodex({ site, locale, config = defaultConfigPath(), dryRun = false, now = () => new Date() }) {
  const url = ENDPOINTS[site];
  if (!url) throw new SetupError('invalid_args', `site must be com or cn, got ${site}`);
  if (locale !== undefined && !LOCALE_PATTERN.test(locale)) throw new SetupError('invalid_args', `invalid locale: ${locale}`);

  // Follow a symlinked config (for example into a dotfiles repo) and keep the link itself intact.
  let target = config;
  let mode = 0o600;
  let original = '';
  let exists = true;
  try {
    target = await fs.realpath(config);
    mode = (await fs.stat(target)).mode & 0o777;
    original = await fs.readFile(target, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw new SetupError('read_failed', `cannot read ${config}: ${error.message}`);
    exists = false;
  }
  const block = ['[mcp_servers.toapis]', `url = "${url}"`];
  if (locale) block.push(`http_headers = { "X-Locale" = "${locale}" }`);

  // Keep files that use CRLF throughout (common on Windows) in CRLF, so an unchanged config is detected as unchanged.
  // Files with mixed line endings are handled as LF, as before.
  const eol = original.includes('\r\n') && !/(^|[^\r])\n/.test(original) ? '\r\n' : '\n';
  const lines = original === '' ? [] : original.replace(eol === '\r\n' ? /\r\n$/ : /\n$/, '').split(eol);
  const found = findToapisBlock(lines);
  let next;
  let action;
  if (found) {
    next = [...lines.slice(0, found.start), ...block, ...lines.slice(found.end)];
    action = 'replaced';
  } else {
    next = lines.length > 0 ? [...lines, '', ...block] : block;
    action = 'added';
  }
  const text = `${next.join(eol)}${eol}`;
  if (text === original) return { ok: true, action: 'unchanged', config };
  if (dryRun) return { ok: true, action, config, dry_run: true };

  let backup;
  let backupMade = false;
  const temp = `${target}.toapis-tmp-${process.pid}`;
  try {
    if (exists) {
      backup = `${target}.toapis-backup-${utcStamp(now())}`;
      await fs.copyFile(target, backup);
      backupMade = true;
    } else {
      await fs.mkdir(path.dirname(target), { recursive: true });
    }
    // Write to a temporary file and rename, so an interrupted write never leaves a half-written config.
    // Keep the original permissions; a new config may hold tokens later, so it is readable only by the owner.
    await fs.writeFile(temp, text, { mode });
    await fs.chmod(temp, mode);
    await fs.rename(temp, target);
  } catch (error) {
    // The config itself is untouched (the rename is atomic), so the backup of this attempt is not needed.
    await fs.rm(temp, { force: true }).catch(() => {});
    if (backupMade) await fs.rm(backup, { force: true }).catch(() => {});
    // Typical causes: the agent's sandbox blocks writes outside its workspace, or another program (a running Codex,
    // antivirus) holds the file on Windows.
    throw new SetupError('write_failed', `cannot write ${target}: ${error.code || error.message}`);
  }
  return { ok: true, action, backup, config };
}

export function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let i = 0; i < rest.length; i++) {
    const name = rest[i];
    if (name === '--dry-run') {
      options.dryRun = true;
    } else if (['--site', '--locale', '--config'].includes(name) && i + 1 < rest.length) {
      options[name.slice(2)] = rest[++i];
    } else {
      throw new SetupError('invalid_args', `unknown or incomplete argument: ${name}`);
    }
  }
  return { command, options };
}

async function main(argv) {
  if (Number(process.versions.node.split('.')[0]) < 20) {
    throw new SetupError('node_too_old', `Node 20 or newer is required, found ${process.versions.node}`);
  }
  const { command, options } = parseArgs(argv);
  if (command === 'codex' && options.site) return configureCodex(options);
  throw new SetupError('invalid_args', 'usage: codex --site com|cn [--locale <code>] [--config <path>] [--dry-run]');
}

// Compare real paths: when started through a symlink (an installer may link skill directories) or, on Windows, a short
// 8.3 path, argv[1] differs from import.meta.url although this file is the entry point.
function startedAsScript() {
  try {
    return realpathSync.native(process.argv[1]) === realpathSync.native(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (startedAsScript()) {
  main(process.argv.slice(2)).then(
    (result) => process.stdout.write(`${JSON.stringify(result)}\n`),
    (error) => {
      const code = error instanceof SetupError ? error.code : 'unexpected_error';
      const message = error instanceof Error ? error.message : String(error);
      process.stdout.write(`${JSON.stringify({ ok: false, error: code, message })}\n`);
      process.exitCode = 1;
    },
  );
}
