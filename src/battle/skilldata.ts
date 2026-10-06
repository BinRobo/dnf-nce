import type { SaveData } from '../save/schema';

/**
 * 技能树（DNF 式），按全书 72 个副本（约 60 级）铺开：
 * 每升 1 级得 1 技能点，每章最后一个副本首通再奖励 1 点；技能按等级分层开放，每个技能 1–5 级，
 * 第 4、5 级要比技能开放等级高 10、20 级才能升。被动技能不进技能栏。
 * 题量不变——技能只影响演出、伤害数字与连段数。
 */
export type Element = 'phys' | 'fire' | 'ice' | 'thunder' | 'light' | 'mix';
export interface SkillDef {
  id: string;
  name: string;
  /** 开放等级 */
  level: number;
  /** 充能需要答对的题数（被动技能为 -1） */
  cd: number;
  desc: string;
  color: number;
  /** 技能图标上的字 */
  glyph: string;
  /** 每级伤害倍率（5 级） */
  power: number[];
  element: Element;
  passive?: boolean;
  /** 神枪手 / 魔法师的技能是数据驱动的特效步骤（见 docs/slice/ROUND4B.md I 节） */
  fx?: FxStep[];
}

export interface FxStep {
  do: string;
  proj?: string;
  n?: number;
  perRank?: number;
  gap?: number;
  spread?: number;
  kind?: string;
  scale?: number;
  color?: string;
  element?: string;
  px?: number;
  ms?: number;
}

const P = (a: number, step: number) => [0, 1, 2, 3, 4].map((i) => Math.round((a + step * i) * 10) / 10);

