import { cp, mkdir, rm } from 'node:fs/promises';
import { build } from 'esbuild';

await build({ entryPoints: ['assets/editor/composer.js'], bundle: true, format: 'esm', minify: true, outfile: 'assets/editor/composer.bundle.js', target: ['safari16', 'chrome110'] });
await build({ entryPoints: ['lib/rich-text.mjs'], bundle: true, format: 'iife', globalName: 'PortfolioText', minify: true, outfile: 'assets/editor/rich-render.js', target: ['safari16', 'chrome110'] });

await rm('public', { recursive: true, force: true });
await mkdir('public', { recursive: true });
for (const file of ['index.html', 'admin.html', 'editor-config.json', 'profile.jpg', 'field.png', 'apple-touch-icon.png', 'assets']) {
  await cp(file, `public/${file}`, { recursive: true, filter: path => !path.endsWith('.md') && !path.endsWith('/composer.js') });
}
