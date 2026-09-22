import { plainDoc, plainText } from '../lib/rich-text.mjs';

// Preview fixtures are inserted in memory only. Never included in the public build.
const poem = '첫 번째 행\n    네 칸 들여쓴 두 번째 행\n\n다음 연의 첫 행\n\t탭으로 들여쓴 행\n\n마지막 행\n';
const paragraph = '이 문장은 독서 화면의 배치를 확인하기 위한 검수용 문장입니다. 실제 작품이나 비평이 아닙니다. 문단 사이의 여백과 글자의 크기를 살펴봅니다. 화면이 좁아져도 문장이 서로 겹치지 않아야 합니다. 읽던 문단으로 돌아왔을 때 글의 흐름이 이어지는지를 확인합니다. ';
const rich = { type: 'doc', content: [
  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '첫 번째 소제목' }] },
  { type: 'paragraph', content: [{ type: 'text', text: paragraph }, { type: 'footnote', attrs: { text: '검수용 각주입니다. 실제 서지 정보가 아닙니다.\n각주의 줄바꿈과 본문 복귀를 확인합니다.' } }] },
  { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: '검수용 인용문입니다.\n인용문 안의 행갈이를 확인합니다.' }] }] },
  ...Array.from({ length: 22 }, (_, i) => ({ type: 'paragraph', content: [{ type: 'text', text: `${i + 2}. ${paragraph.repeat(2)}` }] })),
  { type: 'paragraph', content: [{ type: 'text', text: '마지막 문단입니다.' }, { type: 'footnote', attrs: { text: '<태그>는 실행하지 않고 문자로 보여야 합니다.' } }] }
] };
const base = { date: '2026-09-22', meta: '로컬 화면 검수용', note: '', link: '' };
export const readingFixtures = [
  { ...base, id: 'qa-poem', section: 'poem', title: '시 화면 검수', body: poem },
  { ...base, id: 'qa-rich-poem', section: 'poem', title: '서식 있는 시 화면 검수', body: poem, rich: plainDoc(poem) },
  { ...base, id: 'qa-essay', section: 'prose', title: '산문과 비평의 독서 화면 검수', body: plainText(rich), rich },
  { ...base, id: 'qa-research', section: 'research', title: '연구 글 화면 검수', body: Array.from({ length: 22 }, (_, i) => `${i + 1}. ${paragraph.repeat(2)}`).join('\n\n') }
];