export const SKILL_TREE: SkillDef[] = [
  { id: 'slash', name: '单词斩', level: 1, cd: 0, desc: '基础斩击，随时可用', color: 0x9fe3ff, glyph: '斩', power: P(1.2, 0.3), element: 'phys' },
  { id: 'rising', name: '上挑斩', level: 1, cd: 2, desc: '把敌人挑上天空，再追击几刀', color: 0x7fd0ff, glyph: '挑', power: P(1.6, 0.4), element: 'phys' },
  { id: 'whirl', name: '回旋斩', level: 3, cd: 2, desc: '旋身一圈卷起旋风，多段命中', color: 0x7dffa5, glyph: '旋', power: P(1.8, 0.45), element: 'phys' },
  { id: 'thrust', name: '突刺', level: 3, cd: 2, desc: '化作残影高速穿刺', color: 0xd9f6ff, glyph: '刺', power: P(1.8, 0.5), element: 'phys' },
  { id: 'wave', name: '剑气波', level: 5, cd: 3, desc: '挥出巨大剑气，炸开金光', color: 0xffd34a, glyph: '波', power: P(2.4, 0.55), element: 'light' },
  { id: 'frost', name: '冰霜剑', level: 5, cd: 3, desc: '冰锥破土而出，把敌人冻住再一刀击碎', color: 0x9fe8ff, glyph: '冰', power: P(2.4, 0.6), element: 'ice', fx: [{do: 'spikes', n: 2, perRank: 1}, {do: 'freeze'}, {do: 'slash', n: 1}, {do: 'shatter'}] },
  { id: 'thunder', name: '雷光斩', level: 8, cd: 3, desc: '天降分叉闪电，敌人全身带电', color: 0xb8a6ff, glyph: '雷', power: P(3.0, 0.65), element: 'thunder', fx: [{do: 'tint', element: 'thunder'}, {do: 'lightning', n: 2, perRank: 1}, {do: 'explode', kind: 'thunder'}] },
  { id: 'fire', name: '火焰爆裂', level: 8, cd: 3, desc: '地面喷出火柱，炸开一团烈焰', color: 0xff7a45, glyph: '炎', power: P(3.0, 0.7), element: 'fire', fx: [{do: 'pillar', n: 1, perRank: 1}, {do: 'explode', kind: 'fire'}] },
  { id: 'meteor', name: '流星裂地', level: 12, cd: 4, desc: '跃起下劈，大地开裂', color: 0xff9f43, glyph: '星', power: P(3.8, 0.85), element: 'phys' },
  { id: 'letters', name: '字母陨石', level: 12, cd: 4, desc: '找回的字母化作陨石落下', color: 0xffe14a, glyph: 'A', power: P(3.8, 0.9), element: 'light' },
  { id: 'storm', name: '千刃风暴', level: 15, cd: 5, desc: '无数刀光将敌人包围', color: 0xff6bc8, glyph: '刃', power: P(4.8, 1.1), element: 'phys' },
  // ---- 第 2 章 ----
  { id: 'icecage', name: '寒冰牢笼', level: 18, cd: 4, desc: '冰锥围成牢笼，冻结后整块炸碎', color: 0x7fe0ff, glyph: '笼', power: P(5.0, 1.1), element: 'ice', fx: [{do: 'tint', element: 'ice'}, {do: 'spikes', n: 4, perRank: 1}, {do: 'freeze'}, {do: 'wait', ms: 200}, {do: 'shatter'}] },
  { id: 'holycross', name: '圣光十字', level: 18, cd: 4, desc: '光柱落下，十字圣光贯穿敌人', color: 0xfff1a8, glyph: '十', power: P(5.0, 1.1), element: 'light', fx: [{do: 'ray', n: 2, perRank: 1}, {do: 'cross'}] },
  { id: 'chain', name: '连环雷', level: 22, cd: 4, desc: '闪电在敌人之间来回跳跃', color: 0xa58cff, glyph: '链', power: P(5.6, 1.2), element: 'thunder', fx: [{do: 'charge', color: '#a58cff'}, {do: 'lightning', n: 4, perRank: 1}, {do: 'explode', kind: 'thunder'}] },
  { id: 'dragon', name: '炎龙斩', level: 22, cd: 4, desc: '剑化火龙，咆哮着冲向敌人', color: 0xff5a2e, glyph: '龙', power: P(5.6, 1.2), element: 'fire', fx: [{do: 'charge', color: '#ff5a2e'}, {do: 'slash', n: 2}, {do: 'dragon'}] },
  { id: 'gshield', name: '语法之盾', level: 26, cd: -1, desc: '被动：每场战斗开始多 1 层护盾（5 级时 +2）', color: 0x8ec5ff, glyph: '盾', power: P(0, 0), element: 'phys', passive: true },
  // ---- 第 3 章 ----
  { id: 'awaken1', name: '觉醒 · 词语风暴', level: 30, cd: -1, desc: '被动：觉醒技升级，更多斩击与全屏词语风暴', color: 0xffb020, glyph: '觉', power: P(0, 0), element: 'mix', passive: true },
  { id: 'glacier', name: '冰河世纪', level: 34, cd: 5, desc: '整个画面冰封，巨大冰山砸下', color: 0x5fd0ff, glyph: '川', power: P(6.8, 1.4), element: 'ice', fx: [{do: 'tint', element: 'ice'}, {do: 'zoom'}, {do: 'spikes', n: 5, perRank: 1}, {do: 'freeze'}, {do: 'rain', proj: 'iceball', n: 4, perRank: 1}, {do: 'shatter'}] },
  { id: 'sky', name: '天雷', level: 34, cd: 5, desc: '天空暗下，九道天雷连续劈落', color: 0x9b7bff, glyph: '霆', power: P(6.8, 1.4), element: 'thunder', fx: [{do: 'tint', element: 'thunder'}, {do: 'zoom'}, {do: 'lightning', n: 9, perRank: 1, gap: 70}, {do: 'explode', kind: 'thunder', scale: 1.6}] },
  // ---- 第 4 章 ----
  { id: 'phoenix', name: '凤凰之翼', level: 38, cd: 5, desc: '火凤凰展翅俯冲，留下一地火羽', color: 0xff8a3d, glyph: '凰', power: P(7.6, 1.5), element: 'fire', fx: [{do: 'tint', element: 'fire'}, {do: 'charge', color: '#ff8a3d'}, {do: 'phoenix'}, {do: 'pillar', n: 3, perRank: 1}] },
  { id: 'judge', name: '光之审判', level: 38, cd: 5, desc: '无数光柱从天而降', color: 0xfff6c8, glyph: '审', power: P(7.6, 1.5), element: 'light', fx: [{do: 'tint', element: 'light'}, {do: 'ray', n: 6, perRank: 1}, {do: 'cross'}] },
  { id: 'timecut', name: '时空切割', level: 42, cd: 5, desc: '时间静止，一瞬间斩出千刀', color: 0xc8f0ff, glyph: '时', power: P(8.4, 1.6), element: 'phys', fx: [{do: 'tint', element: 'light'}, {do: 'zoom'}, {do: 'slash', n: 10, perRank: 2, gap: 40}, {do: 'explode', kind: 'phys', scale: 1.8}] },
  { id: 'summon', name: '伙伴召唤', level: 42, cd: 5, desc: '同学们一起冲出来出招', color: 0xff9fb3, glyph: '友', power: P(8.4, 1.6), element: 'phys', fx: [{do: 'rain', proj: 'star', n: 5, perRank: 1}, {do: 'slash', n: 4}, {do: 'explode', kind: 'light'}] },
  { id: 'combo', name: '连击大师', level: 46, cd: -1, desc: '被动：连击加成提高，连击数字更华丽', color: 0xff6bc8, glyph: '连', power: P(0, 0), element: 'phys', passive: true },
  // ---- 第 5–6 章 ----
  { id: 'awaken2', name: '觉醒 · 万语归一', level: 50, cd: -1, desc: '被动：第二次觉醒，觉醒技化为金色巨剑', color: 0xffd34a, glyph: '万', power: P(0, 0), element: 'mix', passive: true },
  { id: 'fusion', name: '元素融合', level: 54, cd: 6, desc: '火、冰、雷、光四元素合一爆发', color: 0xffffff, glyph: '合', power: P(10, 2), element: 'mix', fx: [{do: 'charge', color: '#ffffff'}, {do: 'zoom'}, {do: 'pillar', n: 2}, {do: 'spikes', n: 2}, {do: 'lightning', n: 2}, {do: 'ray', n: 2}, {do: 'shake', px: 10}, {do: 'explode', kind: 'fire', scale: 2}] },
  { id: 'finale', name: '全文朗诵', level: 58, cd: 6, desc: '终极技：念出整篇课文，每个单词都化作光剑', color: 0xffe9a0, glyph: '诵', power: P(12, 2.4), element: 'mix', fx: [{do: 'charge', color: '#ffe9a0'}, {do: 'zoom'}, {do: 'rain', proj: 'letter', n: 8, perRank: 2}, {do: 'slash', n: 6, perRank: 1, gap: 40}, {do: 'cross'}] },
];

