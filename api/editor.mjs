import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { EncryptJWT, jwtDecrypt } from 'jose';
import { readContent, replaceContent } from '../lib/content.mjs';

const REPO = 'kimwonho-poet/kimwonho-poet.github.io';
const OWNER_ID = 301199413;
const SESSION = '__Host-portfolio-session';
const FLOW = '__Host-portfolio-flow';
const random = () => randomBytes(32).toString('base64url');
const error = (status, message) => Object.assign(new Error(message), { status });
const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function createEditorHandler(env = process.env, fetcher = fetch) {
  const origin = env.EDITOR_ORIGIN;
  const configured = !!(origin?.startsWith('https://') && env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET && env.SESSION_SECRET?.length >= 32);
  const key = createHash('sha256').update(env.SESSION_SECRET || '').digest();
  const branch = 'main';
  const cookie = (name, value, age) => `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
  const readCookie = (req, name) => (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(name + '='))?.slice(name.length + 1);
  const seal = (payload, type, age) => new EncryptJWT({ ...payload, kind: type }).setProtectedHeader({ alg: 'dir', enc: 'A256GCM' }).setIssuer(origin).setAudience('portfolio-editor').setIssuedAt().setExpirationTime(`${age}s`).encrypt(key);
  async function unseal(value, type) {
    try {
      const { payload } = await jwtDecrypt(value, key, { issuer: origin, audience: 'portfolio-editor' });
      return payload.kind === type ? payload : null;
    } catch { return null; }
  }
  async function github(path, token, options = {}) {
    const response = await fetcher('https://api.github.com' + path, {
      ...options,
      signal: AbortSignal.timeout(15000),
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json', ...options.headers }
    });
    if (!response.ok) {
      const messages = {
        401: '로그인이 만료되었습니다. 다시 로그인해 주세요.',
        403: '저장 권한이 없거나 GitHub 요청 한도에 도달했습니다.',
        404: '저장소를 읽을 수 없습니다. 이 저장소에 편집 앱을 설치했는지 확인해 주세요.',
        409: '다른 곳에서 내용이 변경되었습니다. 임시저장한 뒤 최신 내용을 다시 불러와 주세요.',
        422: '변경 내용을 저장하지 못했습니다. 저장소의 브랜치 규칙을 확인해 주세요.'
      };
      throw error(response.status, messages[response.status] || 'GitHub 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    }
    return response.json();
  }
  async function content(token) {
    const file = await github(`/repos/${REPO}/contents/index.html?ref=${branch}`, token);
    if (file.encoding !== 'base64' || !file.content) throw error(502, '홈페이지 파일을 읽지 못했습니다.');
    return { sha: file.sha, html: Buffer.from(file.content, 'base64').toString('utf8') };
  }
  function json(res, status, body) {
    res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(body));
  }
  function redirect(res, url) { res.statusCode = 303; res.setHeader('Location', url); res.end(); }
  async function body(req) {
    if (!(req.headers['content-type'] || '').startsWith('application/json')) throw error(415, 'JSON 요청만 허용됩니다.');
    let value = req.body;
    if (value === undefined) {
      let text = '';
      for await (const chunk of req) {
        text += chunk;
        if (Buffer.byteLength(text) > 2500000) throw error(413, '내용이 너무 큽니다.');
      }
      value = text;
    }
    try {
      if (Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value)) > 2500000) throw error(413, '내용이 너무 큽니다.');
      return typeof value === 'string' ? JSON.parse(value) : value;
    } catch (e) { if (e.status) throw e; throw error(400, '요청 내용을 읽지 못했습니다.'); }
  }

  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const action = new URL(req.url, origin || 'https://editor.invalid').searchParams.get('action') || 'session';
    try {
      if (!configured) { json(res, 503, { configured: false, message: '관리자 로그인 연결을 준비 중입니다.' }); return; }
      if (action === 'login' && req.method === 'GET') {
        const state = random(), verifier = random();
        res.setHeader('Set-Cookie', cookie(FLOW, await seal({ state, verifier }, 'flow', 600), 600));
        const url = new URL('https://github.com/login/oauth/authorize');
        url.search = new URLSearchParams({ client_id: env.GITHUB_CLIENT_ID, redirect_uri: origin + '/api/editor?action=callback', state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', allow_signup: 'false' }).toString();
        redirect(res, url.href); return;
      }
      if (action === 'callback' && req.method === 'GET') {
        const query = new URL(req.url, origin).searchParams;
        const flow = await unseal(readCookie(req, FLOW), 'flow');
        res.setHeader('Set-Cookie', cookie(FLOW, '', 0));
        if (!flow || !equal(flow.state, query.get('state')) || !query.get('code') || query.has('error')) {
          redirect(res, origin + '/admin.html?error=login'); return;
        }
        const r = await fetcher('https://github.com/login/oauth/access_token', {
          method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000),
          body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code: query.get('code'), code_verifier: flow.verifier, redirect_uri: origin + '/api/editor?action=callback' })
        });
        const auth = await r.json();
        if (!r.ok || !auth.access_token) { redirect(res, origin + '/admin.html?error=login'); return; }
        const user = await github('/user', auth.access_token);
        if (user.id !== OWNER_ID) { redirect(res, origin + '/admin.html?error=owner'); return; }
        // GitHub App permissions and the user's repository permission must both permit writes.
        const repo = await github(`/repos/${REPO}`, auth.access_token);
        if (!repo.permissions?.push) { redirect(res, origin + '/admin.html?error=permission'); return; }
        const age = Math.max(1, Math.min(7 * 3600, Number(auth.expires_in || 7 * 3600) - 60));
        res.setHeader('Set-Cookie', [cookie(FLOW, '', 0), cookie(SESSION, await seal({ token: auth.access_token, login: user.login, userId: user.id, csrf: random() }, 'session', age), age)]);
        redirect(res, origin + '/admin.html'); return;
      }
      const session = await unseal(readCookie(req, SESSION), 'session');
      if (action === 'session' && req.method === 'GET') {
        json(res, 200, { configured: true, authenticated: session?.userId === OWNER_ID, ...(session?.userId === OWNER_ID ? { login: session.login, csrf: session.csrf } : {}) }); return;
      }
      if (!session || session.userId !== OWNER_ID) throw error(401, '먼저 관리자 로그인을 해 주세요.');
      if (req.method !== 'GET' && (req.headers.origin !== origin || !equal(req.headers['x-csrf-token'], session.csrf))) throw error(403, '요청을 확인할 수 없습니다. 다시 로그인해 주세요.');
      if (action === 'logout' && req.method === 'POST') {
        res.setHeader('Set-Cookie', cookie(SESSION, '', 0)); json(res, 200, { ok: true }); return;
      }
      if (action === 'content' && req.method === 'GET') {
        const file = await content(session.token);
        json(res, 200, { sha: file.sha, ...readContent(file.html) }); return;
      }
      if (action === 'content' && req.method === 'PUT') {
        const input = await body(req);
        if (!input || !/^[a-f0-9]{40}$/.test(input.sha || '')) throw error(400, '저장 기준이 올바르지 않습니다. 최신 내용을 불러와 주세요.');
        const file = await content(session.token);
        if (file.sha !== input.sha) throw error(409, '다른 곳에서 내용이 변경되었습니다. 임시저장한 뒤 최신 내용을 다시 불러와 주세요.');
        const html = replaceContent(file.html, input.section, input.value);
        if (Buffer.byteLength(html) > 950000) throw error(413, '현재 저장 방식의 용량 한도에 도달했습니다. 큰 이미지는 이미지 주소로 연결해 주세요. 작성한 내용은 임시저장에 남아 있습니다.');
        const saved = await github(`/repos/${REPO}/contents/index.html`, session.token, {
          method: 'PUT', body: JSON.stringify({ branch, sha: file.sha, message: `편집실: ${input.section} 수정`, content: Buffer.from(html).toString('base64') })
        });
        json(res, 200, { sha: saved.content.sha, commit: saved.commit.sha, ...readContent(html) }); return;
      }
      throw error(405, '지원하지 않는 요청입니다.');
    } catch (e) {
      if (e.status === 401) res.setHeader('Set-Cookie', cookie(SESSION, '', 0));
      json(res, e.status && e.status >= 400 && e.status < 600 ? e.status : 500, { message: e.status ? e.message : '처리 중 문제가 발생했습니다. 작성한 내용은 유지됩니다. 잠시 후 다시 시도해 주세요.' });
    }
  };
}

export default createEditorHandler();
