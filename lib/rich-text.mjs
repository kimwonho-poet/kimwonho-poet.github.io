const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const containers = new Set(['doc', 'paragraph', 'heading', 'blockquote', 'bulletList', 'orderedList', 'listItem']);
const marks = new Set(['bold', 'italic', 'underline', 'strike', 'link']);
const bad = () => { throw Object.assign(new Error('본문 서식을 읽지 못했습니다. 허용된 글과 사진만 넣어 주세요.'), { status: 400 }); };
const safeLink = value => { try { return ['https:', 'http:', 'mailto:'].includes(new URL(value).protocol); } catch { return false; } };
const safeImage = value => typeof value === 'string' && value.length <= 220000 && (/^https:\/\//.test(value) || /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(value));

export function validateRich(doc) {
  let count = 0, notes = 0;
  if (doc?.type !== 'doc' || JSON.stringify(doc).length > 600000) bad();
  function visit(node, depth = 0) {
    if (!node || ++count > 15000 || depth > 30) bad();
    if (!containers.has(node.type) && !['text', 'hardBreak', 'horizontalRule', 'image', 'footnote'].includes(node.type)) bad();
    if (node.type === 'text' && (typeof node.text !== 'string' || node.text.length > 200000)) bad();
    if (node.type === 'image' && !safeImage(node.attrs?.src)) bad();
    if (node.type === 'footnote' && (++notes > 200 || typeof node.attrs?.text !== 'string' || !node.attrs.text.trim() || node.attrs.text.length > 5000)) bad();
    if (node.type === 'heading' && ![2, 3].includes(node.attrs?.level)) bad();
    if (node.attrs?.textAlign && !['left', 'center', 'right'].includes(node.attrs.textAlign)) bad();
    if (node.marks && (!Array.isArray(node.marks) || node.marks.length > 5)) bad();
    for (const mark of node.marks || []) {
      if (!marks.has(mark.type) || (mark.type === 'link' && !safeLink(mark.attrs?.href))) bad();
    }
    if (node.content) {
      if (!containers.has(node.type) || !Array.isArray(node.content)) bad();
      node.content.forEach(child => visit(child, depth + 1));
    }
  }
  visit(doc);
  return doc;
}

export function plainDoc(text) {
  return { type: 'doc', content: String(text || '').split('\n').map(line => ({ type: 'paragraph', ...(line ? { content: [{ type: 'text', text: line }] } : {}) })) };
}

export function plainText(doc) {
  const walk = node => {
    if (node.type === 'text') return node.text;
    if (node.type === 'hardBreak') return '\n';
    if (node.type === 'image') return node.attrs?.alt || '[사진]';
    if (node.type === 'footnote') return '[주]';
    return (node.content || []).map(walk).join(['doc', 'blockquote', 'bulletList', 'orderedList', 'listItem'].includes(node.type) ? '\n' : '');
  };
  return walk(doc);
}

// Both preview and public reader use this allowlist renderer, never stored HTML.
export function renderRich(doc) {
  validateRich(doc);
  const notes = [];
  const render = node => {
    if (node.type === 'text') {
      let value = escape(node.text);
      for (const mark of node.marks || []) {
        const tag = { bold: 'strong', italic: 'em', underline: 'u', strike: 's' }[mark.type];
        value = tag ? `<${tag}>${value}</${tag}>` : `<a href="${escape(mark.attrs.href)}" target="_blank" rel="noopener noreferrer">${value}</a>`;
      }
      return value;
    }
    if (node.type === 'hardBreak') return '<br>';
    if (node.type === 'footnote') {
      const number = notes.push(node.attrs.text);
      return `<sup class="footnote-ref"><a id="note-ref-${number}" href="#note-${number}" data-note-target="note-${number}" aria-label="각주 ${number}">${number}</a></sup>`;
    }
    if (node.type === 'horizontalRule') return '<hr>';
    if (node.type === 'image') return `<figure><img src="${escape(node.attrs.src)}" alt="${escape(node.attrs.alt || '')}" loading="lazy">${node.attrs.alt ? `<figcaption>${escape(node.attrs.alt)}</figcaption>` : ''}</figure>`;
    const body = (node.content || []).map(render).join('');
    if (node.type === 'doc') return body;
    const tag = { paragraph: 'p', heading: `h${node.attrs?.level}`, blockquote: 'blockquote', bulletList: 'ul', orderedList: 'ol', listItem: 'li' }[node.type];
    const align = node.attrs?.textAlign ? ` class="align-${node.attrs.textAlign}"` : '';
    const start = node.type === 'orderedList' && Number.isSafeInteger(node.attrs?.start) && node.attrs.start > 0 ? ` start="${node.attrs.start}"` : '';
    return `<${tag}${align}${start}>${body || (tag === 'p' ? '<br>' : '')}</${tag}>`;
  };
  const body = render(doc);
  return body + (notes.length ? `<section class="footnotes" aria-label="각주"><h2>각주</h2><ol>${notes.map((note, i) => `<li id="note-${i + 1}" tabindex="-1"><span>${escape(note)}</span> <a class="footnote-back" href="#note-ref-${i + 1}" data-note-target="note-ref-${i + 1}" aria-label="각주 ${i + 1} 본문으로 돌아가기"><svg aria-hidden="true" viewBox="0 0 24 24"><use href="assets/editor/icons.svg#arrow-left"></use></svg></a></li>`).join('')}</ol></section>` : '');
}
