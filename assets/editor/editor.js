import { createComposer, prepareImage, renderRich, plainDoc, plainText } from './composer.bundle.js';
const main = document.getElementById('editor-main');
const logout = document.getElementById('logout');
const sections = { poem: '시', prose: '산문·비평', research: '연구' };
const publicOrigin = 'https://kimwonho-poet.github.io';
const draftKey = 'portfolio-editor-drafts-v1';
const state = { session: null, content: null, tab: 'works', post: null, drafts: { posts: {} }, bases: {}, revisions: {}, busy: false, preview: false, search: '', filter: '', listOpen: false, focus: false, storageFailed: false };
let composer = null;
let panel = null;
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
const storagePrefix = () => `portfolio-draft-v2:${state.session.login}:`;
const currentKey = () => state.tab === 'works' ? 'post:' + state.post.id : state.tab;
const valueForKey = (content, key) => key.startsWith('post:') ? content.works.find(w => w.id === key.slice(5)) || null : content[key];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function persist(key, value) {
  try {
    if (key) {
      const previous = JSON.parse(localStorage.getItem(storagePrefix() + key) || 'null');
      if (previous?.revision !== state.revisions[key] && previous) throw new Error('다른 탭에서 같은 초안이 바뀌었습니다. 이 탭의 내용을 내려받아 보관한 뒤 새로고침해 주세요.');
      const revision = crypto.randomUUID();
      localStorage.setItem(storagePrefix() + key, JSON.stringify({ value, base: state.bases[key], revision, updatedAt: Date.now() }));
      state.revisions[key] = revision;
    }
    state.storageFailed = false;
    const el = document.getElementById('draft-status');
    if (el) el.textContent = hasDrafts() ? '이 기기에 자동 저장됨' : '저장된 내용';
  } catch (e) { state.storageFailed = true; notice(e.message.startsWith('다른 탭') ? e.message : '기기 저장 공간이 부족합니다. 초안을 내려받아 보관해 주세요.', true); }
}
function restore() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const name = localStorage.key(i);
      if (!name.startsWith(storagePrefix())) continue;
      const key = name.slice(storagePrefix().length), record = JSON.parse(localStorage.getItem(name));
      if (!record?.value || !record.revision) continue;
      if (key.startsWith('post:')) state.drafts.posts[key.slice(5)] = record.value;
      else if (['about', 'profile'].includes(key)) state.drafts[key] = record.value;
      else continue;
      state.bases[key] = record.base; state.revisions[key] = record.revision;
    }
    const legacy = JSON.parse(sessionStorage.getItem(draftKey) || 'null');
    if (legacy?.posts && !hasDrafts()) {
      if (legacy.baseSha && legacy.baseSha !== state.content.sha) state.legacyConflict = true;
      state.drafts = legacy;
      Object.values(legacy.posts).forEach(value => draft('works', value));
      for (const section of ['about', 'profile']) if (legacy[section]) draft(section, legacy[section]);
      sessionStorage.removeItem(draftKey);
    }
  } catch {}
}
function draft(section, value) {
  const key = section === 'works' ? 'post:' + value.id : section;
  if (!Object.hasOwn(state.bases, key)) state.bases[key] = clone(valueForKey(state.content, key));
  if (section === 'works') state.drafts.posts[value.id] = clone(value);
  else state.drafts[section] = clone(value);
  persist(key, value);
}
function clearDraft(key) {
  try { localStorage.removeItem(storagePrefix() + key); } catch {}
  delete state.bases[key]; delete state.revisions[key];
  if (key.startsWith('post:')) delete state.drafts.posts[key.slice(5)]; else delete state.drafts[key];
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
    ${configured ? `<label class="remember"><input id="remember" type="checkbox" checked>이 기기에서 로그인 유지 <span>30일</span></label><a id="login-link" class="button primary" href="/api/editor?action=login&remember=1">${icon('log-in')} GitHub로 로그인</a>` : '<p>인증 서버 연결을 마치면 이곳에서 로그인할 수 있습니다.</p>'}
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
    if (hasDrafts()) notice('이 기기에 저장된 초안을 이어서 엽니다.');
  } catch (e) {
    loginView(e.message, e.configured !== false && e.status !== 404);
  }
}

