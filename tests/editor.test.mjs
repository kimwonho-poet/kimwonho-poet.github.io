import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { EncryptJWT, jwtDecrypt } from 'jose';
import { readContent, replaceContent, validateContent } from '../lib/content.mjs';
import { createEditorHandler } from '../api/editor.mjs';
import { plainDoc, plainText, renderRich, validateRich } from '../lib/rich-text.mjs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const data = readContent(html);
const post = { id: 'test-1', section: 'poem', title: '행과 여백', date: '2026-09-22', meta: '', note: '', link: '', body: '첫 행\n둘째 행\n\n다음 연\n` ${literal} $& </script><script>alert(1)</script>' };
const env = { EDITOR_ORIGIN: 'https://editor.example.test', GITHUB_CLIENT_ID: 'test-app', GITHUB_CLIENT_SECRET: 'test-secret-only', SESSION_SECRET: 'test-only-session-key-never-use-in-production-12345' };
const key = createHash('sha256').update(env.SESSION_SECRET).digest();
const sha = 'a'.repeat(40);
async function session(payload = {}, expiration = '1h') {
  return new EncryptJWT({ kind: 'session', token: 'test-access-token', login: 'kimwonho-poet', userId: 301199413, csrf: 'test-csrf', ...payload })
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' }).setIssuer(env.EDITOR_ORIGIN).setAudience('portfolio-editor').setIssuedAt().setExpirationTime(expiration).encrypt(key);
}
async function request({ action = 'session', method = 'GET', headers = {}, body, cookie, handler = createEditorHandler(env, async () => { throw Error('unexpected network'); }) } = {}) {
  const req = { url: '/api/editor?action=' + action, method, body, headers: { ...(cookie ? { cookie: `__Host-portfolio-session=${cookie}` } : {}), ...headers } };
  const res = { headers: {}, statusCode: 200, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(value) { this.body = value; } };
  await handler(req, res);
  res.json = res.body ? JSON.parse(res.body) : null;
  return res;
}
function githubMock(overrides = {}) {
  const calls = [];
  return { calls, fetcher: async (url, options = {}) => {
    calls.push({ url, options });
    if (options.method === 'PUT') return Response.json({ content: { sha: 'b'.repeat(40) }, commit: { sha: 'c'.repeat(40) } });
    if (url.includes('/contents/index.html')) return Response.json({ sha, encoding: 'base64', content: Buffer.from(html).toString('base64') });
    if (url.endsWith('/login/oauth/access_token')) return Response.json({ access_token: 'test-access-token', expires_in: 28800 });
    if (url.endsWith('/user')) return Response.json({ id: overrides.userId ?? 301199413, login: 'kimwonho-poet' });
    return Response.json({ permissions: { push: overrides.push ?? true } });
  } };
}

