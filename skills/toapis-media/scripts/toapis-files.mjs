#!/usr/bin/env node
// Upload local files to a ToAPIs one-time upload URL and download generated results.
// No dependencies, Node 20+. Never reads environment variables or API keys.
//
//   node toapis-files.mjs upload --url <upload_url> --file <path>
//   node toapis-files.mjs download --url <url> --out <path> [--overwrite] [--root <dir>]
//
// Prints one JSON line to stdout: {"ok":true,...} or {"ok":false,"error":"<code>","message":"..."}.

import { randomBytes } from 'node:crypto';
import { createWriteStream, openAsBlob } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';

const UPLOAD_HOSTS = ['api.toapis.com', 'toapis.com', 'api.toapis.cn', 'toapis.cn'];
const MAX_REDIRECTS = 5;
const MAX_DOWNLOAD_BYTES = 2 * 1024 ** 3;

export class FilesError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const httpsOnly = (url) => url.protocol === 'https:';

function parseURL(raw) {
  try {
    return new URL(raw);
  } catch {
    throw new FilesError('invalid_args', `invalid URL: ${raw}`);
  }
}

/**
 * Upload one file as multipart field "file". Only ToAPIs hosts are allowed.
 * allowHosts and isSecure exist for tests only.
 */
export async function upload({ url, file, allowHosts = UPLOAD_HOSTS, isSecure = httpsOnly }) {
  const target = parseURL(url);
  if (!isSecure(target)) throw new FilesError('https_required', 'upload URL must use https');
  if (!allowHosts.includes(target.hostname)) throw new FilesError('host_not_allowed', `upload host ${target.hostname} is not a ToAPIs host`);
  let blob;
  try {
    blob = await openAsBlob(file);
  } catch {
    throw new FilesError('file_not_found', `cannot read file: ${file}`);
  }
  const form = new FormData();
  form.append('file', blob, path.basename(file));
  let response;
  let body;
  try {
    response = await fetch(target, { method: 'POST', body: form, redirect: 'error' });
    body = await response.json();
  } catch (error) {
    throw new FilesError('upload_failed', error instanceof Error ? error.message : String(error));
  }
  if (!response.ok || body?.success !== true || !body.data?.url) {
    throw new FilesError('upload_failed', body?.message || `upload failed with HTTP ${response.status}`);
  }
  const { url: fileURL, mime_type, size, group_id } = body.data;
  return { ok: true, url: fileURL, mime_type, size, group_id };
}

// inside reports whether target (already resolved) lies inside root.
function inside(root, target) {
  const rel = path.relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

// prepareOutput resolves out against symlinks in existing parents and creates missing directories inside root.
async function prepareOutput(out, root) {
  const realRoot = await fs.realpath(root);
  const target = path.resolve(out);
  let existing = path.dirname(target);
  const missing = [];
  for (;;) {
    try {
      existing = await fs.realpath(existing);
      break;
    } catch {
      missing.unshift(path.basename(existing));
      const parent = path.dirname(existing);
      if (parent === existing) throw new FilesError('path_outside_root', 'output directory cannot be resolved');
      existing = parent;
    }
  }
  const dir = path.join(existing, ...missing);
  const finalPath = path.join(dir, path.basename(target));
  if (!inside(realRoot, finalPath)) throw new FilesError('path_outside_root', `output must be inside ${realRoot}`);
  await fs.mkdir(dir, { recursive: true });
  return finalPath;
}

/**
 * Download an https URL to out. Follows at most 5 redirects, refuses paths outside root,
 * never overwrites unless overwrite is set, and leaves no partial file on failure.
 * isSecure and maxBytes exist for tests only.
 */
export async function download({ url, out, overwrite = false, root = process.cwd(), isSecure = httpsOnly, maxBytes = MAX_DOWNLOAD_BYTES }) {
  let target = parseURL(url);
  if (!isSecure(target)) throw new FilesError('https_required', 'download URL must use https');
  const finalPath = await prepareOutput(out, root);
  if (!overwrite) {
    try {
      await fs.lstat(finalPath);
      throw new FilesError('file_exists', `${finalPath} already exists; pass --overwrite to replace it`);
    } catch (error) {
      if (error instanceof FilesError) throw error;
    }
  }
  let response;
  for (let hops = 0; ; hops++) {
    try {
      response = await fetch(target, { redirect: 'manual' });
    } catch (error) {
      throw new FilesError('download_failed', error instanceof Error ? error.message : String(error));
    }
    if (response.status < 300 || response.status > 399) break;
    const location = response.headers.get('location');
    if (!location) throw new FilesError('download_failed', `redirect without location (HTTP ${response.status})`);
    if (hops >= MAX_REDIRECTS) throw new FilesError('too_many_redirects', `more than ${MAX_REDIRECTS} redirects`);
    target = new URL(location, target);
    if (!isSecure(target)) throw new FilesError('https_required', 'redirect target must use https');
  }
  if (!response.ok || !response.body) throw new FilesError('download_failed', `download failed with HTTP ${response.status}`);
  const declared = Number(response.headers.get('content-length'));
  if (declared > maxBytes) throw new FilesError('too_large', `file is larger than ${maxBytes} bytes`);

  const temp = path.join(path.dirname(finalPath), `.${path.basename(finalPath)}.${randomBytes(6).toString('hex')}.part`);
  let bytes = 0;
  const counter = async function* (source) {
    for await (const chunk of source) {
      bytes += chunk.length;
      if (bytes > maxBytes) throw new FilesError('too_large', `file is larger than ${maxBytes} bytes`);
      yield chunk;
    }
  };
  try {
    await pipeline(Readable.fromWeb(response.body), counter, createWriteStream(temp, { flags: 'wx' }));
    await fs.rename(temp, finalPath);
  } catch (error) {
    await fs.rm(temp, { force: true });
    if (error instanceof FilesError) throw error;
    throw new FilesError('download_failed', error instanceof Error ? error.message : String(error));
  }
  return { ok: true, path: finalPath, bytes };
}

export function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let i = 0; i < rest.length; i++) {
    const name = rest[i];
    if (name === '--overwrite') {
      options.overwrite = true;
    } else if (['--url', '--file', '--out', '--root'].includes(name) && i + 1 < rest.length) {
      options[name.slice(2)] = rest[++i];
    } else {
      throw new FilesError('invalid_args', `unknown or incomplete argument: ${name}`);
    }
  }
  return { command, options };
}

async function main(argv) {
  if (Number(process.versions.node.split('.')[0]) < 20) {
    throw new FilesError('node_too_old', `Node 20 or newer is required, found ${process.versions.node}`);
  }
  const { command, options } = parseArgs(argv);
  if (command === 'upload' && options.url && options.file) {
    // No CLI flag widens the host allowlist, so injected instructions cannot send files elsewhere; tests inject allowHosts directly.
    return upload({ url: options.url, file: options.file });
  }
  if (command === 'download' && options.url && options.out) {
    return download({ url: options.url, out: options.out, overwrite: options.overwrite, root: options.root });
  }
  throw new FilesError('invalid_args', 'usage: upload --url <url> --file <path> | download --url <url> --out <path> [--overwrite] [--root <dir>]');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    (result) => process.stdout.write(`${JSON.stringify(result)}\n`),
    (error) => {
      const code = error instanceof FilesError ? error.code : 'unexpected_error';
      const message = error instanceof Error ? error.message : String(error);
      process.stdout.write(`${JSON.stringify({ ok: false, error: code, message })}\n`);
      process.exitCode = 1;
    },
  );
}