function shell(content) {
  return `<div class="workspace"><div class="workspace-top"><div class="tabs" role="tablist" aria-label="편집 구역">
    ${[['works', '글'], ['profile', '프로필'], ['about', '소개·이력']].map(([key, name]) => `<button type="button" role="tab" aria-selected="${state.tab === key}" data-tab="${key}">${name}</button>`).join('')}
    </div><p>${state.session.remembered ? '이 기기 로그인 유지 중' : '<a href="/api/editor?action=login&remember=1">이 기기 로그인 유지 켜기</a>'}</p></div>${content}</div>`;
}
function statusLine() { return '<p id="save-status" class="status-line" role="status" aria-live="polite"></p>'; }
function header(title, publishLabel = '저장 후 게시') {
  return `<div class="editing-header"><div class="heading-title">${state.tab === 'works' ? button('toggle-list', 'panel-left', '글 목록 열기·닫기') : ''}<div><h1>${title}</h1><p id="draft-status">${hasDrafts() ? '이 기기에 자동 저장됨' : '저장된 내용'}</p></div></div>
    <div class="editing-actions">${state.tab === 'works' ? button('preview', 'eye', state.preview ? '작성으로 돌아가기' : '미리보기') + button('focus', state.focus ? 'minimize-2' : 'maximize-2', '집중 모드') : ''}
    <details class="more-menu"><summary title="더 보기" aria-label="더 보기">${icon('more-horizontal')}</summary><div>${button('backup', 'download', '초안 내려받기')}${button('discard', 'x', '현재 초안 버리기')}${button('reload', 'refresh-cw', '최신 내용 불러오기')}</div></details>
    <button class="primary" type="button" data-action="publish">${icon('check')}${state.tab === 'works' ? '발행' : publishLabel}</button></div></div>`;
}
function postList() {
  const map = new Map(state.content.works.map(w => [w.id, w]));
  Object.values(state.drafts.posts).forEach(w => map.set(w.id, w));
  const posts = [...map.values()].filter(w => (!state.filter || w.section === state.filter || (state.filter === 'drafts' && state.drafts.posts[w.id])) && (w.title + '\n' + w.body).toLocaleLowerCase().includes(state.search.toLocaleLowerCase())).sort((a, b) => b.date.localeCompare(a.date));
  return posts.length ? `<ul class="post-list">${posts.map(w => `<li><button type="button" data-post="${esc(w.id)}" aria-current="${w.id === state.post.id}"><strong>${esc(w.title || '제목 없는 글')}</strong><small>${esc(sections[w.section])} · ${esc(w.date)}${state.drafts.posts[w.id] ? ' · 임시저장' : ''}</small></button></li>`).join('')}</ul>` : '<p class="empty">표시할 글이 없습니다.</p>';
}
function postPreview() {
  const w = state.post;
  let link = '';
  try { if (new URL(w.link).protocol === 'https:') link = `<a class="preview-link" href="${esc(w.link)}" target="_blank" rel="noopener">원문 보기 ${icon('external-link')}</a>`; } catch {}
  return `<article class="preview"><h2>${esc(w.title || '제목 없는 글')}</h2><p class="meta">${esc(w.date)}${w.meta ? ' · ' + esc(w.meta) : ''}</p><div class="rich-body">${renderRich(w.rich || plainDoc(w.body))}</div>${w.note ? `<p class="preview-note">${esc(w.note)}</p>` : ''}${link}</article>`;
}
function toolbar() {
  const tool = (command, name, label) => `<button type="button" data-format="${command}" title="${label}" aria-label="${label}" aria-pressed="false">${icon(name)}</button>`;
  return `<div class="format-toolbar" role="toolbar" aria-label="본문 서식"><select id="text-style" aria-label="문단 스타일"><option value="p">본문</option><option value="h2">소제목 1</option><option value="h3">소제목 2</option></select><span class="tool-group">${tool('bold','bold','굵게')}${tool('italic','italic','기울임')}${tool('underline','underline','밑줄')}${tool('strike','strikethrough','취소선')}</span><span class="tool-group">${tool('left','align-left','왼쪽 정렬')}${tool('center','align-center','가운데 정렬')}${tool('right','align-right','오른쪽 정렬')}</span><span class="tool-group">${tool('blockquote','quote','인용')}${tool('bulletList','list','글머리 목록')}${tool('orderedList','list-ordered','번호 목록')}${tool('horizontalRule','minus','구분선')}</span><span class="tool-group">${tool('footnote','superscript','각주')}${tool('link','link','링크')}${tool('image','image','사진 넣기')}</span><span class="tool-group">${tool('undo','undo-2','실행 취소')}${tool('redo','redo-2','다시 실행')}</span></div>`;
}
function worksView() {
  const w = state.post;
  const existing = state.content.works.some(p => p.id === w.id);
  return `<div class="work-layout ${state.listOpen ? 'list-open' : ''} ${state.focus ? 'focus-mode' : ''}"><aside class="sidebar"><div class="sidebar-head"><h2>글 보관함</h2>${button('new', 'plus', '새 글 쓰기')}</div>
    <div class="sidebar-filters"><input id="search" type="search" placeholder="글 검색" aria-label="글 검색" value="${esc(state.search)}"><select id="filter" aria-label="분류 필터"><option value="">전체 글</option><option value="drafts" ${state.filter === 'drafts' ? 'selected' : ''}>임시저장</option>${Object.entries(sections).map(([v, t]) => `<option value="${v}" ${state.filter === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div><div id="posts">${postList()}</div></aside>
    <section class="editing">${header(existing ? '글 수정' : '새 글', existing ? '수정 후 게시' : '게시하기')}
    ${state.preview ? `<div class="preview-heading"><span>미리보기</span><button class="quiet" data-action="preview" type="button">${icon('pencil')}계속 쓰기</button></div>${postPreview()}` : `${toolbar()}<form id="post-form" class="form writing-sheet"><label class="title-label"><span class="sr-only">제목</span><input class="post-title" name="title" value="${esc(w.title)}" required maxlength="300" placeholder="제목을 입력하세요"></label><div id="composer"></div><div class="writing-bottom"><span id="word-count">${w.body.length.toLocaleString()}자</span><button type="button" class="quiet" data-action="post-settings">${icon('settings-2')}글 설정</button></div></form>`}
    ${statusLine()}${existing ? `<div class="editing-actions bottom-actions"><a class="published-link" href="${publicOrigin}/#/w/${encodeURIComponent(w.id)}" target="_blank" rel="noopener">게시된 글 보기</a><button class="quiet danger" type="button" data-action="delete">${icon('trash-2')}글 삭제</button></div>` : ''}</section></div>`;
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
    <label>소개 문장<textarea data-path="roles-text" rows="3">${esc(p.roles.join('\n'))}</textarea></label>${field('이메일', p.email, 'email', 'email')}<div class="profile-photo-row"><img class="profile-preview" src="${esc(p.photo.startsWith('data:') || /^https?:/.test(p.photo) ? p.photo : publicOrigin + '/' + p.photo)}" alt="프로필 사진"><button type="button" class="quiet" data-action="profile-photo">${icon('image')}사진 변경</button></div>
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
  composer?.destroy(); composer = null;
  main.innerHTML = shell(state.tab === 'works' ? worksView() : state.tab === 'profile' ? profileView() : aboutView());
  document.body.classList.toggle('writing-focus', state.focus && state.tab === 'works');
  main.querySelectorAll('form').forEach(f => f.addEventListener('submit', e => e.preventDefault()));
  if (document.getElementById('composer')) {
    composer = createComposer(document.getElementById('composer'), state.post.rich || plainDoc(state.post.body), rich => {
      state.post.rich = rich; state.post.body = plainText(rich); draft('works', state.post);
      document.getElementById('word-count').textContent = state.post.body.length.toLocaleString() + '자';
      document.getElementById('posts').innerHTML = postList();
    }, updateToolbar, insertImages);
    updateToolbar();
  }
}
function updateToolbar() {
  if (!composer) return;
  main.querySelectorAll('[data-format]').forEach(el => {
    const cmd = el.dataset.format;
    const active = ['left', 'center', 'right'].includes(cmd) ? composer.isActive({ textAlign: cmd }) : composer.isActive(cmd);
    el.setAttribute('aria-pressed', String(active));
    if (cmd === 'undo' || cmd === 'redo') el.disabled = state.busy || !composer.can()[cmd]();
  });
  const select = document.getElementById('text-style');
  if (select) select.value = composer.isActive('heading', { level: 2 }) ? 'h2' : composer.isActive('heading', { level: 3 }) ? 'h3' : 'p';
}
function dialog(title, body, submitLabel, submit) {
  panel?.remove();
  panel = document.createElement('dialog'); panel.className = 'editor-dialog';
  panel.innerHTML = `<form><div class="dialog-heading"><h2>${title}</h2><button class="icon-button quiet" type="button" data-close aria-label="닫기">${icon('x')}</button></div><div class="form">${body}</div><p class="dialog-error" role="alert"></p><div class="dialog-actions"><button type="button" data-close>취소</button><button class="primary" type="submit">${submitLabel}</button></div></form>`;
  document.body.append(panel);
  panel.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', () => panel.close()));
  panel.addEventListener('close', () => { panel.remove(); panel = null; });
  panel.querySelector('form').addEventListener('submit', async event => {
    event.preventDefault();
    const active = panel, form = event.target;
    if (!form.reportValidity()) return;
    const submitButton = form.querySelector('[type=submit]'); submitButton.disabled = true;
    try { if (await submit(new FormData(form)) !== false) active.close(); }
    catch (e) { active.querySelector('.dialog-error').textContent = e.message; }
    finally { submitButton.disabled = false; }
  });
  panel.showModal();
}
function postSettings(publishing = false) {
  const w = state.post;
  if (publishing && (!w.title.trim() || !w.body.trim())) { notice('제목과 본문을 입력해 주세요.', true); main.querySelector('[name=title]')?.focus(); return; }
  dialog(publishing ? '글 발행' : '글 설정', `${publishing ? `<p class="publish-title">${esc(w.title)}</p>` : ''}<div class="form-row"><label>분류<select name="section">${Object.entries(sections).map(([v, t]) => `<option value="${v}" ${w.section === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label><label>날짜<input name="date" type="date" required value="${esc(w.date)}"></label></div><label>발표 지면<input name="meta" maxlength="1000" value="${esc(w.meta)}"></label><label>원문 링크<input name="link" type="url" maxlength="2048" placeholder="https://" value="${esc(w.link)}"></label><label>덧붙이는 말<textarea name="note" rows="3" maxlength="3000">${esc(w.note)}</textarea></label>${publishing ? '<p class="publish-visibility">공개 · 홈페이지에 게시</p>' : ''}`, publishing ? '공개 발행' : '적용', async values => {
    for (const key of ['section', 'date', 'meta', 'link', 'note']) state.post[key] = values.get(key);
    draft('works', state.post);
    if (publishing) {
      if (!await publish()) { panel.querySelector('.dialog-error').textContent = document.getElementById('save-status')?.textContent || '저장하지 못했습니다.'; return false; }
    } else render();
  });
}
async function insertImages(files, alt = '') {
  if (!composer || state.busy) return;
  const target = composer;
  setBusy(true);
  try {
    const sources = [];
    for (const file of files) sources.push(await prepareImage(file));
    if (JSON.stringify(target.getJSON()).length + sources.join('').length > 550000) throw new Error('이 글에 넣은 사진의 용량이 큽니다. 사진 수를 줄이거나 사진 주소로 넣어 주세요.');
    target.chain().focus().insertContent(sources.map(src => ({ type: 'image', attrs: { src, alt } }))).run();
    notice('사진을 넣었습니다.'); return true;
  } catch (e) { if (panel) panel.querySelector('.dialog-error').textContent = e.message; notice(e.message, true); return false; }
  finally { setBusy(false); }
}
function format(command) {
  if (!composer) return;
  if (command === 'footnote') {
    const selected = composer.isActive('footnote');
    dialog(selected ? '각주 수정' : '각주 넣기', `<label>각주 내용<textarea name="text" rows="5" maxlength="5000" required>${esc(selected ? composer.getAttributes('footnote').text : '')}</textarea></label>`, '적용', values => {
      const text = values.get('text').trim();
      if (!text) throw new Error('각주 내용을 입력해 주세요.');
      if (selected) composer.chain().focus().updateAttributes('footnote', { text }).run();
      else composer.chain().focus().insertContent({ type: 'footnote', attrs: { text } }).run();
    }); return;
  }
  if (command === 'image') {
    dialog('사진 넣기', '<label>사진 파일<input name="photos" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple></label><span class="or-divider">또는</span><label>사진 주소<input name="src" type="url" placeholder="https://"></label><label>사진 설명<input name="alt" maxlength="500"></label>', '사진 넣기', async values => {
      const files = values.getAll('photos').filter(f => f.size);
      if (files.length) return insertImages(files, values.get('alt'));
      const src = values.get('src');
      if (!src?.startsWith('https://')) throw new Error('사진 파일을 선택하거나 https:// 사진 주소를 입력해 주세요.');
      composer.chain().focus().setImage({ src, alt: values.get('alt') }).run();
    }); return;
  }
  if (command === 'link') {
    dialog('링크', `<label>주소<input name="href" type="url" value="${esc(composer.getAttributes('link').href || '')}" placeholder="https://"></label><label>표시할 글<input name="label" value="${esc(composer.state.doc.textBetween(composer.state.selection.from, composer.state.selection.to, ' '))}"></label><label class="remember"><input name="remove" type="checkbox">링크 제거</label>`, '적용', values => {
      if (values.get('remove')) { composer.chain().focus().extendMarkRange('link').unsetLink().run(); return; }
      const href = values.get('href');
      if (!/^https?:\/\//.test(href)) throw new Error('http:// 또는 https:// 주소를 입력해 주세요.');
      if (composer.state.selection.empty) composer.chain().focus().insertContent({ type: 'text', text: values.get('label') || href, marks: [{ type: 'link', attrs: { href } }] }).run();
      else composer.chain().focus().setLink({ href }).run();
    }); return;
  }
  const chain = composer.chain().focus();
  if (['left', 'center', 'right'].includes(command)) chain.setTextAlign(command).run();
  else if (command === 'horizontalRule') chain.setHorizontalRule().run();
  else if (['undo', 'redo'].includes(command)) chain[command]().run();
  else chain['toggle' + command[0].toUpperCase() + command.slice(1)]().run();
  updateToolbar();
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
  composer?.setEditable(!yes);
  if (!yes) updateToolbar();
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
  setBusy(true); status('발행하고 있습니다.');
  try {
    const key = currentKey();
    let local;
    try { local = JSON.parse(localStorage.getItem(storagePrefix() + key) || 'null'); } catch {}
    if (local && local.revision !== state.revisions[key]) throw new Error('다른 탭에서 초안이 바뀌었습니다. 초안을 내려받은 뒤 최신 내용을 확인해 주세요.');
    const latest = await api('content');
    const base = Object.hasOwn(state.bases, key) ? state.bases[key] : valueForKey(state.content, key);
    if (state.legacyConflict || !same(base, valueForKey(latest, key))) throw new Error('다른 곳에서 이 글의 원본이 수정되었습니다. 초안을 내려받은 뒤 최신 내용을 확인해 주세요. 현재 초안은 그대로 보관됩니다.');
    if (section === 'works') {
      const edited = value.find(w => w.id === state.post.id);
      value = latest.works.filter(w => w.id !== state.post.id);
      if (edited) value.unshift(edited);
    }
    const result = await api('content', { method: 'PUT', body: JSON.stringify({ sha: latest.sha, section, value }) });
    state.content = result;
    return true;
  } catch (e) {
    status(e.message, true); notice(e.message, true);
    if (e.status === 401) status('다시 로그인이 필요합니다. 초안은 이 기기에 보관되어 있습니다. 새로고침한 뒤 로그인해 주세요.', true);
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
    clearDraft('post:' + state.post.id);
  } else {
    if (!await save(state.tab, state.drafts[state.tab] || state.content[state.tab])) return;
    clearDraft(state.tab);
  }
  if (!hasDrafts()) delete state.drafts.baseSha;
  persist(); render(); status('발행 완료. 홈페이지에 반영되고 있습니다.'); notice('발행했습니다. 홈페이지 반영까지 잠시 기다려 주세요.'); return true;
}
async function deletePost() {
  const post = state.post;
  if (!confirm(`「${post.title}」을 공개 홈페이지에서 삭제할까요?`)) return;
  if (!await save('works', state.content.works.filter(w => w.id !== post.id))) return;
  clearDraft('post:' + post.id); state.post = newPost(); persist(); render(); notice('글을 삭제했습니다.');
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
  if (!confirm('현재 열어 둔 초안을 버리고 게시된 내용으로 되돌릴까요? 다른 초안과 게시된 글은 삭제되지 않습니다.')) return;
  setBusy(true);
  try {
    const key = currentKey();
    state.content = await api('content'); clearDraft(key); state.legacyConflict = false; state.post = clone(state.content.works.find(w => w.id === state.post.id) || newPost()); state.preview = false; persist(); render(); notice('현재 초안을 되돌렸습니다.');
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
  if (e.target.id === 'remember') { document.getElementById('login-link').href = '/api/editor?action=login&remember=' + (e.target.checked ? '1' : '0'); return; }
  if (e.target.id === 'text-style' && composer) {
    const value = e.target.value;
    if (value === 'p') composer.chain().focus().setParagraph().run(); else composer.chain().focus().setHeading({ level: Number(value.slice(1)) }).run();
    return;
  }
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
  const note = e.target.closest('[data-note-target]');
  if (note) {
    e.preventDefault();
    const target = document.getElementById(note.dataset.noteTarget);
    target?.focus({ preventScroll: true }); target?.scrollIntoView({ block: 'center', behavior: 'instant' });
    return;
  }
  const el = e.target.closest('button');
  if (!el || state.busy) return;
  if (el.dataset.format) { format(el.dataset.format); return; }
  if (el.dataset.tab) { state.tab = el.dataset.tab; state.preview = false; render(); return; }
  if (el.dataset.mode) { state.preview = el.dataset.mode === 'preview'; render(); return; }
  if (el.dataset.post) {
    state.post = clone(state.drafts.posts[el.dataset.post] || state.content.works.find(w => w.id === el.dataset.post)); state.preview = false; state.listOpen = false; render(); return;
  }
  const action = el.dataset.action;
  if (!action) return;
  if (action === 'new') { state.post = newPost(); state.preview = false; state.listOpen = false; render(); main.querySelector('[name=title]')?.focus(); return; }
  if (action === 'toggle-list') { state.listOpen = !state.listOpen; document.querySelector('.work-layout').classList.toggle('list-open', state.listOpen); return; }
  if (action === 'focus') { state.focus = !state.focus; document.querySelector('.work-layout').classList.toggle('focus-mode', state.focus); document.body.classList.toggle('writing-focus', state.focus); el.innerHTML = icon(state.focus ? 'minimize-2' : 'maximize-2'); return; }
  if (action === 'preview') { state.preview = !state.preview; render(); return; }
  if (action === 'post-settings') return postSettings();
  if (action === 'profile-photo') {
    dialog('프로필 사진', '<label>사진 파일<input name="photo" type="file" accept="image/jpeg,image/png,image/webp"></label><span class="or-divider">또는</span><label>사진 주소<input name="src" type="url" placeholder="https://"></label>', '적용', async values => {
      const file = values.get('photo');
      const src = file?.size ? await prepareImage(file) : values.get('src');
      if (!src || (!file?.size && !src.startsWith('https://'))) throw new Error('사진을 선택하거나 https:// 주소를 입력해 주세요.');
      const value = ensureDraft(); value.photo = src; draft('profile', value); render();
    }); return;
  }
  if (action === 'publish') return state.tab === 'works' ? postSettings(true) : publish();
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
  try {
    await api('logout', { method: 'POST', body: '{}' });
    composer?.destroy(); composer = null; document.body.classList.remove('writing-focus');
    state.session = null; state.content = null; state.drafts = { posts: {} }; state.bases = {}; state.revisions = {}; loginView();
  } catch (e) { notice(e.message, true); }
});
document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's' && state.content) { e.preventDefault(); if (!state.busy) { draft(state.tab, state.tab === 'works' ? state.post : state.drafts[state.tab] || state.content[state.tab]); if (!state.storageFailed) notice('초안을 이 기기에 저장했습니다.'); } }
  if (e.key === 'Escape' && !panel && state.focus) { state.focus = false; document.body.classList.remove('writing-focus'); document.querySelector('.work-layout')?.classList.remove('focus-mode'); }
});
window.addEventListener('beforeunload', e => { if (state.storageFailed || state.busy) { e.preventDefault(); e.returnValue = ''; } });
boot();
