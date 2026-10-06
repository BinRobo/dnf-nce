import type { Slot } from '../save/schema';

/**
 * 装备目录：每章一个和课文绑定的系列（物品造型取自课文里的东西，卡片上印英文单词），
 * 另有不分章节的通用装备。图鉴按这里列出全部装备；没拿到的显示剪影。
 */
export type WType = 'dagger' | 'longsword' | 'greatsword' | 'hammer' | 'pistol' | 'rifle' | 'cannon' | 'bow' | 'staff' | 'wand' | 'orb' | 'tome';

export interface CatalogItem {
  id: string;
  name: string;
  slot: Slot;
  /** 图标 / 手持外观 key（icons/<look>.svg 或程序图标 icon_<look>） */
  look: string;
  wtype?: WType;
  /** 对应的英文单词与中文（系列装备才有） */
  word?: string;
  zh?: string;
  /** 第几章开始掉落；0 = 通用 */
  chapter: number;
  series?: string;
}

export const SLOTS: Slot[] = ['weapon', 'helmet', 'armor', 'shoes', 'accessory', 'ring'];
export const SLOT_NAME: Record<Slot, string> = { weapon: '武器', helmet: '头盔', armor: '衣服', shoes: '鞋子', accessory: '项链', ring: '戒指' };
export const WTYPE_NAME: Record<WType, string> = {
  dagger: '短剑', longsword: '长剑', greatsword: '巨剑', hammer: '锤', pistol: '手枪', rifle: '步枪', cannon: '手炮', bow: '弓', staff: '法杖', wand: '魔杖', orb: '法球', tome: '魔典',
};

export const SERIES: Record<string, { name: string; chapter: number; desc: string }> = {
  lost: { name: '失物招领', chapter: 1, desc: '第 1 章 “Is this your …?” 里的失物' },
};

