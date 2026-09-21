import { readFile, writeFile, mkdir } from 'node:fs/promises';
const names = ['external-link', 'log-out', 'log-in', 'plus', 'save', 'trash-2', 'arrow-up', 'arrow-down', 'refresh-cw', 'eye', 'pencil', 'download', 'check', 'x'];
const symbols = [];
for (const name of names) {
  const svg = await readFile(`node_modules/lucide-static/icons/${name}.svg`, 'utf8');
  const body = svg.match(/<svg\b[^>]*>([\s\S]*?)<\/svg>/)?.[1];
  if (!body) throw new Error(`Missing SVG content: ${name}`);
  symbols.push(`<symbol id="${name}" viewBox="0 0 24 24">${body}</symbol>`);
}
await mkdir('assets/editor', { recursive: true });
await writeFile('assets/editor/icons.svg', `<!-- Lucide v0.468.0, ISC license -->\n<svg xmlns="http://www.w3.org/2000/svg">${symbols.join('')}</svg>`);
await writeFile('assets/editor/LICENSE-lucide.txt', await readFile('node_modules/lucide-static/LICENSE', 'utf8'));
