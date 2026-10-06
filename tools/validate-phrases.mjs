import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const list = JSON.parse(fs.readFileSync(path.join(root, 'content-src/social/phrases.json'), 'utf8'));
const errs = [];
const ids = new Set(), ens = new Set();
let prev = '';
const cache = {};
const lesson = (id) => {
  if (!(id in cache)) {
    const f = path.join(root, 'content-src/book1', id + '.json');
    cache[id] = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
  }
  return cache[id];
};
if (!Array.isArray(list) || list.length !== 30) errs.push('count must be 30, got ' + list.length);
for (const p of list) {
  const t = p.id;
  if (!/^[a-z][a-z0-9_]{0,19}$/.test(t || '')) errs.push(`${t}: bad id`);
  if (ids.has(t)) errs.push(`${t}: duplicate id`);
  ids.add(t);
  if (ens.has(p.en)) errs.push(`${t}: duplicate en`);
  ens.add(p.en);
  if (typeof p.zh !== 'string' || !p.zh.trim() || [...p.zh].length > 12) errs.push(`${t}: bad zh`);
  if (!/^L\d{3}-\d{3}$/.test(p.unlock || '')) errs.push(`${t}: bad unlock`);
  if (!lesson(p.unlock)) errs.push(`${t}: lesson file missing for ${p.unlock}`);
  if (p.audio?.lesson !== p.unlock) errs.push(`${t}: audio.lesson != unlock`);
  const L = lesson(p.audio?.lesson);
  if (!L || L.lines?.[p.audio.line]?.en !== p.en) errs.push(`${t}: en mismatch with lesson line`);
  if (p.en.split(/\s+/).length > 8) errs.push(`${t}: more than 8 words`);
  if (p.unlock < prev) errs.push(`${t}: not sorted by unlock`);
  prev = p.unlock;
}
if (list[0]?.unlock !== 'L001-002') errs.push('first unlock must be L001-002');
if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
console.log('OK');
