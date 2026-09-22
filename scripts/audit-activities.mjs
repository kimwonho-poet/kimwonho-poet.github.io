import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { activityEntries } from '../lib/activities.mjs';
import { readContent } from '../lib/content.mjs';

// Optional initial-import audit; later author edits are intentionally not frozen by CI.
const manifest = JSON.parse(readFileSync(new URL('../tests/fixtures/activity-import-manifest.json', import.meta.url), 'utf8'));
const entries = activityEntries(readContent(readFileSync(new URL('../index.html', import.meta.url), 'utf8')).about);
const hash = value => createHash('sha256').update(value).digest('hex');
let lines;
if (process.argv[2]) {
  const source = readFileSync(process.argv[2], 'utf8');
  assert.equal(hash(source), manifest.sourceSha256);
  lines = source.split('\n');
}
for (const item of manifest.imported) {
  const doc = entries.find(e => e.id === item.activityId)?.detail.documents.find(d => d.id === item.documentId);
  assert.ok(doc, item.title);
  assert.equal(hash(doc.body), item.sha256, item.title);
  if (lines) assert.equal(doc.body, lines.slice(item.startLine - 1, item.endLine).join('\n').replace(/^\n+|\n+$/g, ''), item.title);
}
console.log(JSON.stringify({ entries: entries.length, documents: manifest.imported.length, sourceCompared: !!lines, exactText: true }));
