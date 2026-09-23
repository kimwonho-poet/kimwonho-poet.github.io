import { renderRich, validateRich, plainText } from './rich-text.mjs';
import { textSignature } from './reader.mjs';

export const documentKinds = { poem: '시', prose: '산문', play: '희곡', review: '심사평', speech: '수상소감', interview: '인터뷰', record: '관련 기록' };
export const documentExtents = { full: '전문', excerpt: '일부', reprint: '전재본', general: '전체 심사총평' };
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sourceText = value => esc(value).replace(/^(\[(?:출처 |핵심 지면 모음)[^\n]*\])$/gm, '<span class="document-transcription-note">$1</span>');
const icon = name => `<svg aria-hidden="true" viewBox="0 0 24 24"><use href="assets/editor/icons.svg#${name}"></use></svg>`;
export const activityId = item => item.id || 'activity-' + textSignature(item.t + '\n' + (item.url || ''));
export const emptyDetail = () => ({ year: '', distinction: '', summary: '', documents: [], sources: [] });
export function activityEntries(about) {
  return about.groups.flatMap(group => group.items.map(raw => {
    const item = typeof raw === 'string' ? { t: raw, url: '', img: '' } : raw;
    return { ...item, id: activityId(item), group: group.h, detail: item.detail || emptyDetail() };
  }));
}

export function validateDetail(detail) {
  const bad = () => { throw Object.assign(new Error('상세 페이지의 제목, 본문, 출처 또는 자료 형식을 확인해 주세요.'), { status: 400 }); };
  const text = (value, max) => { if (typeof value !== 'string' || value.length > max) bad(); };
  const link = value => { text(value, 2048); if (!value) return; try { if (['http:', 'https:'].includes(new URL(value).protocol)) return; } catch {} bad(); };
  if (!detail || typeof detail !== 'object') bad();
  text(detail.year ?? '', 200); text(detail.distinction ?? '', 500); text(detail.summary ?? '', 10000);
  if (!Array.isArray(detail.documents) || detail.documents.length > 100 || !Array.isArray(detail.sources) || detail.sources.length > 100) bad();
  const ids = new Set();
  for (const doc of detail.documents) {
    if (!doc || typeof doc !== 'object' || typeof doc.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(doc.id) || ids.has(doc.id)) bad();
    ids.add(doc.id);
    if (!Object.hasOwn(documentKinds, doc.kind) || !Object.hasOwn(documentExtents, doc.extent)) bad();
    text(doc.title, 500); text(doc.body, 200000); text(doc.note ?? '', 5000); text(doc.source ?? '', 2000); link(doc.url ?? '');
    if (!doc.title.trim() || !doc.body.trim()) bad();
    if (doc.rich) { validateRich(doc.rich); if (plainText(doc.rich) !== doc.body) bad(); }
  }
  for (const source of detail.sources) { if (!source || typeof source !== 'object') bad(); text(source.label, 500); link(source.url); if (!source.label.trim() || !source.url) bad(); }
  return detail;
}

export function renderDocument(doc) {
  const prose = doc.kind !== 'poem';
  const content = doc.rich ? `<div class="rich-body document-rich">${renderRich(doc.rich, doc.id + '-')}</div>` : prose
    ? doc.body.split(/\n{2,}/).map(p => `<p>${sourceText(p)}</p>`).join('')
    : `<div class="document-poem">${sourceText(doc.body)}</div>`;
  return `<section class="activity-document document--${esc(doc.kind)}" id="activity-doc-${esc(doc.id)}" tabindex="-1">
    <div class="document-heading"><p class="document-kind">${documentKinds[doc.kind]}<span>${documentExtents[doc.extent]}</span></p><h2>${esc(doc.title)}</h2></div>
    ${doc.note ? `<p class="document-notice">${esc(doc.note)}</p>` : ''}
    <div class="document-text">${content}</div>
    ${doc.source || doc.url ? `<p class="document-source">${doc.source ? esc(doc.source) : ''}${doc.url ? ` <a href="${esc(doc.url)}" target="_blank" rel="noopener noreferrer">원문 보기 ${icon('external-link')}</a>` : ''}</p>` : ''}
  </section>`;
}
export function renderActivityContents(entry) {
  const detail = entry.detail || emptyDetail();
  const sources = [{ label: '관련 홈페이지', url: entry.url }, ...detail.sources].filter(s => s.url);
  const seen = new Set();
  const uniqueSources = sources.filter(s => { if (seen.has(s.url)) return false; seen.add(s.url); return true; });
  return `<div class="activity-heading">${entry.img ? `<img class="activity-image" src="${esc(entry.img)}" alt="${esc(entry.t)}" loading="lazy">` : ''}<p class="activity-category">${esc(entry.group)}${detail.year ? ' · ' + esc(detail.year) : ''}</p><h1 class="w-title">${esc(entry.t)}</h1>${detail.distinction ? `<p class="activity-distinction">${esc(detail.distinction)}</p>` : ''}${detail.summary ? `<p class="activity-summary">${esc(detail.summary)}</p>` : ''}</div>
    ${detail.documents.length ? `<nav class="activity-toc" aria-label="이 페이지의 자료"><h2>수록 자료</h2><ol>${detail.documents.map(doc => `<li><a href="#/about/${encodeURIComponent(entry.id)}/${encodeURIComponent(doc.id)}" data-reading-target="activity-doc-${esc(doc.id)}"><span>${documentKinds[doc.kind]}</span>${esc(doc.title)}</a></li>`).join('')}</ol></nav>` : ''}
    <div class="w-body activity-body">${detail.documents.map(renderDocument).join('')}</div>
    ${uniqueSources.length ? `<section class="activity-sources" aria-label="관련 링크"><h2>관련 링크</h2><ul>${uniqueSources.map(s => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.label)}${icon('external-link')}</a></li>`).join('')}</ul></section>` : ''}`;
}
