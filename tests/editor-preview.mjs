import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readContent, replaceContent } from '../lib/content.mjs';

if (process.argv.includes('--background')) {
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url)], { detached: true, stdio: 'ignore', env: process.env });
  child.unref(); console.log(`Local test editor PID ${child.pid}`); process.exit(0);
}
// Local, in-memory test server. No credentials and no remote write operations.
const root = fileURLToPath(new URL('../', import.meta.url));
let html = await readFile(resolve(root, 'index.html'), 'utf8');
if (process.env.READING_FIXTURES === '1') html = replaceContent(html, 'works', (await import('./reading-fixtures.mjs')).readingFixtures);
let authenticated = false;
const hash = () => createHash('sha1').update(html).digest('hex');
const types = { html: 'text/html; charset=utf-8', js: 'text/javascript', css: 'text/css', svg: 'image/svg+xml', png: 'image/png', webp: 'image/webp', jpg: 'image/jpeg', json: 'application/json' };
createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const json = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
  try {
    if (url.pathname === '/api/editor') {
      const action = url.searchParams.get('action');
      if (action === 'login') { authenticated = true; res.writeHead(303, { Location: '/admin.html' }).end(); return; }
      if (action === 'session') { json(200, { configured: true, authenticated, login: 'LOCAL TEST', csrf: 'local-only' }); return; }
      if (!authenticated) { json(401, { message: '로그인이 필요합니다.' }); return; }
      if (action === 'logout') { authenticated = false; json(200, { ok: true }); return; }
      if (action === 'content' && req.method === 'PUT') {
        let body = ''; for await (const chunk of req) body += chunk;
        const input = JSON.parse(body);
        if (input.sha !== hash()) { json(409, { message: '다른 곳에서 변경되었습니다.' }); return; }
        html = replaceContent(html, input.section, input.value);
      }
      json(200, { sha: hash(), ...readContent(html) }); return;
    }
    const path = url.pathname === '/' ? '/index.html' : url.pathname;
    if (!['/index.html', '/admin.html', '/editor-config.json', '/profile.jpg', '/field.png', '/apple-touch-icon.png'].includes(path) && !/^\/assets\/(?:editor|home-motion|reader)\/[a-z0-9.-]+$/.test(path)) { res.writeHead(404).end(); return; }
    const body = path === '/index.html' ? html : await readFile(resolve(root, '.' + path));
    res.writeHead(200, { 'Content-Type': types[path.split('.').at(-1)], 'Cache-Control': 'no-store' }); res.end(body);
  } catch (e) { json(e.status || 500, { message: e.message }); }
}).listen(Number(process.env.PORT || 4319), '127.0.0.1', () => console.log(`Local editor: http://127.0.0.1:${process.env.PORT || 4319}/admin.html`));
