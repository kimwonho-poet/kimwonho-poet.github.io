import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readerPreferences, textSignature, isLongReading, readingPoint, validPosition } from '../lib/reader.mjs';
import { plainDoc, plainText, renderRich, validateRich } from '../lib/rich-text.mjs';
import { readContent, replaceContent } from '../lib/content.mjs';
import { readingFixtures } from './reading-fixtures.mjs';

test('reading preferences accept only supported sizes and themes', () => {
  assert.deepEqual(readerPreferences(null), { size: 18, theme: 'light' });
  assert.deepEqual(readerPreferences({ size: 100, theme: 'javascript:' }), readerPreferences());
  for (const size of [16, 18, 20, 22, 24]) for (const theme of ['light', 'soft', 'dark']) assert.deepEqual(readerPreferences({ size, theme }), { size, theme });
});
test('resume applies only to long prose and research, never poems', () => {
  assert.equal(isLongReading('poem', 50000), false);
  assert.equal(isLongReading('prose', 1199), false);
  assert.equal(isLongReading('prose', 1200), true);
  assert.equal(isLongReading('research', 3000), true);
});
test('positions use paragraph-relative anchors and clamp bounds', () => {
  assert.equal(readingPoint([], 100), null);
  const blocks = [{ top: -100, height: 100 }, { top: 0, height: 200 }, { top: 200, height: 500 }];
  assert.deepEqual(readingPoint(blocks, 100), { block: 1, fraction: .5 });
  assert.deepEqual(readingPoint(blocks, -200), { block: 0, fraction: 0 });
  assert.deepEqual(readingPoint(blocks, 900), { block: 2, fraction: 1 });
});
test('expired, malformed, and edited-content positions are rejected', () => {
  const now = 1800000000000, signature = textSignature('원문\n    공백');
  const value = { block: 4, fraction: .5, at: now - 1000, signature };
  assert.equal(validPosition(value, signature, now), true);
  assert.equal(validPosition(value, textSignature('수정된 본문'), now), false);
  for (const update of [{ block: -1 }, { block: .5 }, { fraction: 2 }, { fraction: NaN }, { at: now + 100 }, { at: now - 90 * 86400000 }]) assert.equal(validPosition({ ...value, ...update }, signature, now), false);
});
test('poetry retains exact spaces, tabs, stanza breaks, and terminal newline', () => {
  const text = readingFixtures[0].body;
  assert.equal(plainText(plainDoc(text)), text);
  const rendered = renderRich(plainDoc(text));
  assert.ok(rendered.includes('    네 칸'));
  assert.ok(rendered.includes('\t탭'));
  assert.ok(rendered.includes('<p><br></p>'));
});
test('footnotes are numbered in order, escaped, and round trip with content', () => {
  const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const output = replaceContent(source, 'works', readingFixtures);
  assert.deepEqual(readContent(output).works, readingFixtures);
  assert.deepEqual(readContent(output).about, readContent(source).about);
  const html = renderRich(readingFixtures[2].rich);
  assert.match(html, /id="note-ref-1"/);
  assert.match(html, /id="note-2"/);
  assert.match(html, /data-note-target="note-ref-2"/);
  assert.match(html, /&lt;태그&gt;/);
  assert.equal((html.match(/class="footnote-ref"/g) || []).length, 2);
  assert.equal((plainText(readingFixtures[2].rich).match(/\[주\]/g) || []).length, 2);
});
test('footnote validation rejects empty notes, excess notes, and executable markup remains text', () => {
  const doc = text => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'footnote', attrs: { text } }] }] });
  for (const value of ['', ' ', null, {}, 'x'.repeat(5001)]) assert.throws(() => validateRich(doc(value)));
  assert.throws(() => validateRich({ type: 'doc', content: Array.from({ length: 201 }, () => doc('x').content[0]) }));
  const rendered = renderRich(doc('<img src=x onerror=alert(1)>'));
  assert.ok(!rendered.includes('<img'));
  assert.ok(rendered.includes('&lt;img'));
});
test('reading preview fixtures are absent from published content', () => {
  const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(!source.includes('qa-poem'));
  assert.ok(!source.includes('qa-essay'));
});
