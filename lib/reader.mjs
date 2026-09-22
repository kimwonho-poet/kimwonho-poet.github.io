export const readerDefaults = { size: 18, theme: 'light' };
export function readerPreferences(value) {
  return { size: [16, 18, 20, 22, 24].includes(value?.size) ? value.size : 18, theme: ['light', 'soft', 'dark'].includes(value?.theme) ? value.theme : 'light' };
}
export function textSignature(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(36);
}
export function isLongReading(section, length) { return ['prose', 'research'].includes(section) && length >= 1200; }
export function readingPoint(blocks, line) {
  let index = 0;
  blocks.forEach((block, i) => { if (block.top <= line) index = i; });
  const block = blocks[index];
  return block ? { block: index, fraction: Math.max(0, Math.min(1, (line - block.top) / Math.max(1, block.height))) } : null;
}
export function validPosition(value, signature, now = Date.now()) {
  return value?.signature === signature && Number.isInteger(value.block) && value.block >= 0 && Number.isFinite(value.fraction) && value.fraction >= 0 && value.fraction <= 1 && Number.isFinite(value.at) && value.at <= now && now - value.at < 90 * 86400000;
}