/** 第几章（1–6）开放：用于技能树分组显示 */
export const skillChapter = (lv: number) => (lv <= 16 ? 1 : lv <= 27 ? 2 : lv <= 36 ? 3 : lv <= 46 ? 4 : lv <= 53 ? 5 : 6);

// ---------------- 三职业技能树 ----------------

type ClassId = 'sword' | 'gunner' | 'mage';
const PASSIVE_IDS = ['gshield', 'awaken1', 'combo', 'awaken2'];
const TREES: Record<ClassId, SkillDef[]> = { sword: SKILL_TREE, gunner: [], mage: [] };
const ALL = new Map(SKILL_TREE.map((k) => [k.id, k]));

/**
 * 载入神枪手 / 魔法师技能数据（content/skills/<职业>.json）。
 * 充能题数与威力按剑士同一位置的技能，保证三职业平衡；被动技能共用。
 */
export function registerClassSkills(cls: 'gunner' | 'mage', list: (Omit<SkillDef, 'cd' | 'power' | 'color'> & { color: string })[]) {
  const actives = SKILL_TREE.filter((k) => !k.passive);
  const passives = SKILL_TREE.filter((k) => PASSIVE_IDS.includes(k.id));
  const defs: SkillDef[] = list.map((k, i) => ({
    ...k,
    color: parseInt(k.color.slice(1), 16),
    cd: actives[i]?.cd ?? 4,
    power: actives[i]?.power ?? P(5, 1),
  }));
  TREES[cls] = [...defs, ...passives].sort((a, b) => a.level - b.level);
  for (const d of defs) ALL.set(d.id, d);
}

