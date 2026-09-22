import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readContent, replaceContent } from '../lib/content.mjs';
import { activityId, emptyDetail, validateDetail } from '../lib/activities.mjs';

const filename = process.argv[2];
if (!filename) throw new Error('Pass the supplied portfolio TXT path. The source is never modified.');
const source = await readFile(filename);
const sha = createHash('sha256').update(source).digest('hex');
if (sha !== '043d00a952a19d237a2b35a95507c9bb87a686e1f1dbfcc8390bf58467f89cc7') throw new Error('Source changed. Review document ranges before importing.');
const lines = source.toString('utf8').split('\n');
const slice = (start, end) => lines.slice(start - 1, end).join('\n').replace(/^\n+|\n+$/g, '');
const hash = text => createHash('sha256').update(text).digest('hex');
const manifest = { sourceSha256: sha, sourceLines: lines.length, imported: [], excluded: ['공모요강·발표 명단·상장·사진 설명', '타인 작품과 합본 중복 지면', '자료 수집 안내·목록·검수 기록'], limitations: ['아기 엄마: 공식 지면과 대조하지 않은 전재본', '증류수를 한 잔 마시면 일어나는 일: 일부만 수록', '의정부 심사평과 전주 선정 이유: 파일에 본문이 없어 링크만 유지'] };
const configs = [
  { match: '동대문학상', id: 'dongdae-2025', start: 45, end: 684, summary: '제31회 동대문학상 시·희곡/시나리오 부문 심사위원 특별 언급. 정식 수상 등급과 구분합니다.', docs: [
    ['poem', '생을 다해 모래시계를', 77, 182, 'full', 0], ['poem', '하이쿠俳句를 쓰자', 188, 265, 'full', 0], ['play', '무덤덤한 무덤은 덤', 271, 656, 'full', 1],
    ['review', '시 부문 심사평', 658, 671, 'full', 2], ['review', '희곡·시나리오 부문 심사평', 673, 683, 'full', 3]
  ] },
  { match: '윤동주시문학상', id: 'yoon-dongju-24', start: 686, end: 1063, summary: '공식 역대수상자에는 2024년 「한밤의 벌초」, 2025년 1월 9일 결과 공지에는 「반장갑 외」로 표기되어 있습니다. 당선소감 말미의 날짜는 2025년 2월 13일입니다.', docs: [
    ['poem', '반장갑', 716, 785, 'full', 2], ['poem', '한밤의 벌초', 791, 859, 'full', 2], ['poem', '슬픔의 슬픔', 865, 904, 'full', 2], ['poem', '간판 없는 거리', 910, 948, 'full', 2], ['poem', '아무 말도 하지 않았다', 954, 1019, 'full', 2], ['speech', '제24회 윤동주 시문학상 당선 소감', 1021, 1062, 'full', 3]
  ] },
  { match: '가람이병기청년시문학상', id: 'garam-2024', start: 1065, end: 1230, summary: '전북대신문 제1570호(2024년 10월 16일)에 작품·수상소감·심사평이 수록되었습니다. 시상식은 2024년 10월 28일 열렸습니다.', docs: [
    ['poem', '다게레오타이프 daguerreotype', 1101, 1153, 'full', 1], ['speech', '올봄은 머리를 싹둑 잘랐습니다', 1159, 1187, 'full', 3], ['review', '탄탄한 철학적 사유로 새로운 시적 인식을 드러내는 작품 선정', 1193, 1229, 'full', 2]
  ] },
  { match: '펄벅기념문학상', id: 'pearl-buck-2024', start: 1232, end: 1418, summary: '제15회 펄벅기념문학상 청년부 최우수상·부천시장상. 아래 심사총평은 김원호 개인의 작품평이 아닌 공모 전체를 대상으로 한 글입니다.', docs: [
    ['poem', '나침반을 쥐고서', 1263, 1310, 'full', 1], ['poem', '화요일의 무화과', 1312, 1343, 'full', 1], ['poem', '프레의 말', 1345, 1379, 'full', 1], ['review', '펄벅 문학상 심사를 마치고', 1385, 1417, 'general', 1]
  ] },
  { match: '의혈창작문학상', id: 'uihyeol-2023', start: 1420, end: 1598, summary: '제33회 의혈창작문학상 시 부문 장원. 당선 표기는 「가자 지구」 외 6편이며, 이 페이지에는 제공된 「가자 지구」 전문과 심사평·수상소감이 포함된 인터뷰를 수록합니다.', docs: [
    ['poem', '가자 지구', 1452, 1497, 'full', 0], ['review', '선명하게 보고 표현하는 힘', 1503, 1539, 'full', 0], ['interview', '결코, 멀지, 않은 — 수상소감·인터뷰', 1545, 1597, 'full', 0]
  ] },
  { match: '기아 인스파이어링 문학상', id: 'kia-2023', start: 1600, end: 1629, summary: '제5회 기아 인스파이어링 문학상 대학부 운문 은상.', docs: [] },
  { match: '계명문학상', id: 'keimyung-2021', start: 1631, end: 1754, summary: '제41회 계명문학상 시 부문 당선. 공식 결과는 「아기 엄마」 외 4편입니다. 「아기 엄마」는 제공된 공개 전재본으로, 공식 인쇄본의 행갈이와 일치 여부는 확인되지 않았습니다.', docs: [
    ['poem', '아기 엄마', 1670, 1677, 'reprint', 3], ['speech', '당선소감', 1683, 1705, 'full', 2], ['review', '시 부문 심사평 및 심사위원 소개', 1711, 1753, 'full', 1]
  ] },
  { match: '경남청년문학상', id: 'gyeongnam-2022', start: 1756, end: 1815, summary: '제1회 경남청년문학상 운문부 시 우수상. 수상작은 「증류수를 한 잔 마시면 일어나는 일」·「빈 문서」·「밤 기차」입니다. 『젊은 바다를 초대하다』(도서출판 경남, 2022)에 수록되었습니다.', docs: [
    ['speech', '수상소감', 1784, 1790, 'full', 3], ['poem', '증류수를 한 잔 마시면 일어나는 일', 1792, 1814, 'excerpt', 3]
  ] },
  { match: '전주동네책방문학상', id: 'jeonju-2022', start: 1817, end: 2071, summary: '제2회 전주동네책방문학상 물결서사상. 전체 대상이 아닌 책방별 수여상입니다. 『맛있는 밥을 먹었습니다』(잘 익은 언어들, 2022)에 수록되었습니다.', docs: [
    ['poem', '키친 드링커', 1853, 2056, 'full', 0], ['speech', '수상소감', 2058, 2068, 'full', 0]
  ] },
  { match: '의정부전국문학공모전', id: 'uijeongbu-2021', start: 2073, end: 2102, summary: '제23회 의정부전국문학공모전 일반부 운문 장려상. 수상작은 「슬리퍼는 슬피 울어」입니다. 제공된 파일에 작품·심사평 본문은 없어 원문 링크를 남깁니다.', docs: [] },
  { match: '웹진 포엣푸념', id: 'poetpoonyum-interview', start: 2104, end: 2299, summary: '웹진 포엣푸념 「셋 세면 새 노래」 김원호 인터뷰. 제공된 카드 이미지 9장의 전사문이며 카드 번호와 전사 주석을 보존합니다.', docs: [
    ['interview', '셋 세면 새 노래', 2107, 2298, 'full', -1]
  ] }
];
let html = await readFile('index.html', 'utf8');
const { about } = readContent(html);
let matches = 0;
for (const group of about.groups) for (const item of group.items) {
  if (typeof item === 'string') continue;
  const config = configs.find(c => item.t.includes(c.match));
  item.id = config?.id || activityId(item);
  item.detail ||= emptyDetail();
  if (!config) continue;
  matches++;
  const section = slice(config.start, config.end), sectionLines = section.split('\n');
  const sourceStart = sectionLines.indexOf('주요 출처');
  const sources = [];
  if (sourceStart >= 0) {
    for (let i = sourceStart + 1; i < sectionLines.length; i++) {
      if (/^[-=]{20}/.test(sectionLines[i])) break;
      if (/^https?:\/\//.test(sectionLines[i])) sources.push({ label: sectionLines[i - 1], url: sectionLines[i] });
    }
  }
  item.detail = { year: sectionLines.find(l => l.startsWith('연도: '))?.slice(4) || '', distinction: sectionLines.find(l => l.startsWith('구분: '))?.slice(4) || '', summary: config.summary, sources, documents: config.docs.map(([kind, title, start, end, extent, sourceIndex], i) => {
    const record = sources[sourceIndex] || { label: '제공된 인터뷰 카드 전사문', url: item.url };
    const body = slice(start, end);
    const doc = { id: 'document-' + (i + 1), kind, title, body, extent, note: extent === 'excerpt' ? '사진에 보이는 일부만 수록합니다. 전문이 아닙니다.' : extent === 'reprint' ? '공식 지면과 대조하지 않은 공개 전재본입니다. 제공된 띄어쓰기와 표기를 임의로 교정하지 않았습니다.' : extent === 'general' ? '이 글은 공모 전체의 심사총평이며 김원호 개인의 심사평이 아닙니다.' : '', source: record.label, url: record.url };
    manifest.imported.push({ activityId: item.id, documentId: doc.id, title, kind, extent, startLine: start, endLine: end, sha256: hash(body), characters: body.length });
    return doc;
  }) };
  validateDetail(item.detail);
}
if (matches !== 11 || manifest.imported.length !== 29) throw new Error('Incomplete source mapping.');
html = replaceContent(html, 'about', about);
await writeFile('index.html', html);
await mkdir('tests/fixtures', { recursive: true });
await writeFile('tests/fixtures/activity-import-manifest.json', JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ activities: about.groups.flatMap(g => g.items).length, withSuppliedText: matches, documents: manifest.imported.length, sourceSha256: sha, pageBytes: Buffer.byteLength(html) }, null, 2));
