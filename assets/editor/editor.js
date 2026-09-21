const main = document.getElementById('editor-main');
const logout = document.getElementById('logout');
const sections = { poem: '시', prose: '산문·비평', research: '연구' };
const publicOrigin = 'https://kimwonho-poet.github.io';
const draftKey = 'portfolio-editor-drafts-v1';
const state = { session: null, content: null, tab: 'works', post: null, drafts: { posts: {} }, busy: false, preview: false, search: '', filter: '' };
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = name => `<svg aria-hidden="true"><use href="assets/editor/icons.svg#${name}"></use></svg>`;
const button = (action, name, label, extra = '') => `<button type="button" data-action="${action}" class="icon-button ${extra}" title="${label}" aria-label="${label}">${icon(name)}</button>`;
const clone = value => structuredClone(value);
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const newPost = () => ({ id: 'w-' + crypto.randomUUID(), section: 'poem', title: '', body: '', date: today(), meta: '', link: '', note: '' });
const item = value => typeof value === 'string' ? { t: value, url: '', img: '' } : value;
const hasDrafts = () => Object.keys(state.drafts.posts || {}).length || state.drafts.about || state.drafts.profile;
let noticeTimer;

function notice(message, failure = false) {
  const el = document.getElementById('notice');
  el.textContent = message; el.dataset.error = String(failure); el.hidden = false;
  clearTimeout(noticeTimer); noticeTimer = setTimeout(() => { el.hidden = true; }, failure ? 14000 : 6000);
}
function persist() {
  try {
    if (hasDrafts()) sessionStorage.setItem(draftKey, JSON.stringify(state.drafts));
    else { delete state.drafts.baseSha; sessionStorage.removeItem(draftKey); }
    const el = document.getElementById('draft-status');
    if (el) el.textContent = hasDrafts() ? '현재 탭에 임시저장됨' : '저장된 내용';
  } catch { notice('이 브라우저에서는 임시저장을 사용할 수 없습니다. 임시저장 파일을 내려받아 보관해 주세요.', true); }
}
function restore() {
  try {
    const value = JSON.parse(sessionStorage.getItem(draftKey) || 'null');
    if (value?.posts && typeof value.posts === 'object') state.drafts = value;
  } catch {}
}
function draft(section, value) {
  if (!state.drafts.baseSha) state.drafts.baseSha = state.content.sha;
  if (section === 'works') state.drafts.posts[value.id] = clone(value);
  else state.drafts[section] = clone(value);
  persist();
}
async function api(action, options = {}) {
  let response;
  try {
    response = await fetch('/api/editor?action=' + action, { ...options, credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json', ...(state.session?.csrf ? { 'X-CSRF-Token': state.session.csrf } : {}), ...options.headers } });
  } catch { throw new Error('서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.'); }
  const result = await response.json().catch(() => ({ message: '관리자 서버가 연결되지 않았습니다.' }));
  if (!response.ok) throw Object.assign(new Error(result.message), { status: response.status, configured: result.configured });
  return result;
}

function loginView(message = '', configured = true) {
  logout.hidden = true;
  main.innerHTML = `<section class="login-view"><p class="eyebrow">EDITOR</p><h1>김원호 편집실</h1>
    ${message ? `<p class="status-error" role="alert">${esc(message)}</p>` : '<p>관리자 계정으로 로그인해 주세요.</p>'}
    ${configured ? `<a class="button primary" href="/api/editor?action=login">${icon('log-in')} GitHub로 로그인</a>` : '<p>인증 서버 연결을 마치면 이곳에서 로그인할 수 있습니다.</p>'}
    <a class="secondary-link" href="${publicOrigin}/">홈페이지로 돌아가기</a></section>`;
}
async function boot() {
  if (location.hostname === 'kimwonho-poet.github.io') {
    try {
      const config = await fetch('editor-config.json', { cache: 'no-store' }).then(r => r.json());
      if (config.editorOrigin && new URL(config.editorOrigin).protocol === 'https:') {
        location.replace(new URL('/admin.html', config.editorOrigin)); return;
      }
    } catch {}
    loginView('관리자 로그인 연결을 준비 중입니다.', false); return;
  }
  try {
    state.session = await api('session');
    if (!state.session.authenticated) {
      const message = { login: '로그인 확인이 완료되지 않았습니다. 다시 시도해 주세요.', owner: '김원호 관리자 계정으로 로그인해 주세요.', permission: '저장소 편집 권한을 확인해 주세요.' }[new URLSearchParams(location.search).get('error')];
      loginView(message); return;
    }
    state.content = await api('content'); restore();
    state.post = Object.values(state.drafts.posts)[0] || newPost();
    logout.hidden = false;
    render();
    if (hasDrafts()) notice('이 탭에서 작성 중이던 내용을 복원했습니다.');
  } catch (e) {
    loginView(e.message, e.configured !== false && e.status !== 404);
  }
}

function shell(content) {
  return `<div class="workspace"><div class="workspace-top"><div class="tabs" role="tablist" aria-label="편집 구역">
    ${[['works', '글'], ['profile', '프로필'], ['about', '소개·이력']].map(([key, name]) => `<button type="button" role="tab" aria-selected="${state.tab === key}" data-tab="${key}">${name}</button>`).join('')}
    </div><p>${esc(state.session.login)} <span aria-hidden="true">·</span> 관리자</p></div>${content}</div>`;
}
function statusLine() { return '<p id="save-status" class="status-line" role="status" aria-live="polite"></p>'; }
function header(title, publishLabel = '저장 후 게시') {
  return `<div class="editing-header"><div><h1>${title}</h1><p id="draft-status">${hasDrafts() ? '현재 탭에 임시저장됨' : '저장된 내용'}</p></div>
    <div class="editing-actions">${button('backup', 'download', '임시저장 파일 내려받기')}${button('discard', 'x', '임시저장 버리고 다시 시작')}${button('reload', 'refresh-cw', '최신 내용 불러오기')}
    <button class="primary" type="button" data-action="publish">${icon('save')}${publishLabel}</button></div></div>`;
}
function postList() {
  const map = new Map(state.content.works.map(w => [w.id, w]));
  Object.values(state.drafts.posts).forEach(w => map.set(w.id, w));
  const posts = [...map.values()].filter(w => (!state.filter || w.section === state.filter) && (w.title + '\n' + w.body).toLocaleLowerCase().includes(state.search.toLocaleLowerCase()));
  return posts.length ? `<ul class="post-list">${posts.map(w => `<li><button type="button" data-post="${esc(w.id)}" aria-current="${w.id === state.post.id}"><strong>${esc(w.title || '제목 없는 글')}</strong><small>${esc(sections[w.section])} · ${esc(w.date)}${state.drafts.posts[w.id] ? ' · 임시저장' : ''}</small></button></li>`).join('')}</ul>` : '<p class="empty">표시할 글이 없습니다.</p>';
}
function postPreview() {
  const w = state.post;
  let link = '';
  try { if (new URL(w.link).protocol === 'https:') link = `<a class="preview-link" href="${esc(w.link)}" target="_blank" rel="noopener">원문 보기 ${icon('external-link')}</a>`; } catch {}
  return `<article class="preview"><h2>${esc(w.title || '제목 없는 글')}</h2><p class="meta">${esc(w.date)}${w.meta ? ' · ' + esc(w.meta) : ''}</p><div class="preview-body">${esc(w.body)}</div>${w.note ? `<p class="preview-note">${esc(w.note)}</p>` : ''}${link}</article>`;
}
function worksView() {
  const w = state.post;
  const existing = state.content.works.some(p => p.id === w.id);
  return `<div class="work-layout"><aside class="sidebar"><div class="sidebar-head"><h2>글 목록 <span>(${state.content.works.length})</span></h2>${button('new', 'plus', '새 글 쓰기')}</div>
    <div class="sidebar-filters"><input id="search" type="search" placeholder="글 검색" aria-label="글 검색" value="${esc(state.search)}"><select id="filter" aria-label="분류 필터"><option value="">모든 분류</option>${Object.entries(sections).map(([v, t]) => `<option value="${v}" ${state.filter === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div><div id="posts">${postList()}</div></aside>
    <section class="editing">${header(existing ? '글 수정' : '새 글', existing ? '수정 후 게시' : '게시하기')}
    <div class="edit-mode" aria-label="편집 모드"><button type="button" data-mode="edit" aria-pressed="${!state.preview}">${icon('pencil')}작성</button><button type="button" data-mode="preview" aria-pressed="${state.preview}">${icon('eye')}미리보기</button></div>
    ${state.preview ? postPreview() : `<form id="post-form" class="form"><label>제목<input class="post-title" name="title" value="${esc(w.title)}" required maxlength="300" placeholder="제목"></label>
      <div class="form-row"><label>분류<select name="section">${Object.entries(sections).map(([v, t]) => `<option value="${v}" ${w.section === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label><label>날짜<input name="date" type="date" value="${esc(w.date)}" required></label></div>
      <label>본문<textarea class="body" name="body" required maxlength="200000" spellcheck="false">${esc(w.body)}</textarea></label>
      <details ${w.meta || w.link || w.note ? 'open' : ''}><summary>발표 지면·원문 링크·덧붙이는 말</summary>
        <label>발표 지면<input name="meta" value="${esc(w.meta)}" maxlength="1000"></label><label>원문 링크<input name="link" type="url" value="${esc(w.link)}" placeholder="https://" maxlength="2048"></label><label>덧붙이는 말<textarea name="note" rows="3" maxlength="3000">${esc(w.note)}</textarea></label></details></form>`}
    ${statusLine()}${existing ? `<div class="editing-actions"><a class="published-link" href="${publicOrigin}/#/work/${encodeURIComponent(w.id)}" target="_blank" rel="noopener">게시된 글 보기</a><button class="quiet danger" type="button" data-action="delete">${icon('trash-2')}글 삭제</button></div>` : ''}</section></div>`;
}
function field(label, value, path, type = 'text') {
  return `<label>${label}<input type="${type}" data-path="${path}" value="${esc(value)}" ${type === 'url' ? 'placeholder="https://"' : ''}></label>`;
}
function imageField(value, path) {
  if (!/^data:image\/(?:jpeg|png|webp);base64,/.test(value || '')) return field('이미지 주소', value, path, 'url');
  return `<div class="stored-image"><img src="${esc(value)}" alt="저장된 이미지" loading="lazy"><label>이미지 교체<input data-path="${path}" type="url" placeholder="https://"></label>${button(`clear-image:${path}`, 'trash-2', '이미지 삭제', 'danger')}</div>`;
}
function arrayControls(path, index, count) {
  return `<div class="row-actions">${index ? button(`up:${path}:${index}`, 'arrow-up', '위로 이동') : ''}${index < count - 1 ? button(`down:${path}:${index}`, 'arrow-down', '아래로 이동') : ''}${button(`remove:${path}:${index}`, 'x', '항목 삭제', 'danger')}</div>`;
}
function profileView() {
  const p = state.drafts.profile || state.content.profile;
  return `<section class="single-panel">${header('프로필')}<form class="form" id="profile-form">
    <div class="form-row">${field('이름 (한글)', p.names[0], 'names.0')}${field('이름 (한자)', p.names[1], 'names.1')}</div>${field('이름 (영문)', p.names[2], 'names.2')}
    <label>소개 문장<textarea data-path="roles-text" rows="3">${esc(p.roles.join('\n'))}</textarea></label>${field('이메일', p.email, 'email', 'email')}${field('프로필 사진 주소', p.photo, 'photo')}
    <h2 class="section-title">외부 링크</h2>${p.links.map((l, i) => `<div class="repeat-row">${field('이름', l.label, `links.${i}.label`)}${field('주소', l.url, `links.${i}.url`, 'url')}${arrayControls('links', i, p.links.length)}</div>`).join('')}
    <button class="quiet" data-action="add:links" type="button">${icon('plus')}링크 추가</button>
    <h2 class="section-title">YouTube</h2>${field('채널 주소', p.youtube?.url, 'youtube.url', 'url')}${field('제목', p.youtube?.title, 'youtube.title')}${field('썸네일 주소', p.youtube?.thumbnail, 'youtube.thumbnail', 'url')}
    </form>${statusLine()}</section>`;
}
function aboutView() {
  const a = state.drafts.about || state.content.about;
  return `<section class="single-panel">${header('소개·이력')}<form id="about-form" class="form"><h2 class="section-title">기본 정보</h2>
    ${a.facts.map((f, i) => `<div class="repeat-row">${field('항목', f.k, `facts.${i}.k`)}${field('내용', f.v, `facts.${i}.v`)}${arrayControls('facts', i, a.facts.length)}</div>`).join('')}
    <button class="quiet" data-action="add:facts" type="button">${icon('plus')}기본 정보 추가</button><h2 class="section-title">이력</h2>
    ${a.groups.map((g, gi) => `<section class="about-group"><div class="group-heading">${field('연도·묶음 이름', g.h, `groups.${gi}.h`)}${arrayControls('groups', gi, a.groups.length)}</div>
      ${g.items.map((raw, i) => { const it = item(raw); return `<div class="group-item"><div class="repeat-row"><label>항목<textarea data-path="groups.${gi}.items.${i}.t" rows="2">${esc(it.t)}</textarea></label>${arrayControls(`groups.${gi}.items`, i, g.items.length)}</div>
        <div class="form-row">${field('관련 홈페이지', it.url, `groups.${gi}.items.${i}.url`, 'url')}${imageField(it.img, `groups.${gi}.items.${i}.img`)}</div></div>`; }).join('')}
      <button class="quiet" data-action="add:groups.${gi}.items" type="button">${icon('plus')}이력 항목 추가</button></section>`).join('')}
    <button class="quiet" data-action="add:groups" type="button">${icon('plus')}연도·묶음 추가</button></form>${statusLine()}</section>`;
}
function render() {
  main.innerHTML = shell(state.tab === 'works' ? worksView() : state.tab === 'profile' ? profileView() : aboutView());
  main.querySelectorAll('form').forEach(f => f.addEventListener('submit', e => { e.preventDefault(); publish(); }));
}
function valueAt(value, path) { return path.split('.').reduce((o, k) => o[k], value); }
function ensureDraft() {
  if (!state.drafts[state.tab]) state.drafts[state.tab] = clone(state.content[state.tab]);
  if (state.tab === 'about') state.drafts.about.groups.forEach(g => { g.items = g.items.map(item); });
  return state.drafts[state.tab];
}
function setPath(value, path, next) {
  const parts = path.split('.');
  let target = value;
  for (const part of parts.slice(0, -1)) { target[part] ??= {}; target = target[part]; }
  target[parts.at(-1)] = next;
}
function setBusy(yes) {
  state.busy = yes;
  main.querySelectorAll('button, input, textarea, select').forEach(el => { el.disabled = yes; });
  logout.disabled = yes;
}
function status(message, failure = false) {
  const el = document.getElementById('save-status');
  if (el) { el.textContent = message; el.classList.toggle('error', failure); }
}
function downloadDrafts() {
  const blob = new Blob([JSON.stringify({ format: 'kimwonho-editor-drafts-v1', ...state.drafts }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: `kimwonho-drafts-${today()}.json` });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function save(section, value) {
  if (state.busy) return false;
  setBusy(true); status('GitHub에 저장하고 있습니다.');
  try {
    // Drafts retain their original revision, so reloading cannot silently bless stale edits.
    const result = await api('content', { method: 'PUT', body: JSON.stringify({ sha: state.drafts.baseSha || state.content.sha, section, value }) });
    state.content = result; state.drafts.baseSha = result.sha;
    return true;
  } catch (e) {
    status(e.message, true); notice(e.message, true);
    if (e.status === 401) notice('로그인이 만료되었습니다. 임시저장 파일을 내려받은 뒤 새로고침하여 다시 로그인해 주세요.', true);
    return false;
  } finally { setBusy(false); }
}
async function publish() {
  if (state.busy) return;
  const form = main.querySelector('form');
  if (form && !form.reportValidity()) return;
  if (state.tab === 'works') {
    if (!state.post.title.trim() || !state.post.body.trim()) { status('제목과 본문을 입력해 주세요.', true); return; }
    const next = clone(state.content.works), index = next.findIndex(w => w.id === state.post.id);
    if (index < 0) next.unshift(clone(state.post)); else next[index] = clone(state.post);
    if (!await save('works', next)) return;
    delete state.drafts.posts[state.post.id];
  } else {
    if (!await save(state.tab, state.drafts[state.tab] || state.content[state.tab])) return;
    delete state.drafts[state.tab];
  }
  if (!hasDrafts()) delete state.drafts.baseSha;
  persist(); render(); status('저장 완료. 공개 홈페이지에는 배포가 끝난 뒤 반영됩니다.'); notice('저장했습니다. 홈페이지에 반영되는 데 잠시 시간이 걸립니다.');
}
async function deletePost() {
  const post = state.post;
  if (!confirm(`「${post.title}」을 공개 홈페이지에서 삭제할까요?`)) return;
  if (!await save('works', state.content.works.filter(w => w.id !== post.id))) return;
  delete state.drafts.posts[post.id]; state.post = newPost(); persist(); render(); notice('글을 삭제했습니다.');
}
async function reloadContent() {
  if (state.busy) return;
  if (hasDrafts() && !confirm('최신 내용을 불러옵니다. 현재 탭의 임시저장 내용은 유지되며, 다른 곳의 변경과 충돌하는 초안은 게시되지 않습니다. 계속할까요?')) return;
  setBusy(true);
  try {
    state.content = await api('content');
    if (!hasDrafts()) {
      delete state.drafts.baseSha;
      state.post = clone(state.content.works.find(w => w.id === state.post?.id) || newPost());
    }
    render(); notice('최신 내용을 불러왔습니다.');
  }
  catch (e) { notice(e.message, true); }
  finally { setBusy(false); }
}
async function discardDrafts() {
  if (!hasDrafts()) { notice('버릴 임시저장 내용이 없습니다.'); return; }
  if (!confirm('이 탭의 모든 임시저장 내용을 버리고 서버의 최신 내용으로 다시 시작할까요? 게시된 글은 삭제되지 않습니다.')) return;
  setBusy(true);
  try {
    state.content = await api('content'); state.drafts = { posts: {} }; state.post = newPost(); state.preview = false; persist(); render(); notice('최신 내용으로 다시 시작합니다.');
  } catch (e) { notice(e.message, true); }
  finally { setBusy(false); }
}

main.addEventListener('input', e => {
  if (state.busy || !state.content) return;
  const el = e.target;
  if (el.id === 'search') { state.search = el.value; document.getElementById('posts').innerHTML = postList(); return; }
  if (el.closest('#post-form') && el.name) {
    state.post[el.name] = el.value; draft('works', state.post); document.getElementById('posts').innerHTML = postList(); return;
  }
  if (el.dataset.path) {
    const value = ensureDraft();
    if (el.dataset.path === 'roles-text') value.roles = el.value.split('\n');
    else setPath(value, el.dataset.path, el.value);
    draft(state.tab, value);
  }
});
main.addEventListener('change', e => {
  if (e.target.id === 'filter') { state.filter = e.target.value; document.getElementById('posts').innerHTML = postList(); }
});
main.addEventListener('keydown', e => {
  if (e.target.getAttribute('role') !== 'tab' || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key) || state.busy) return;
  e.preventDefault();
  const tabs = [...main.querySelectorAll('[role=tab]')], current = tabs.indexOf(e.target);
  const next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (current + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  state.tab = tabs[next].dataset.tab; state.preview = false; render(); main.querySelectorAll('[role=tab]')[next].focus();
});
main.addEventListener('click', async e => {
  const el = e.target.closest('button');
  if (!el || state.busy) return;
  if (el.dataset.tab) { state.tab = el.dataset.tab; state.preview = false; render(); return; }
  if (el.dataset.mode) { state.preview = el.dataset.mode === 'preview'; render(); return; }
  if (el.dataset.post) {
    state.post = clone(state.drafts.posts[el.dataset.post] || state.content.works.find(w => w.id === el.dataset.post)); state.preview = false; render(); return;
  }
  const action = el.dataset.action;
  if (!action) return;
  if (action === 'new') { state.post = newPost(); state.preview = false; render(); main.querySelector('[name=title]')?.focus(); return; }
  if (action === 'publish') return publish();
  if (action === 'delete') return deletePost();
  if (action === 'reload') return reloadContent();
  if (action === 'backup') return downloadDrafts();
  if (action === 'discard') return discardDrafts();
  const [kind, path, rawIndex] = action.split(':');
  if (kind === 'clear-image') {
    const value = ensureDraft(); setPath(value, path, ''); draft(state.tab, value); render(); return;
  }
  const value = ensureDraft(), list = valueAt(value, path), index = Number(rawIndex);
  if (kind === 'add') {
    list.push(path === 'facts' ? { k: '', v: '' } : path === 'groups' ? { h: '', items: [] } : path === 'links' ? { label: '', url: '', icon: 'blog' } : { t: '', url: '', img: '' });
  } else if (kind === 'remove') {
    if (path === 'groups' && list[index].items.length && !confirm('이 묶음의 이력 항목도 함께 삭제할까요? 저장 후 게시해야 홈페이지에 반영됩니다.')) return;
    list.splice(index, 1);
  } else if (kind === 'up' && index > 0) [list[index - 1], list[index]] = [list[index], list[index - 1]];
  else if (kind === 'down' && index < list.length - 1) [list[index + 1], list[index]] = [list[index], list[index + 1]];
  draft(state.tab, value); render();
});
logout.addEventListener('click', async () => {
  if (state.busy) return;
  if (hasDrafts() && !confirm('게시하지 않은 임시저장 내용이 있습니다. 로그아웃하면 이 탭의 초안도 지워집니다. 먼저 내려받지 않고 로그아웃할까요?')) return;
  try {
    await api('logout', { method: 'POST', body: '{}' });
    sessionStorage.removeItem(draftKey); state.session = null; state.content = null; state.drafts = { posts: {} }; loginView();
  } catch (e) { notice(e.message, true); }
});
window.addEventListener('beforeunload', e => { if (hasDrafts() || state.busy) { e.preventDefault(); e.returnValue = ''; } });
boot();