export const CATALOG: CatalogItem[] = [
  // ---- 通用（旧存档里已有的名字也在这里）----
  { id: 'g_dagger', name: '字母短剑', slot: 'weapon', look: 'dagger', wtype: 'dagger', chapter: 0 },
  { id: 'g_longsword', name: '单词长剑', slot: 'weapon', look: 'longsword', wtype: 'longsword', chapter: 0 },
  { id: 'g_staff', name: '语法法杖', slot: 'weapon', look: 'staff', wtype: 'staff', chapter: 0 },
  { id: 'g_bow', name: '发音之弓', slot: 'weapon', look: 'bow', wtype: 'bow', chapter: 0 },
  { id: 'g_axe', name: '句型战斧', slot: 'weapon', look: 'axe', wtype: 'hammer', chapter: 0 },
  { id: 'g_greatsword', name: '拼写巨剑', slot: 'weapon', look: 'greatsword', wtype: 'greatsword', chapter: 0 },
  { id: 'g_pistol', name: '字母手枪', slot: 'weapon', look: 'pistol', wtype: 'pistol', chapter: 0 },
  { id: 'g_rifle', name: '音符步枪', slot: 'weapon', look: 'rifle', wtype: 'rifle', chapter: 0 },
  { id: 'g_cannon', name: '单词手炮', slot: 'weapon', look: 'cannon', wtype: 'cannon', chapter: 0 },
  { id: 'g_wand', name: '星光魔杖', slot: 'weapon', look: 'wand', wtype: 'wand', chapter: 0 },
  { id: 'g_orb', name: '水晶法球', slot: 'weapon', look: 'orb', wtype: 'orb', chapter: 0 },
  { id: 'g_tome', name: '单词魔典', slot: 'weapon', look: 'tome', wtype: 'tome', chapter: 0 },
  { id: 'g_cloth', name: '词汇布衣', slot: 'armor', look: 'cloth', chapter: 0 },
  { id: 'g_leather', name: '音标皮甲', slot: 'armor', look: 'leather', chapter: 0 },
  { id: 'g_chain', name: '课文锁甲', slot: 'armor', look: 'chainmail', chapter: 0 },
  { id: 'g_plate', name: '时态板甲', slot: 'armor', look: 'plate', chapter: 0 },
  { id: 'g_cloak', name: '听力斗篷', slot: 'armor', look: 'cloak', chapter: 0 },
  { id: 'g_necklace', name: '26字母项链', slot: 'accessory', look: 'necklace', chapter: 0 },
  { id: 'g_bracelet', name: '辅音手镯', slot: 'accessory', look: 'bracelet', chapter: 0 },
  { id: 'g_earring', name: '重音耳环', slot: 'accessory', look: 'earring', chapter: 0 },
  { id: 'g_amulet', name: '连读护符', slot: 'accessory', look: 'amulet', chapter: 0 },
  { id: 'g_ring', name: '元音戒指', slot: 'ring', look: 'ring', chapter: 0 },
  { id: 'g_helmet', name: '字母头盔', slot: 'helmet', look: 'hat', chapter: 0 },
  { id: 'g_boots', name: '疾风跑鞋', slot: 'shoes', look: 'shoes', chapter: 0 },
  // ---- 第 1 章「失物招领」----
  { id: 'c1_umbrella', name: '雨伞剑', slot: 'weapon', look: 'umbrella', wtype: 'longsword', word: 'umbrella', zh: '雨伞', chapter: 1, series: 'lost' },
  { id: 'c1_pen', name: '钢笔法杖', slot: 'weapon', look: 'penstaff', wtype: 'staff', word: 'pen', zh: '钢笔', chapter: 1, series: 'lost' },
  { id: 'c1_pencil', name: '铅笔弓', slot: 'weapon', look: 'pencilbow', wtype: 'bow', word: 'pencil', zh: '铅笔', chapter: 1, series: 'lost' },
  { id: 'c1_handbag', name: '手提包锤', slot: 'weapon', look: 'handbaghammer', wtype: 'hammer', word: 'handbag', zh: '手提包', chapter: 1, series: 'lost' },
  { id: 'c1_ticket', name: '车票匕首', slot: 'weapon', look: 'ticketdagger', wtype: 'dagger', word: 'ticket', zh: '票', chapter: 1, series: 'lost' },
  { id: 'c1_book', name: '书本巨剑', slot: 'weapon', look: 'bookblade', wtype: 'greatsword', word: 'book', zh: '书', chapter: 1, series: 'lost' },
  { id: 'c1_icecream', name: '冰淇淋水枪', slot: 'weapon', look: 'icecreampistol', wtype: 'pistol', word: 'ice cream', zh: '冰淇淋', chapter: 1, series: 'lost' },
  { id: 'c1_car', name: '小汽车手炮', slot: 'weapon', look: 'carcannon', wtype: 'cannon', word: 'car', zh: '小汽车', chapter: 1, series: 'lost' },
  { id: 'c1_keyboard', name: '键盘连射枪', slot: 'weapon', look: 'keyboardrifle', wtype: 'rifle', word: 'keyboard', zh: '键盘', chapter: 1, series: 'lost' },
  { id: 'c1_teacher', name: '老师的教鞭', slot: 'weapon', look: 'teacherwand', wtype: 'wand', word: 'teacher', zh: '老师', chapter: 1, series: 'lost' },
  { id: 'c1_glass', name: '玻璃杯法球', slot: 'weapon', look: 'glassorb', wtype: 'orb', word: 'glass', zh: '玻璃杯', chapter: 1, series: 'lost' },
  { id: 'c1_hat', name: '失主的帽子', slot: 'helmet', look: 'hat', word: 'hat', zh: '帽子', chapter: 1, series: 'lost' },
  { id: 'c1_coat', name: '失主的外套', slot: 'armor', look: 'coat', word: 'coat', zh: '外套', chapter: 1, series: 'lost' },
  { id: 'c1_suit', name: '失主的西装', slot: 'armor', look: 'suit', word: 'suit', zh: '西装', chapter: 1, series: 'lost' },
  { id: 'c1_shoes', name: '失主的皮鞋', slot: 'shoes', look: 'shoes', word: 'shoes', zh: '鞋', chapter: 1, series: 'lost' },
  { id: 'c1_tie', name: '领带项链', slot: 'accessory', look: 'tie', word: 'tie', zh: '领带', chapter: 1, series: 'lost' },
  { id: 'c1_passport', name: '护照护符', slot: 'accessory', look: 'passport', word: 'passport', zh: '护照', chapter: 1, series: 'lost' },
  { id: 'c1_watch', name: '手表戒指', slot: 'ring', look: 'watch', word: 'watch', zh: '手表', chapter: 1, series: 'lost' },
];

const byName = new Map(CATALOG.map((c) => [c.name, c]));
export const catalogOf = (name: string) => byName.get(name);

/** 第几章（1–6）：第 1–12 个副本是第 1 章 */
export const chapterOf = (dungeon: number) => Math.min(6, Math.max(1, Math.ceil(dungeon / 12)));

/** 某职业能用这件装备吗：武器看类别，通用护甲看职业护甲表，其余通用 */
export function usableBy(c: CatalogItem, wtypes: WType[], armor: string[]) {
  if (c.slot === 'weapon') return !!c.wtype && wtypes.includes(c.wtype);
  if (c.slot === 'armor' && c.chapter === 0) return armor.includes(c.look);
  return true;
}

/** 掉落候选：本章及以前的系列装备（权重高）+ 通用装备；按职业过滤 */
export function dropPool(chapter: number, slot?: Slot, cls?: { wtypes: WType[]; armor: string[] }) {
  const ok = (c: CatalogItem) => (!slot || c.slot === slot) && (!cls || usableBy(c, cls.wtypes, cls.armor));
  return {
    series: CATALOG.filter((c) => c.chapter > 0 && c.chapter <= chapter && ok(c)),
    generic: CATALOG.filter((c) => c.chapter === 0 && ok(c)),
  };
}
