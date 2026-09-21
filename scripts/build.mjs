import { cp, mkdir, rm } from 'node:fs/promises';

await rm('public', { recursive: true, force: true });
await mkdir('public', { recursive: true });
for (const file of ['index.html', 'admin.html', 'editor-config.json', 'profile.jpg', 'field.png', 'apple-touch-icon.png', 'assets']) {
  await cp(file, `public/${file}`, { recursive: true, filter: path => !path.endsWith('.md') });
}