export const skillTree = (s: Pick<SaveData, 'cls'>) => TREES[s.cls ?? 'sword'].length ? TREES[s.cls ?? 'sword'] : SKILL_TREE;
/** 职业基础技能（随时可用，充能 0） */
export const baseSkill = (s: Pick<SaveData, 'cls'>) => skillTree(s).find((k) => k.cd === 0)?.id ?? 'slash';
export const skillDef = (id: string) => ALL.get(id) ?? SKILL_TREE[0];

/** 载入存档时：去掉不属于本职业的技能（点数自动退回），保证基础技能已学、技能栏不超格 */
export function normalizeSkills(s: SaveData) {
  const tree = new Set(skillTree(s).map((k) => k.id));
  for (const id of Object.keys(s.skills.ranks)) if (!tree.has(id)) delete s.skills.ranks[id];
  const b = baseSkill(s);
  if (!s.skills.ranks[b]) s.skills.ranks[b] = 1;
  s.skills.bar = s.skills.bar.filter((id) => tree.has(id) && !skillDef(id).passive);
  if (!s.skills.bar.includes(b)) s.skills.bar.unshift(b);
  s.skills.bar = s.skills.bar.slice(0, barSize(s.level));
}

export const MAX_RANK = 5;
/** 第 r 级（1–5）需要的角色等级 */
export const rankLevel = (d: SkillDef, r: number) => d.level + Math.max(0, r - 3) * 10;
/** 技能栏格数随等级增加，覆盖全书：Lv1 两格 … Lv40 八格 */
export const BAR_SIZE = 8;
export const BAR_LEVELS = [1, 1, 3, 6, 10, 18, 28, 40];
export const BAR_KEYS = ['Q', 'W', 'E', 'R', 'A', 'S', 'D', 'F'];
export const barSize = (level: number) => BAR_LEVELS.filter((l) => level >= l).length;
/** 下一格在几级开放（已满返回 null） */
export const nextBarLevel = (level: number) => BAR_LEVELS.find((l) => l > level) ?? null;

/** 总技能点 = 等级 + 章末 Boss 奖励；已用 = 各技能等级之和 */
export function skillPoints(s: SaveData) {
  const used = Object.values(s.skills.ranks).reduce((a, b) => a + b, 0);
  const total = s.level + (s.skills.bonus ?? 0);
  return { total, used, free: Math.max(0, total - used) };
}

export function canLearn(s: SaveData, id: string) {
  const d = skillDef(id);
  const r = s.skills.ranks[id] ?? 0;
  return r < MAX_RANK && s.level >= rankLevel(d, r + 1) && skillPoints(s).free > 0;
}

export function learn(s: SaveData, id: string): boolean {
  if (!canLearn(s, id)) return false;
  s.skills.ranks[id] = (s.skills.ranks[id] ?? 0) + 1;
  // 新学的主动技能自动放进技能栏空位
  if (!skillDef(id).passive && !s.skills.bar.includes(id) && s.skills.bar.length < barSize(s.level)) s.skills.bar.push(id);
  return true;
}

/** 免费重置：保留单词斩 1 级 */
export function resetSkills(s: SaveData) {
  const b = baseSkill(s);
  s.skills = { ranks: { [b]: 1 }, bar: [b], bonus: s.skills.bonus ?? 0 };
}

export function toggleBar(s: SaveData, id: string) {
  const i = s.skills.bar.indexOf(id);
  if (i >= 0) {
    if (s.skills.bar.length > 1) s.skills.bar.splice(i, 1);
  } else if (!skillDef(id).passive && (s.skills.ranks[id] ?? 0) > 0 && s.skills.bar.length < barSize(s.level)) s.skills.bar.push(id);
}
