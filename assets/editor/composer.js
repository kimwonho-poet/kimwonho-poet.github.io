import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
export { renderRich, plainDoc, plainText } from '../../lib/rich-text.mjs';

export function createComposer(element, content, onUpdate, onSelection, onFiles) {
  return new Editor({
    element, content, injectCSS: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, code: false, codeBlock: false, trailingNode: false, link: { openOnClick: false, autolink: true, protocols: ['https', 'http', 'mailto'] } }),
      Image.configure({ allowBase64: true }), TextAlign.configure({ types: ['heading', 'paragraph'], alignments: ['left', 'center', 'right'] }),
      Placeholder.configure({ placeholder: '여기에서 글을 시작하세요.' })
    ],
    editorProps: {
      attributes: { role: 'textbox', 'aria-label': '본문', 'aria-multiline': 'true', spellcheck: 'false', class: 'rich-body' },
      handlePaste: (_view, event) => {
        const files = [...(event.clipboardData?.files || [])].filter(f => f.type.startsWith('image/'));
        if (!files.length) return false;
        event.preventDefault(); onFiles(files); return true;
      },
      handleDrop: (_view, event) => {
        const files = [...(event.dataTransfer?.files || [])].filter(f => f.type.startsWith('image/'));
        if (!files.length) return false;
        event.preventDefault(); onFiles(files); return true;
      }
    },
    onUpdate: ({ editor }) => onUpdate(editor.getJSON()),
    onSelectionUpdate: onSelection,
    onTransaction: onSelection
  });
}

export async function prepareImage(file) {
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type) || file.size > 20000000) throw new Error('JPG, PNG, WebP, GIF 사진을 20MB 이하로 선택해 주세요.');
  const bitmap = await createImageBitmap(file);
  try {
    let edge = 1400;
    for (let attempt = 0; attempt < 5; attempt++) {
      const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const source = canvas.toDataURL('image/jpeg', .8 - attempt * .08);
      if (source.length < 180000) return source;
      edge *= .8;
    }
    throw new Error('사진 용량이 큽니다. 더 작은 사진을 선택해 주세요.');
  } finally { bitmap.close(); }
}
