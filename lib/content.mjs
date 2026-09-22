import { parse } from 'acorn';
import { validateRich, plainText } from './rich-text.mjs';

const SECTIONS = { works: 'WORKS', about: 'ABOUT', profile: 'PROFILE' };
const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };

// Read only literal data. Never execute the public page inside the editor server.
function literal(node) {
  if (node.type === 'Literal' && !node.regex) return node.value;
  if (node.type === 'TemplateLiteral' && !node.expressions.length) return node.quasis[0].value.cooked;
  if (node.type === 'ArrayExpression') return node.elements.map(literal);
  if (node.type === 'ObjectExpression') {
    const value = {};
    for (const p of node.properties) {
      if (p.type !== 'Property' || p.computed || p.method || p.kind !== 'init') fail('지원하지 않는 자료 형식입니다.');
      const key = p.key.name ?? p.key.value;
      if (['__proto__', 'constructor', 'prototype'].includes(key)) fail('허용되지 않는 속성입니다.');
      value[key] = literal(p.value);
    }
    return value;
  }
  fail('내용 구역에 실행 코드가 포함되어 있습니다.');
}

function blocks(html) {
  const result = {};
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    if (!match[1].trim()) continue;
    const offset = match.index + match[0].indexOf('>') + 1;
    const tree = parse(match[1], { ecmaVersion: 'latest', sourceType: 'script' });
    for (const statement of tree.body) {
      if (statement.type !== 'VariableDeclaration') continue;
      for (const declaration of statement.declarations) {
        if (!Object.values(SECTIONS).includes(declaration.id.name)) continue;
        if (result[declaration.id.name]) fail('내용 구역이 중복되어 있습니다.');
        result[declaration.id.name] = { value: literal(declaration.init), start: offset + declaration.init.start, end: offset + declaration.init.end };
      }
    }
  }
  if (Object.keys(result).length !== 3) fail('홈페이지의 내용 구역을 찾을 수 없습니다.');
  return result;
}

export function readContent(html) {
  const found = blocks(html);
  return Object.fromEntries(Object.entries(SECTIONS).map(([key, name]) => [key, found[name].value]));
}

function string(value, max = 1000) {
  if (typeof value !== 'string' || value.length > max) fail('입력한 내용의 형식이나 길이를 확인해 주세요.');
  return value;
}
function array(value, max) {
  if (!Array.isArray(value) || value.length > max) fail('항목 수가 허용 범위를 넘었습니다.');
}
function url(value, relative = false) {
  string(value, relative ? 250000 : 2048);
  if (!value) return;
  if (relative && /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(value)) return;
  if (relative && /^(?![./]*\/|.*:)[a-zA-Z0-9_/-]+\.(?:jpg|jpeg|png|webp)$/i.test(value)) return;
  try { if (['https:', 'http:'].includes(new URL(value).protocol)) return; } catch {}
  fail('링크에는 http:// 또는 https://로 시작하는 주소를 입력해 주세요.');
}

export function validateContent(section, value) {
  if (!Object.hasOwn(SECTIONS, section)) fail('편집할 수 없는 구역입니다.');
  if (section === 'works') {
    array(value, 2000);
    const ids = new Set();
    for (const w of value) {
      string(w.id, 100);
      if (!/^[a-zA-Z0-9_-]+$/.test(w.id) || ids.has(w.id)) fail('글의 식별자가 올바르지 않거나 중복되었습니다.');
      ids.add(w.id);
      if (!['poem', 'prose', 'research'].includes(w.section)) fail('글의 분류를 확인해 주세요.');
      if (!string(w.title, 300).trim() || !string(w.body, 200000).trim()) fail('제목과 본문을 입력해 주세요.');
      if (w.rich) {
        validateRich(w.rich);
        if (plainText(w.rich) !== w.body) fail('본문과 서식이 일치하지 않습니다. 본문을 다시 확인해 주세요.');
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(string(w.date, 10)) || !Number.isFinite(Date.parse(w.date)) || new Date(w.date).toISOString().slice(0, 10) !== w.date) fail('날짜를 확인해 주세요.');
      string(w.meta ?? '', 1000); string(w.note ?? '', 3000); url(w.link ?? '');
    }
  } else if (section === 'about') {
    array(value.facts, 100); array(value.groups, 100);
    value.facts.forEach(f => { string(f.k); string(f.v, 10000); });
    value.groups.forEach(g => {
      string(g.h); array(g.items, 500);
      g.items.forEach(item => {
        if (typeof item === 'string') { string(item, 10000); return; }
        string(item.t, 10000); url(item.url ?? ''); url(item.img ?? '', true);
      });
    });
  } else {
    array(value.names, 10); array(value.roles, 20); array(value.links, 30);
    value.names.forEach(v => string(v, 200)); value.roles.forEach(v => string(v, 1000));
    if (!value.names[0]?.trim()) fail('이름을 입력해 주세요.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(string(value.email, 254))) fail('이메일 주소를 확인해 주세요.');
    url(value.photo, true);
    value.links.forEach(l => { string(l.label, 100); string(l.icon ?? '', 100); url(l.url); });
    if (value.youtube) { url(value.youtube.url); url(value.youtube.thumbnail); string(value.youtube.title); }
  }
  return value;
}

export function replaceContent(html, section, value) {
  validateContent(section, value);
  const block = blocks(html)[SECTIONS[section]];
  const json = JSON.stringify(value, null, 2).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return html.slice(0, block.start) + json + html.slice(block.end);
}
