import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { activityId, activityEntries, emptyDetail, validateDetail, renderDocument, renderActivityContents } from '../lib/activities.mjs';
import { readContent, replaceContent } from '../lib/content.mjs';
import { plainDoc, plainText, renderRich } from '../lib/rich-text.mjs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const about = readContent(html).about;
const entries = activityEntries(about);
const sample = () => ({ ...emptyDetail(), documents: [{ id: 'poem-1', kind: 'poem', extent: 'full', title: '시', body: '    첫 행\n둘째 행\n\n\t마지막 행\n', source: '출처', url: 'https://example.com/poem' }] });

test('all biography entries have unique stable internal destinations and keep original links', () => {
  assert.equal(new Set(entries.map(e => e.id)).size, entries.length);
  for (const entry of entries) {
    assert.ok(entry.url);
    assert.equal(activityId({ ...entry, t: '제목 수정' }), entry.id);
    assert.ok(renderActivityContents(entry).includes(entry.url.replaceAll('&', '&amp;')));
    validateDetail(entry.detail);
  }
});
test('detail metadata and source links round trip without touching works or profile', () => {
  const copy = structuredClone(about);
  copy.groups[0].items[0].detail = sample();
  const changed = readContent(replaceContent(html, 'about', copy));
  assert.deepEqual(changed.about, copy);
  assert.deepEqual(changed.works, readContent(html).works);
  assert.deepEqual(changed.profile, readContent(html).profile);
});
test('detail validation rejects duplicate IDs, unsupported types, invalid links and blank text', () => {
  for (const mutate of [
    d => d.documents.push({ ...d.documents[0] }),
    d => d.documents.push(null),
    d => delete d.documents[0].id,
    d => d.documents[0].id = '" onclick="x',
    d => d.documents[0].kind = 'script',
    d => d.documents[0].extent = 'unknown',
    d => d.documents[0].url = 'javascript:alert(1)',
    d => d.documents[0].body = ' ',
    d => d.documents[0].title = '',
    d => d.sources.push({ label: '출처', url: 'data:text/html,x' }),
    d => d.sources.push(null),
    d => d.documents[0].rich = plainDoc('다른 본문'),
  ]) { const detail = sample(); mutate(detail); assert.throws(() => validateDetail(detail)); }
  const copy = structuredClone(about);
  copy.groups[0].items[1].id = copy.groups[0].items[0].id;
  assert.throws(() => replaceContent(html, 'about', copy));
});
test('poems preserve exact whitespace and markup stays inert', () => {
  const doc = sample().documents[0];
  assert.ok(renderDocument(doc).includes(`<div class="document-poem">${doc.body}</div>`));
  doc.body = '<script>alert("x")</script>\n&';
  assert.ok(!renderDocument(doc).includes('<script>'));
  assert.ok(renderDocument(doc).includes('&lt;script&gt;'));
  doc.rich = plainDoc(doc.body);
  assert.equal(plainText(doc.rich), doc.body);
  validateDetail({ ...emptyDetail(), documents: [doc] });
});
test('multiple rich documents namespace footnotes and back references', () => {
  const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'footnote', attrs: { text: '주석' } }] }] };
  for (const prefix of ['document-1-', 'document-2-']) {
    const output = renderRich(doc, prefix);
    assert.ok(output.includes(`id="${prefix}note-1"`));
    assert.ok(output.includes(`data-note-target="${prefix}note-ref-1"`));
  }
});
test('empty detail pages retain sources without empty reading placeholders', () => {
  const result = renderActivityContents({ id: 'empty', t: '이력', group: '기타', url: 'https://example.com', detail: emptyDetail() });
  assert.ok(result.includes('관련 홈페이지'));
  assert.ok(!result.includes('수록 자료'));
  assert.ok(!result.includes('activity-document'));
});
