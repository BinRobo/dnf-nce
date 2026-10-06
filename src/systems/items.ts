import { BALANCE } from '../config';
import type { Item, Rank, Rarity, SaveData, Slot } from '../save/schema';
import { pick, rand, uid } from './rng';
import { catalogOf, dropPool, SLOTS, type WType } from './catalog';

export const RARITY: Record<Rarity, { name: string; color: number; css: string; mult: number }> = {
  common: { name: '普通', color: 0xcfd3dc, css: '#cfd3dc', mult: 1 },
  uncommon: { name: '高级', color: 0x5aa9ff, css: '#5aa9ff', mult: 1.4 },
  rare: { name: '稀有', color: 0xb46bff, css: '#b46bff', mult: 2 },
  legendary: { name: '神器', color: 0xff6bc8, css: '#ff6bc8', mult: 2.8 },
  epic: { name: '史诗', color: 0xffb020, css: '#ffb020', mult: 4 },
};

const RANK_LUCK: Record<Rank, number> = { SSS: 2.2, SS: 1.8, S: 1.5, A: 1.2, B: 1, C: 0.8 };

const EPIC_NAMES: Partial<Record<Slot, string[]>> = {
  armor: ['史诗·莎士比亚战袍'],
  accessory: ['史诗·牛津之心'],
};

/** 稀有度档位 0–4：决定手持特效、命中特效与命中音效 */
export const rarityTier = (r: Rarity | undefined) => (r ? (['common', 'uncommon', 'rare', 'legendary', 'epic'] as Rarity[]).indexOf(r) : 0);

/** 史诗武器：只能用 Boss 掉落的史诗碎片打造（不靠运气，靠反复挑战 Boss） */
export interface EpicDef { name: string; look: string; color: number; desc: string; from: string; cls: 'sword' | 'gunner' | 'mage'; fx: 'letters' | 'waves' | 'tags' }
export const EPIC_WEAPONS: EpicDef[] = [
  { name: '史诗·亚历山大的字典剑', look: 'epic_sword', color: 0xffd34a, desc: '剑身刻满单词，命中时字母四散', from: '史诗工坊', cls: 'sword', fx: 'letters' },
  { name: '史诗·帕顿的金号角锤', look: 'epic_horn', color: 0xff7a2e, desc: '从吞声领主那里夺回的号角，命中时声波震荡', from: '史诗工坊', cls: 'sword', fx: 'waves' },
  { name: '史诗·胡迷斯的手杖剑', look: 'epic_canesword', color: 0x2fd39a, desc: '怪盗的绅士手杖，命中时名牌飞舞', from: '史诗工坊', cls: 'sword', fx: 'tags' },
  { name: '史诗·帕顿的扩音炮', look: 'epic_megacannon', color: 0xff7a2e, desc: '金喇叭炮口，每一发都是一声“Pardon?”', from: '史诗工坊', cls: 'gunner', fx: 'waves' },
  { name: '史诗·胡迷斯的名牌左轮', look: 'epic_badgerevolver', color: 0x2fd39a, desc: '转轮里装满名牌，命中时名牌飞舞', from: '史诗工坊', cls: 'gunner', fx: 'tags' },
  { name: '史诗·帕顿的号角法杖', look: 'epic_hornstaff', color: 0xff7a2e, desc: '杖头的小喇叭放出音波魔法', from: '史诗工坊', cls: 'mage', fx: 'waves' },
  { name: '史诗·胡迷斯的名牌羽杖', look: 'epic_quill', color: 0x2fd39a, desc: '怪盗的羽毛笔，命中时名牌飞舞', from: '史诗工坊', cls: 'mage', fx: 'tags' },
];
export const epicsFor = (cls: string | undefined) => EPIC_WEAPONS.filter((e) => e.cls === (cls ?? 'sword'));
export const epicDef = (name: string | undefined) => EPIC_WEAPONS.find((e) => e.name === name);
export const CRAFT_COST = { shard: 10, gold: 300 };

export function canCraft(save: SaveData) {
  return save.mats.shard >= CRAFT_COST.shard && save.gold >= CRAFT_COST.gold;
}

/** 打造史诗武器：属性按当前等级的史诗倍率，并比随机掉落高一截 */
export function craftEpic(save: SaveData, name: string): Item | null {
  const def = epicDef(name);
  if (!def || !canCraft(save)) return null;
  save.mats.shard -= CRAFT_COST.shard;
  save.gold -= CRAFT_COST.gold;
  const it = makeItem('epic', save.level + 2, def.from, 'weapon');
  it.name = def.name;
  save.inventory.push(it);
  recordCodex(save, [it]);
  if (!save.crafted.includes(name)) save.crafted.push(name);
  save.stats.epicDrops++;
  return it;
}