test('reads existing 33 biography items, all image stickers, profile, and empty works without executing code', () => {
  assert.equal(data.about.groups.flatMap(g => g.items).length, 33);
  assert.equal(data.profile.names[0], '김원호');
  assert.equal(data.works.length, 0);
  for (const [section, value] of Object.entries(data)) validateContent(section, value);
});
test('round trips Korean, line breaks, template syntax, and script-like text safely', () => {
  const updated = replaceContent(html, 'works', [post]);
  assert.deepEqual(readContent(updated).works, [post]);
  assert.deepEqual(readContent(updated).about, data.about);
  assert.deepEqual(readContent(updated).profile, data.profile);
  assert.ok(updated.includes('assets/home-motion/scene.js?v=2'));
  assert.ok(!updated.includes('</script><script>alert'));
  assert.equal(updated.split('<script').length, html.split('<script').length);
});
test('editing one section does not modify source outside that data section', () => {
  const updated = replaceContent(html, 'profile', { ...data.profile, roles: ['현대시를 공부하는 학생.'] });
  const restore = replaceContent(updated, 'profile', data.profile);
  assert.equal(restore, replaceContent(html, 'profile', data.profile));
});
test('rejects executable content, unsafe URLs, duplicate IDs, impossible dates, unknown sections', () => {
  assert.throws(() => readContent(html.replace('const WORKS = [', 'const WORKS = (() => alert(1))() || [')));
  assert.throws(() => replaceContent(html, 'works', [{ ...post, link: 'javascript:alert(1)' }]));
  assert.throws(() => replaceContent(html, 'works', [post, post]));
  assert.throws(() => replaceContent(html, 'works', [{ ...post, date: '2026-02-30' }]));
  assert.throws(() => replaceContent(html, 'works', [{ ...post, date: '2026-19-99' }]));
  assert.throws(() => replaceContent(html, 'script', []));
  assert.throws(() => replaceContent(html, 'profile', { ...data.profile, photo: 'data:image/svg+xml,<svg onload=alert(1)>' }));
});
test('unconfigured backend fails closed', async () => {
  const r = await request({ handler: createEditorHandler({}) });
  assert.equal(r.statusCode, 503); assert.equal(r.json.configured, false);
});
test('anonymous visitors cannot read editor data or publish', async () => {
  assert.equal((await request({ action: 'content' })).statusCode, 401);
  assert.equal((await request({ action: 'content', method: 'PUT' })).statusCode, 401);
  assert.equal((await request()).json.authenticated, false);
});
test('session exposes identity and CSRF, never access token', async () => {
  const r = await request({ cookie: await session() });
  assert.equal(r.json.authenticated, true); assert.equal(r.json.csrf, 'test-csrf');
  assert.ok(!r.body.includes('test-access-token'));
  assert.equal(r.headers['cache-control'], 'no-store');
});
test('expired, modified, and non-owner sessions are rejected', async () => {
  for (const cookie of [await session({}, '-1s'), (await session()).slice(0, -8) + 'tampered', await session({ userId: 42 })]) {
    assert.equal((await request({ action: 'content', cookie })).statusCode, 401);
  }
});
test('both same-origin and CSRF token are mandatory on writes', async () => {
  const cookie = await session();
  for (const headers of [{}, { origin: env.EDITOR_ORIGIN }, { origin: 'https://attacker.test', 'x-csrf-token': 'test-csrf' }]) {
    assert.equal((await request({ action: 'content', method: 'PUT', cookie, headers })).statusCode, 403);
  }
});
test('valid edit preserves all existing content and saves one revision', async () => {
  const mock = githubMock();
  const r = await request({ action: 'content', method: 'PUT', cookie: await session(), headers: { origin: env.EDITOR_ORIGIN, 'x-csrf-token': 'test-csrf', 'content-type': 'application/json' }, body: { sha, section: 'works', value: [post] }, handler: createEditorHandler(env, mock.fetcher) });
  assert.equal(r.statusCode, 200); assert.deepEqual(r.json.works, [post]);
  const writes = mock.calls.filter(c => c.options.method === 'PUT');
  assert.equal(writes.length, 1);
  const saved = JSON.parse(writes[0].options.body);
  const updated = Buffer.from(saved.content, 'base64').toString('utf8');
  assert.deepEqual(readContent(updated).about, data.about);
  assert.equal(saved.sha, sha); assert.equal(saved.branch, 'main');
});
test('stale revision returns 409 and never writes', async () => {
  const mock = githubMock();
  const r = await request({ action: 'content', method: 'PUT', cookie: await session(), headers: { origin: env.EDITOR_ORIGIN, 'x-csrf-token': 'test-csrf', 'content-type': 'application/json' }, body: { sha: 'f'.repeat(40), section: 'works', value: [post] }, handler: createEditorHandler(env, mock.fetcher) });
  assert.equal(r.statusCode, 409); assert.equal(mock.calls.filter(c => c.options.method === 'PUT').length, 0);
});
test('login sets encrypted secure state and PKCE; redirect is fixed', async () => {
  const r = await request({ action: 'login' });
  assert.equal(r.statusCode, 303);
  assert.match(r.headers['set-cookie'], /HttpOnly; Secure; SameSite=Lax/);
  const url = new URL(r.headers.location);
  assert.equal(url.origin, 'https://github.com');
  assert.equal(url.searchParams.get('redirect_uri'), env.EDITOR_ORIGIN + '/api/editor?action=callback');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('code_challenge').length, 43);
});
test('callback rejects wrong state before any network calls', async () => {
  const r = await request({ action: 'callback&state=wrong&code=not-valid' });
  assert.equal(r.statusCode, 303); assert.ok(r.headers.location.endsWith('?error=login'));
});
test('complete OAuth handshake permits only owner and repository writers', async () => {
  for (const override of [{}, { userId: 123 }, { push: false }]) {
    const mock = githubMock(override), handler = createEditorHandler(env, mock.fetcher);
    const first = await request({ action: 'login', handler });
    const flowCookie = first.headers['set-cookie'].split(';')[0];
    const { payload } = await jwtDecrypt(flowCookie.slice(flowCookie.indexOf('=') + 1), key);
    const r = await request({ action: 'callback&state=' + payload.state + '&code=test-code', headers: { cookie: flowCookie }, handler });
    assert.equal(r.statusCode, 303);
    if (override.userId) assert.ok(r.headers.location.endsWith('?error=owner'));
    else if (override.push === false) assert.ok(r.headers.location.endsWith('?error=permission'));
    else { assert.ok(Array.isArray(r.headers['set-cookie'])); assert.ok(r.headers.location.endsWith('/admin.html')); }
  }
});
test('logout expires the session cookie', async () => {
  const r = await request({ action: 'logout', method: 'POST', cookie: await session(), headers: { origin: env.EDITOR_ORIGIN, 'x-csrf-token': 'test-csrf' } });
  assert.equal(r.statusCode, 200); assert.match(r.headers['set-cookie'], /Max-Age=0/);
});

