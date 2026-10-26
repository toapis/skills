import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';

import { download, upload } from './toapis-files.mjs';

const anyScheme = () => true;
let server;
let base;
let received;

before(async () => {
  server = http.createServer(async (req, res) => {
    if (req.method === 'POST' && req.url.startsWith('/v1/agent/uploads/')) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      received = { headers: req.headers, body: Buffer.concat(chunks).toString('latin1') };
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true, data: { url: 'https://files.toapis.com/a.png', mime_type: 'image/png', size: 3, group_id: 7 } }));
      return;
    }
    if (req.url === '/file') {
      res.end('hello');
      return;
    }
    if (req.url === '/broken') {
      res.writeHead(200, { 'Content-Length': '100' });
      res.write('partial');
      res.destroy();
      return;
    }
    if (req.url.startsWith('/loop')) {
      const n = Number(req.url.slice(5) || 0);
      res.writeHead(302, { Location: `/loop${n + 1}` });
      res.end();
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

async function tempDir() {
  return fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'toapis-files-')));
}

test('upload rejects non-allowlisted host', async () => {
  await assert.rejects(upload({ url: 'https://evil.example/v1/agent/uploads/x', file: 'package.json' }), { code: 'host_not_allowed' });
});

test('upload rejects http scheme', async () => {
  await assert.rejects(upload({ url: 'http://api.toapis.com/v1/agent/uploads/x', file: 'package.json' }), { code: 'https_required' });
});

test('upload sends multipart file field and prints url', async () => {
  const dir = await tempDir();
  const file = path.join(dir, 'pic.png');
  await fs.writeFile(file, 'png');
  const result = await upload({ url: `${base}/v1/agent/uploads/t1`, file, allowHosts: ['127.0.0.1'], isSecure: anyScheme });
  assert.deepEqual(result, { ok: true, url: 'https://files.toapis.com/a.png', mime_type: 'image/png', size: 3, group_id: 7 });
  assert.match(received.headers['content-type'], /^multipart\/form-data; boundary=/);
  assert.match(received.body, /name="file"; filename="pic.png"/);
  assert.equal(received.headers.authorization, undefined);
  await assert.rejects(upload({ url: `${base}/v1/agent/uploads/t1`, file: path.join(dir, 'missing.png'), allowHosts: ['127.0.0.1'], isSecure: anyScheme }), { code: 'file_not_found' });
});

test('download refuses path outside root', async () => {
  const root = await tempDir();
  const outside = await tempDir();
  await assert.rejects(download({ url: `${base}/file`, out: path.join(root, '..', 'x.txt'), root, isSecure: anyScheme }), { code: 'path_outside_root' });
  await fs.symlink(outside, path.join(root, 'link'));
  await assert.rejects(download({ url: `${base}/file`, out: path.join(root, 'link', 'x.txt'), root, isSecure: anyScheme }), { code: 'path_outside_root' });
  assert.deepEqual(await fs.readdir(outside), []);
  await assert.rejects(download({ url: `${base}/file`, out: path.join(root, 'y.txt'), root }), { code: 'https_required' });
});

test('download does not overwrite by default', async () => {
  const root = await tempDir();
  const out = path.join(root, 'nested', 'a.txt');
  const first = await download({ url: `${base}/file`, out, root, isSecure: anyScheme });
  assert.deepEqual(first, { ok: true, path: out, bytes: 5 });
  await assert.rejects(download({ url: `${base}/file`, out, root, isSecure: anyScheme }), { code: 'file_exists' });
  await fs.writeFile(out, 'old');
  await download({ url: `${base}/file`, out, root, overwrite: true, isSecure: anyScheme });
  assert.equal(await fs.readFile(out, 'utf8'), 'hello');
});

test('download leaves no partial file on failure', async () => {
  const root = await tempDir();
  await assert.rejects(download({ url: `${base}/broken`, out: path.join(root, 'b.bin'), root, isSecure: anyScheme }), { code: 'download_failed' });
  assert.deepEqual(await fs.readdir(root), []);
  await assert.rejects(download({ url: `${base}/file`, out: path.join(root, 'c.bin'), root, maxBytes: 3, isSecure: anyScheme }), { code: 'too_large' });
  assert.deepEqual(await fs.readdir(root), []);
});

test('download enforces redirect limit', async () => {
  const root = await tempDir();
  await assert.rejects(download({ url: `${base}/loop0`, out: path.join(root, 'r.bin'), root, isSecure: anyScheme }), { code: 'too_many_redirects' });
});