/** 按评级掉落稀有度：评级越高越容易出好东西 */
export function rollRarity(rank: Rank, bonus = 1): Rarity {
  const luck = RANK_LUCK[rank] * bonus;
  const weights: [Rarity, number][] = [
    ['epic', 1 * luck * luck],
    ['legendary', 4 * luck],
    ['rare', 12 * luck],
    ['uncommon', 30],
    ['common', 50 / luck],
  ];
  const total = weights.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [k, w] of weights) {
    if ((r -= w) <= 0) return k;
  }
  return 'common';
}

/**
 * 生成一件装备。chapter：掉落副本所在章（决定能掉哪些系列装备）；
 * 史诗只有护甲/项链会随机掉（史诗武器只能打造）。
 */
export function makeItem(rarity: Rarity, level: number, from: string, slot?: Slot, chapter = 1, cls?: { id: string; wtypes: WType[]; armor: string[] }): Item {
  let s: Slot = slot ?? pick<Slot>(SLOTS);
  let name: string;
  if (rarity === 'epic') {
    if (s === 'weapon') name = pick(epicsFor(cls?.id)).name;
    else {
      if (!EPIC_NAMES[s]) s = pick<Slot>(['armor', 'accessory']);
      name = pick(EPIC_NAMES[s]!);
    }
  } else {
    // 60% 掉本章系列装备（图鉴收集），其余是通用装备
    const pool = dropPool(chapter, s, cls);
    name = pick(pool.series.length && Math.random() < 0.6 ? pool.series : pool.generic.length ? pool.generic : pool.series).name;
  }
  const m = RARITY[rarity].mult;
  const lv = Math.max(1, level);
  const atkBase = (4 + lv * 1.5 + rand(4)) * m;
  return {
    uid: uid(),
    name,
    slot: s,
    rarity,
    atk: Math.round(s === 'weapon' ? atkBase : s === 'ring' ? atkBase / 3 : 0),
    hp: s === 'armor' ? Math.round(1 + m) : s === 'helmet' ? Math.round(m / 2 + 0.5) : s === 'accessory' ? Math.round((rarity === 'common' ? 0 : 1) + m / 2) : 0,
    crit: s === 'accessory' ? Math.round(3 * m) / 100 : s === 'shoes' ? Math.round(2 * m) / 100 : 0,
    enhance: 0,
    enhanceFails: 0,
    obtainedAt: Date.now(),
    from,
  };
}

/** 图鉴：记下拿到过的装备 */
export function recordCodex(save: SaveData, items: Item[]) {
  for (const it of items) {
    const c = catalogOf(it.name);
    if (c && !save.codex.items.includes(c.id)) save.codex.items.push(c.id);
  }
}

/** 强化后的攻击力：每级 +8% */
export const itemAtk = (it: Item) => Math.round(it.atk * (1 + it.enhance * 0.08));

/** 强化 +8 起需要 Boss 之魂（打 Boss 获得），高强化 = 多挑战 Boss */
export const SOUL_FROM = 7;
export function enhanceCost(it: Item) {
  return { stones: 1 + Math.floor(it.enhance / 2), gold: 50 * (it.enhance + 1), soul: it.enhance >= SOUL_FROM ? it.enhance - SOUL_FROM + 1 : 0 };
}

/** 强化必定成功（去掉失败概率，避免赌博感）；保留函数供界面显示 */
export function enhanceRate(_it: Item) {
  return 1;
}

export type EnhanceResult = 'ok' | 'fail' | 'max' | 'poor';

export function tryEnhance(save: SaveData, it: Item): EnhanceResult {
  if (it.enhance >= BALANCE.enhanceMax) return 'max';
  const cost = enhanceCost(it);
  if (save.stones < cost.stones || save.gold < cost.gold || save.mats.soul < cost.soul) return 'poor';
  save.stones -= cost.stones;
  save.gold -= cost.gold;
  save.mats.soul -= cost.soul;
  if (enhanceRate(it) >= 1) {
    it.enhance++;
    it.enhanceFails = 0;
    return 'ok';
  }
  it.enhanceFails++;
  return 'fail';
}

/** 分解得强化石 */
export function salvage(save: SaveData, it: Item) {
  const gain = { common: 1, uncommon: 2, rare: 4, legendary: 8, epic: 15 }[it.rarity];
  save.inventory = save.inventory.filter((x) => x.uid !== it.uid);
  for (const k of Object.keys(save.equipped) as Slot[]) if (save.equipped[k] === it.uid) delete save.equipped[k];
  save.stones += gain;
  if (it.rarity === 'epic') save.mats.shard += 3;
  return gain;
}
