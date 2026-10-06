import Phaser from 'phaser';
import { sfx } from '../audio/sound';
import type { Item } from '../save/schema';
import { EPIC_WEAPONS, epicDef, RARITY, rarityTier } from '../systems/items';
import { weaponLook } from '../gfx/icons';
import type { Fx } from './fx';

/** 当前武器的命中风格：档位越高，命中特效与音效越炫 */
export interface WeaponStyle {
  tier: number;
  color: number;
  look: string | null;
}

export function weaponStyle(weapon: Item | undefined): WeaponStyle {
  const tier = rarityTier(weapon?.rarity);
  return { tier, color: weapon ? epicDef(weapon.name)?.color ?? RARITY[weapon.rarity].color : 0xffffff, look: weaponLook(weapon) };
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const TAG_COLORS = [0xff6b6b, 0xffd34a, 0x5aa9ff, 0x7dffa5, 0xd28bff];

/**
 * 在普通命中特效之上叠加稀有度特效。heavy = 终结/重击（特效与音效更足）。
 * 1 蓝：蓝色闪点；2 紫：紫色火花 + 金属铃响；3 粉：冲击波环 + 水晶叮；4 史诗：专属特效 + 史诗重击音
 */
export function weaponHit(scene: Phaser.Scene, fx: Fx, w: WeaponStyle, x: number, y: number, heavy: boolean, withSound = true) {
  const { tier, color } = w;
  if (tier <= 0) return;
  if (withSound && (heavy || tier >= 2)) sfx(`hit_t${tier}`, { volume: heavy ? 0.7 : 0.4, detune: (Math.random() - 0.5) * 150 });
  fx.burst(x, y, 6 + tier * 4, color);
  if (tier >= 2) sparks(scene, x, y, color, tier * 3);
  if (tier >= 3 && heavy) fx.ring(x, y, color, tier === 4 ? 2.2 : 1.7);
  if (tier < 4) return;
  if (heavy) fx.shake(4, 100);
  const e = EPIC_WEAPONS.find((k) => k.look === w.look);
  if (e?.fx === 'waves') soundWaves(scene, x, y, color, heavy ? 3 : 1);
  else if (e?.fx === 'tags') nameTags(scene, x, y, heavy ? 6 : 2);
  else letters(scene, x, y, color, heavy ? 6 : 2);
}

function sparks(scene: Phaser.Scene, x: number, y: number, color: number, n: number) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, d = 50 + Math.random() * 70;
    const s = scene.add.image(x, y, 'fx_dot').setTint(color).setBlendMode('ADD').setScale(0.35, 1.4).setRotation(a + Math.PI / 2).setDepth(60);
    scene.tweens.add({ targets: s, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, alpha: 0, scaleY: 0.2, duration: 260, ease: 'Quad.out', onComplete: () => s.destroy() });
  }
}

/** 金号角锤：一圈圈橙色声波 */
function soundWaves(scene: Phaser.Scene, x: number, y: number, color: number, n: number) {
  for (let i = 0; i < n; i++) {
    const c = scene.add.circle(x, y, 20).setStrokeStyle(8, color, 1).setDepth(60).setBlendMode('ADD');
    scene.tweens.add({ targets: c, scale: 6, alpha: 0, delay: i * 90, duration: 420, ease: 'Quad.out', onComplete: () => c.destroy() });
  }
}

/** 名牌羽杖：彩色名牌四散飞舞 */
function nameTags(scene: Phaser.Scene, x: number, y: number, n: number) {
  for (let i = 0; i < n; i++) {
    const r = scene.add.rectangle(x, y, 30, 18, TAG_COLORS[i % TAG_COLORS.length]).setStrokeStyle(3, 0x2b2a4a).setDepth(60);
    const dx = (Math.random() - 0.3) * 260, dy = -80 - Math.random() * 120;
    scene.tweens.add({ targets: r, x: x + dx, y: y + dy, angle: (Math.random() - 0.5) * 540, duration: 420, ease: 'Quad.out' });
    scene.tweens.add({ targets: r, y: y + dy + 160, alpha: 0, delay: 420, duration: 380, ease: 'Quad.in', onComplete: () => r.destroy() });
  }
}

/** 字典剑：金色字母迸发 */
function letters(scene: Phaser.Scene, x: number, y: number, color: number, n: number) {
  const css = `#${color.toString(16).padStart(6, '0')}`;
  for (let i = 0; i < n; i++) {
    const t = scene.add.text(x, y, LETTERS[Math.floor(Math.random() * 26)], {
      fontFamily: 'Arial Black, Arial', fontSize: '34px', fontStyle: 'bold', color: css, stroke: '#2b2a4a', strokeThickness: 5,
    }).setOrigin(0.5).setDepth(60);
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, d = 90 + Math.random() * 90;
    scene.tweens.add({ targets: t, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, angle: (Math.random() - 0.5) * 120, scale: 1.3, alpha: 0, duration: 650, ease: 'Quad.out', onComplete: () => t.destroy() });
  }
}
