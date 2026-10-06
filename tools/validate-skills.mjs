// 校验职业技能数据 content-src/skills/<class>.json（schema 见 docs/slice/ROUND4B.md 的 I 节）
import { readFileSync } from 'node:fs';

const LEVELS = [1, 1, 3, 3, 5, 5, 8, 8, 12, 12, 15, 18, 18, 22, 22, 34, 34, 38, 38, 42, 42, 54, 58];
const PROJ = ['bullet', 'laser', 'fireball', 'iceball', 'thunderball', 'lightorb', 'rocket', 'grenade', 'arrow', 'star', 'letter', 'note'];
const HIT = ['shoot', 'rain', 'explode', 'lightning', 'shatter', 'spikes', 'pillar', 'ray', 'cross', 'dragon', 'phoenix', 'slash', 'beam'];
const ALL = [...HIT, 'charge', 'freeze', 'shake', 'tint', 'zoom', 'wait'];
const KIND = ['fire', 'ice', 'thunder', 'light', 'phys'];
const ELEM = ['phys', 'fire', 'ice', 'thunder', 'light', 'mix'];

let bad = 0;
const err = (m) => { bad++; console.log('✗', m); };
for (const cls of process.argv.slice(2).length ? process.argv.slice(2) : ['gunner', 'mage']) {
  let list;
  try { list = JSON.parse(readFileSync(`content-src/skills/${cls}.json`, 'utf8')); } catch (e) { err(`${cls}: 读不了 ${e.message}`); continue; }
  if (!Array.isArray(list) || list.length !== LEVELS.length) err(`${cls}: 需要 ${LEVELS.length} 个技能，实际 ${list?.length}`);
  const ids = new Set();
  const prefix = cls === 'gunner' ? 'g_' : 'm_';
  (list ?? []).forEach((k, i) => {
    const at = `${cls}[${i}] ${k.id}`;
    if (!k.id?.startsWith(prefix)) err(`${at}: id 要以 ${prefix} 开头`);
    if (ids.has(k.id)) err(`${at}: id 重复`);
    ids.add(k.id);
    if (k.level !== LEVELS[i]) err(`${at}: level 应为 ${LEVELS[i]}`);
    if (!k.name || k.name.length > 6) err(`${at}: name 1–6 个字`);
    if (!k.desc || k.desc.length > 24) err(`${at}: desc 1–24 个字`);
    if (!k.glyph || [...k.glyph].length !== 1) err(`${at}: glyph 必须是 1 个字`);
    if (!/^#[0-9a-fA-F]{6}$/.test(k.color ?? '')) err(`${at}: color 要 #rrggbb`);
    if (!ELEM.includes(k.element)) err(`${at}: element 只能是 ${ELEM}`);
    if (!Array.isArray(k.fx) || !k.fx.length) { err(`${at}: fx 为空`); return; }
    let hits = 0;
    let frozen = false;
    for (const st of k.fx) {
      if (!ALL.includes(st.do)) err(`${at}: 未知步骤 ${st.do}`);
      if ((st.do === 'shoot' || st.do === 'rain') && !PROJ.includes(st.proj)) err(`${at}: proj 只能是 ${PROJ}`);
      if (st.do === 'explode' && !KIND.includes(st.kind)) err(`${at}: explode.kind 只能是 ${KIND}`);
      if (st.do === 'tint' && !['fire', 'ice', 'thunder', 'light'].includes(st.element)) err(`${at}: tint.element 不对`);
      if (st.do === 'freeze') frozen = true;
      if (st.do === 'shatter' && !frozen) err(`${at}: shatter 前要先 freeze`);
      if (HIT.includes(st.do)) hits += st.n ?? 1;
      if (st.n !== undefined && (st.n < 1 || st.n > 12)) err(`${at}: n 在 1–12`);
      if (st.perRank !== undefined && (st.perRank < 0 || st.perRank > 3)) err(`${at}: perRank 在 0–3`);
    }
    if (hits < 1 || hits > 16) err(`${at}: 1 级时命中段数 ${hits}，应在 1–16`);
    if (!HIT.includes(k.fx.at(-1).do)) err(`${at}: 最后一步必须是命中步骤`);
  });
  console.log(`${cls}: ${list?.length ?? 0} 个技能检查完毕`);
}
console.log(bad ? `共 ${bad} 个问题` : 'OK');
process.exit(bad ? 1 : 0);
