import type Phaser from 'phaser';
import { equippedItems } from '../systems/player';
import { epicDef, RARITY, rarityTier } from '../systems/items';
import type { SaveData } from '../save/schema';
import { weaponLook } from './icons';
import { hasRig, Puppet } from './puppet';
import { classOf, heroRig } from '../systems/classes';

/** 主角形象随装备与等级变化：手持武器 = 装备的武器（稀有度发光）；5 级起脚下光环，10 级起金色光环 */
export function makeHero(scene: Phaser.Scene, x: number, y: number, s: SaveData, scale = 0.5) {
  const rig = heroRig(s.cls ?? 'sword', s.gender ?? 'm');
  const p = new Puppet(scene, x, y, hasRig(scene, rig) ? rig : 'hero', scale, { fallback: `player_${s.job}` });
  const weapon = equippedItems(s).find((i) => i.slot === 'weapon');
  p.setWeapon(weaponLook(weapon) ?? classOf(s).defaultLook);
  p.setCostume(s.wardrobe?.worn ?? {});
  const tier = rarityTier(weapon?.rarity);
  if (weapon && tier > 0) p.weaponFx(tier, epicDef(weapon.name)?.color ?? RARITY[weapon.rarity].color);
  if (s.level >= 10) p.aura(0xffd34a);
  else if (s.level >= 5) p.aura(0x9fe3ff);
  return p;
}
