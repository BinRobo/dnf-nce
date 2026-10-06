import { BALANCE, expToNext } from '../config';
import type { Item, Job, SaveData } from '../save/schema';
import { itemAtk } from './items';

export const JOBS: Record<Job, { name: string; color: number; desc: string }> = {
  novice: { name: '见习冒险家', color: 0x8ec5ff, desc: '' },
  swordsman: { name: '单词剑士', color: 0xff7a59, desc: '暴击伤害提升' },
  mage: { name: '语法法师', color: 0x9b7bff, desc: '连击加成提升' },
  ranger: { name: '听力游侠', color: 0x5fd38d, desc: '额外生命 +1' },
};

export function equippedItems(s: SaveData): Item[] {
  return Object.values(s.equipped)
    .map((id) => s.inventory.find((i) => i.uid === id))
    .filter((i): i is Item => !!i);
}

export function playerStats(s: SaveData) {
  const eq = equippedItems(s);
  const atk = BALANCE.baseAtk + (s.level - 1) * BALANCE.atkPerLevel + eq.reduce((n, i) => n + itemAtk(i), 0);
  const hp = BALANCE.baseHp + eq.reduce((n, i) => n + i.hp, 0) + (s.job === 'ranger' ? 1 : 0);
  // 职业加成：剑士暴击伤害、神枪手暴击率、魔法师连击加成
  const cls = s.cls ?? 'sword';
  const crit = Math.min(0.6, (cls === 'gunner' ? 0.1 : 0.05) + eq.reduce((n, i) => n + i.crit, 0));
  const critMult = cls === 'sword' ? 2.5 : 2;
  const comboBonus = (cls === 'mage' ? 0.08 : 0.05) + (s.skills.ranks.combo ?? 0) * 0.01;
  // v2：生命（心）固定 5 颗；防具/饰品的“生命”属性改为护盾（答错先扣护盾，每房间回满）
  const hearts = BALANCE.baseHp + (s.job === 'ranger' ? 1 : 0);
  const gs = s.skills.ranks.gshield ?? 0;
  const shield = Math.min(8, eq.reduce((n, i) => n + i.hp, 0) + (gs ? (gs >= 5 ? 2 : 1) : 0));
  const hints = 1 + eq.filter((i) => i.slot === 'accessory').length + (s.partners.includes('sophie') ? 1 : 0);
  return { atk, hp, crit, critMult, comboBonus, hearts, shield, hints };
}

/** 加经验，返回升了几级 */
export function addExp(s: SaveData, amount: number): number {
  let ups = 0;
  s.exp += amount;
  while (s.level < BALANCE.maxLevel && s.exp >= expToNext(s.level)) {
    s.exp -= expToNext(s.level);
    s.level++;
    ups++;
  }
  if (s.level >= BALANCE.maxLevel) s.exp = Math.min(s.exp, expToNext(s.level));
  return ups;
}

/** v3 起职业在创建角色时选择，不再有 10 级转职 */
export const canChangeJob = (_s: SaveData) => false;