test('remembered login issues a 30-day HttpOnly cookie with encrypted refresh credentials', async () => {
  const base = githubMock();
  const fetcher = async (url, options) => url.endsWith('/login/oauth/access_token') ? Response.json({ access_token: 'access-secret', refresh_token: 'refresh-secret', expires_in: 28800, refresh_token_expires_in: 15897600 }) : base.fetcher(url, options);
  for (const remember of [0, 1]) {
    const handler = createEditorHandler(env, fetcher);
    const first = await request({ action: 'login&remember=' + remember, handler });
    const flow = first.headers['set-cookie'].split(';')[0];
    const { payload } = await jwtDecrypt(flow.split('=')[1], key);
    const result = await request({ action: `callback&state=${payload.state}&code=test-code`, headers: { cookie: flow }, handler });
    const cookie = result.headers['set-cookie'][1];
    const token = cookie.split(';')[0].split('=')[1];
    const sessionValue = (await jwtDecrypt(token, key)).payload;
    assert.equal(sessionValue.remember, !!remember);
    assert.ok(!cookie.includes('refresh-secret'));
    if (remember) { assert.match(cookie, /Max-Age=2592000/); assert.equal(sessionValue.refreshToken, 'refresh-secret'); }
    else { assert.ok(!cookie.includes('Max-Age')); assert.ok(!sessionValue.refreshToken); }
  }
});

test('expired access token refreshes once for concurrent requests without extending the 30-day limit', async () => {
  const now = Math.floor(Date.now() / 1000), until = now + 20 * 86400;
  const cookie = await session({ remember: true, refreshToken: 'old-refresh', accessUntil: now - 1, refreshUntil: now + 10000000, until }, '20d');
  let refreshes = 0;
  const base = githubMock();
  const handler = createEditorHandler(env, async (url, options) => {
    if (url.endsWith('/login/oauth/access_token')) { refreshes++; const input = JSON.parse(options.body); assert.equal(input.grant_type, 'refresh_token'); return Response.json({ access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 28800, refresh_token_expires_in: 15897600 }); }
    return base.fetcher(url, options);
  });
  const a = await request({ cookie, handler });
  const b = await request({ action: 'content', cookie, handler });
  assert.equal(a.json.authenticated, true); assert.equal(b.statusCode, 200); assert.equal(refreshes, 1);
  assert.equal(a.json.expiresAt, until); assert.ok(!a.body.includes('new-refresh'));
  const payload = (await jwtDecrypt(a.headers['set-cookie'][1].split(';')[0].split('=')[1], key)).payload;
  assert.equal(payload.token, 'new-access'); assert.equal(payload.refreshToken, 'new-refresh'); assert.equal(payload.until, until);
});

test('refresh failure preserves a competing tab cookie and logout needs no refresh', async () => {
  const now = Math.floor(Date.now() / 1000);
  const cookie = await session({ remember: true, refreshToken: 'old', accessUntil: 1, refreshUntil: now + 100000, until: now + 10000 });
  const handler = createEditorHandler(env, async () => Response.json({ error: 'bad_refresh_token' }));
  const failure = await request({ cookie, handler });
  assert.equal(failure.statusCode, 503); assert.equal(failure.headers['set-cookie'], undefined);
  const logout = await request({ action: 'logout', method: 'POST', cookie, handler, headers: { origin: env.EDITOR_ORIGIN, 'x-csrf-token': 'test-csrf' } });
  assert.equal(logout.statusCode, 200);
  assert.match(logout.headers['set-cookie'], /Max-Age=0/);
});

test('rich documents preserve Korean line breaks and render only safe markup', () => {
  const text = '첫 행\n둘째 행\n\n다음 연\n';
  assert.equal(plainText(plainDoc(text)), text);
  const doc = plainDoc(text);
  doc.content[0].content[0].marks = [{ type: 'bold' }, { type: 'link', attrs: { href: 'https://example.com/?a=1&b=2' } }];
  doc.content.push({ type: 'image', attrs: { src: 'data:image/png;base64,YQ==', alt: '<설명>' } });
  const rendered = renderRich(doc);
  assert.match(rendered, /<strong>첫 행<\/strong>/); assert.match(rendered, /&lt;설명&gt;/);
  const updated = replaceContent(html, 'works', [{ ...post, rich: doc, body: plainText(doc) }]);
  assert.deepEqual(readContent(updated).works[0].rich, doc);
  for (const bad of [{ type: 'image', attrs: { src: 'javascript:alert(1)' } }, { type: 'script', content: [] }, { type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href: 'data:text/html,x' } }] }]) assert.throws(() => validateRich({ type: 'doc', content: [bad] }));
  assert.throws(() => replaceContent(html, 'works', [{ ...post, rich: doc }]));
});
