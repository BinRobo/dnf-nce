import Phaser from 'phaser';
import { sfx } from '../audio/sound';
import { Fx, wait } from './fx';
import type { SkillDef } from './skilldata';
import { runRecipe } from './recipe';

/**
 * 主角技能：随等级解锁，等级越高终结技越华丽（题量不变，只影响演出与伤害数字）。
 * 每次答对的“终结一击”从已解锁技能中挑：漂亮/完美档优先用最高级的。
 */
// ---------------- 程序生成的逐帧特效贴图 ----------------

export function makeSkillTextures(scene: Phaser.Scene) {
  if (scene.textures.exists('fx_boom_0')) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  // 爆炸：7 帧，火球膨胀 → 环 → 消散
  for (let f = 0; f < 7; f++) {
    g.clear();
    const t = f / 6;
    const r = 20 + t * 90;
    g.fillStyle(0xffe14a, 1 - t).fillCircle(128, 128, r * (1 - t * 0.5));
    g.fillStyle(0xff9f43, 0.9 - t * 0.8).fillCircle(128, 128, r * 0.7);
    g.lineStyle(10 * (1 - t) + 2, 0xffffff, 1 - t).strokeCircle(128, 128, r);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + f * 0.2;
      g.fillStyle(0xfff2b0, 1 - t).fillCircle(128 + Math.cos(a) * r * 1.1, 128 + Math.sin(a) * r * 1.1, 8 * (1 - t) + 1);
    }
    g.generateTexture(`fx_boom_${f}`, 256, 256);
  }
  // 刀光序列：6 帧，月牙由细变粗再淡出
  for (let f = 0; f < 6; f++) {
    g.clear();
    const t = f / 5;
    const r = 70 + t * 40;
    const thick = 10 + Math.sin(t * Math.PI) * 34;
    const a0 = -1.6 + t * 0.6, a1 = 1.0 + t * 0.6;
    g.fillStyle(0x9fe3ff, 1 - t * 0.7);
    g.beginPath();
    g.arc(128, 128, r, a0, a1, false);
    g.arc(128 - thick, 128, r - thick * 0.6, a1 - 0.1, a0 + 0.1, true);
    g.closePath();
    g.fillPath();
    g.fillStyle(0xffffff, 1 - t);
    g.beginPath();
    g.arc(128, 128, r - 3, a0 + 0.2, a1 - 0.2, false);
    g.arc(128 - thick * 0.4, 128, r - thick * 0.4, a1 - 0.3, a0 + 0.3, true);
    g.closePath();
    g.fillPath();
    g.generateTexture(`fx_slashseq_${f}`, 256, 256);
  }
  // 旋风：一圈弧线
  g.clear();
  for (let i = 0; i < 3; i++) g.lineStyle(8 - i * 2, 0xffffff, 0.9 - i * 0.25).beginPath().arc(128, 128, 100 - i * 18, 0, Math.PI * 1.6).strokePath();
  g.generateTexture('fx_whirl', 256, 256);
  // 剑气：大月牙
  g.clear();
  g.fillStyle(0xffd34a, 1).beginPath();
  g.arc(60, 128, 110, -1.2, 1.2, false);
  g.arc(20, 128, 90, 1.1, -1.1, true);
  g.closePath();
  g.fillPath();
  g.fillStyle(0xffffff, 1).beginPath();
  g.arc(60, 128, 104, -0.9, 0.9, false);
  g.arc(36, 128, 92, 0.85, -0.85, true);
  g.closePath();
  g.fillPath();
  g.generateTexture('fx_wave', 200, 256);
  // 落雷：锯齿线
  g.clear();
  const pts: [number, number][] = [[60, 0], [44, 80], [74, 90], [40, 190], [80, 200], [52, 330], [66, 330], [100, 190], [62, 180], [96, 84], [66, 76], [80, 0]];
  g.fillStyle(0xffffff, 1).fillPoints(pts.map(([x, y]) => new Phaser.Math.Vector2(x, y)), true);
  g.lineStyle(6, 0xb8a6ff, 1).strokePoints(pts.map(([x, y]) => new Phaser.Math.Vector2(x, y)), true);
  g.generateTexture('fx_bolt', 140, 330);
  // 光柱（升级、觉醒）：竖条，多层透明叠出渐变
  g.clear();
  for (let i = 0; i < 12; i++) g.fillStyle(0xffffff, 0.08).fillRect(60 - i * 5, 0, 10 + i * 10, 720);
  g.generateTexture('fx_pillar', 130, 720);
  // 速度线（觉醒 cut-in 背景）
  g.clear();
  for (let i = 0; i < 46; i++) {
    const y = (i * 37) % 300;
    const len = 200 + ((i * 97) % 500);
    g.fillStyle(0xffffff, 0.15 + ((i * 13) % 10) / 20).fillRect((i * 151) % 1280, y, len, 3 + (i % 3));
  }
  g.generateTexture('fx_speed', 1280, 300);
  // 地裂
  g.clear();
  g.lineStyle(8, 0x2b2a4a, 1);
  g.beginPath().moveTo(0, 20).lineTo(60, 10).lineTo(110, 28).lineTo(170, 8).lineTo(240, 24).lineTo(300, 14).strokePath();
  g.lineStyle(4, 0xff9f43, 1);
  g.beginPath().moveTo(0, 20).lineTo(60, 10).lineTo(110, 28).lineTo(170, 8).lineTo(240, 24).lineTo(300, 14).strokePath();
  g.generateTexture('fx_crack', 300, 40);
  // 冰晶
  g.clear();
  const ice: [number, number][] = [[40, 0], [58, 50], [80, 60], [58, 74], [40, 140], [22, 74], [0, 60], [22, 50]];
  g.fillStyle(0xd9f6ff, 0.95).fillPoints(ice.map(([x, y]) => new Phaser.Math.Vector2(x, y)), true);
  g.lineStyle(4, 0x2b2a4a, 1).strokePoints(ice.map(([x, y]) => new Phaser.Math.Vector2(x, y)), true);
  g.fillStyle(0xffffff, 1).fillTriangle(40, 10, 50, 52, 40, 60);
  g.generateTexture('fx_ice', 80, 140);
  // 火柱：5 帧
  for (let f = 0; f < 5; f++) {
    g.clear();
    const h = 120 + f * 60;
    for (let i = 0; i < 6; i++) {
      const w = 70 - i * 10;
      g.fillStyle([0xe8505b, 0xff7a45, 0xff9f43, 0xffc94a, 0xffe14a, 0xffffff][i], 0.9).fillEllipse(64, 400 - h / 2 + i * 6, w + Math.sin(f + i) * 8, h - i * 18);
    }
    g.generateTexture(`fx_flame_${f}`, 128, 400);
  }
  g.destroy();

  scene.anims.create({ key: 'anim_boom', frames: Array.from({ length: 7 }, (_, i) => ({ key: `fx_boom_${i}` })), frameRate: 24 });
  scene.anims.create({ key: 'anim_flame', frames: Array.from({ length: 5 }, (_, i) => ({ key: `fx_flame_${i}` })), frameRate: 18, yoyo: true });
  scene.anims.create({ key: 'anim_slash', frames: Array.from({ length: 6 }, (_, i) => ({ key: `fx_slashseq_${i}` })), frameRate: 30 });
}

export function boom(scene: Phaser.Scene, x: number, y: number, scale = 1, tint?: number) {
  const s = scene.add.sprite(x, y, 'fx_boom_0').setDepth(58).setBlendMode('ADD').setScale(scale);
  if (tint !== undefined) s.setTint(tint);
  s.play('anim_boom');
  s.once('animationcomplete', () => s.destroy());
}

export function slashAnim(scene: Phaser.Scene, x: number, y: number, angle: number, scale = 1, tint?: number) {
  const s = scene.add.sprite(x, y, 'fx_slashseq_0').setDepth(57).setBlendMode('ADD').setAngle(angle).setScale(scale);
  if (tint !== undefined) s.setTint(tint);
  s.play('anim_slash');
  s.once('animationcomplete', () => s.destroy());
}

/**
 * 技能演出（只管画面与音效）。onHit(i, last) 由调用方结算第 i 段伤害。
 * rank 越高：段数越多、特效越大。返回总段数。
 */
export async function castSkill(
  scene: Phaser.Scene, fx: Fx, def: SkillDef, rank: number,
  from: { x: number; y: number }, to: { x: number; y: number }, onHit: (i: number, last: boolean) => void,
  target?: Phaser.GameObjects.Image,
) {
  const k = 1 + (rank - 1) * 0.25; // 特效尺寸
  // 技能专属音效：出招声 + 每段命中声（缺失时退回通用音效）
  sfx(`sk_${def.id}_cast`, { volume: 0.8 }, def.id.startsWith('g_') ? 'gun_reload' : def.id.startsWith('m_') ? 'mage_cast' : 'swing2');
  const userHit = onHit;
  onHit = (i, last) => {
    sfx(`sk_${def.id}_hit`, { volume: last ? 0.85 : 0.55, detune: last ? 0 : i * 60 }, last ? 'hit_heavy' : 'hit_light');
    userHit(i, last);
  };
  const css = `#${def.color.toString(16).padStart(6, '0')}`;
  banner(scene, from.x + 60, from.y - 230, `${def.name}${rank > 1 ? ' Lv.' + rank : ''}`, css);
  const hits = async (n: number, gap: number, each: (i: number) => void) => {
    for (let i = 0; i < n; i++) {
      each(i);
      onHit(i, i === n - 1);
      await wait(scene, gap);
    }
  };
  // 数据驱动的技能（神枪手、魔法师全部技能，剑士的元素技能）
  if (def.fx) return runRecipe(scene, fx, def, rank, from, to, target, onHit);
  switch (def.id) {
    case 'rising':
      // 上挑：敌人被挑起，空中追击
      await hits(2 + rank, 90, (i) => slashAnim(scene, to.x, to.y - i * 22, -70 + i * 50, 1.3 * k, i % 2 ? 0xffffff : def.color));
      return;
    case 'whirl': {
      sfx('swing3');
      const w = scene.add.image(to.x, to.y, 'fx_whirl').setDepth(57).setBlendMode('ADD').setTint(def.color).setScale(0.5);
      scene.tweens.add({ targets: w, angle: 1080, scale: 2.2 * k, alpha: 0, duration: 700, onComplete: () => w.destroy() });
      await hits(3 + rank, 80, (i) => { fx.burst(to.x, to.y, 8, def.color); slashAnim(scene, to.x, to.y, i * 90, 1.2 * k, def.color); });
      return;
    }
    case 'thrust': {
      // 残影穿刺：一排残影 + 横向刀光
      for (let i = 0; i < 4 + rank; i++) {
        const ghost = scene.add.rectangle(from.x + i * 40, from.y - 90, 60, 150, def.color, 0.35).setDepth(19).setBlendMode('ADD');
        scene.tweens.add({ targets: ghost, alpha: 0, x: ghost.x + 120, duration: 300, delay: i * 25, onComplete: () => ghost.destroy() });
      }
      const line = scene.add.rectangle(to.x - 300, to.y, 20, 18 * k, 0xffffff).setDepth(57).setOrigin(0, 0.5).setBlendMode('ADD');
      scene.tweens.add({ targets: line, width: 700, alpha: 0, duration: 260, onComplete: () => line.destroy() });
      await hits(2 + rank, 60, () => fx.burst(to.x, to.y, 10, def.color));
      return;
    }
    case 'wave': {
      sfx('swing2');
      for (let r = 0; r < rank; r++) {
        const w = scene.add.image(from.x + 60, to.y + (r - (rank - 1) / 2) * 50, 'fx_wave').setDepth(57).setBlendMode('ADD').setScale(0.9 * k);
        scene.tweens.add({ targets: w, x: to.x, scale: 1.8 * k, duration: 220, delay: r * 90, ease: 'Quad.in', onComplete: () => w.destroy() });
      }
      await wait(scene, 220 + (rank - 1) * 90);
      boom(scene, to.x, to.y, 1.8 * k, 0xffe14a);
      await hits(rank, 90, () => fx.ring(to.x, to.y, 0xffe14a, 2 * k));
      return;
    }
    case 'frost': {
      const n = 3 + rank * 2;
      const crystals: Phaser.GameObjects.Image[] = [];
      for (let i = 0; i < n; i++) {
        const c = scene.add.image(to.x + (Math.random() - 0.5) * 160 * k, to.y + 60, 'fx_ice').setDepth(56).setOrigin(0.5, 1).setScale(0.2).setAngle((Math.random() - 0.5) * 40);
        scene.tweens.add({ targets: c, scale: 0.6 + Math.random() * 0.5 * k, duration: 160, delay: i * 30, ease: 'Back.out' });
        crystals.push(c);
      }
      sfx('shield');
      await wait(scene, 350);
      fx.flashScreen(0xd9f6ff);
      sfx('hit_crit');
      for (const c of crystals) {
        fx.burst(c.x, c.y - 40, 6, 0xd9f6ff);
        scene.tweens.add({ targets: c, alpha: 0, y: c.y + 30, duration: 300, onComplete: () => c.destroy() });
      }
      await hits(2 + rank, 60, (i) => slashAnim(scene, to.x, to.y, -40 + i * 40, 1.4 * k, 0xd9f6ff));
      return;
    }
    case 'thunder': {
      fx.flashScreen(0xd8ccff);
      const n = 2 + rank;
      for (let i = 0; i < n; i++) {
        const dx = (i - (n - 1) / 2) * 50;
        const b = scene.add.image(to.x + dx, -20, 'fx_bolt').setDepth(58).setBlendMode('ADD').setOrigin(0.5, 0).setScale(0.8 * k, 0.1);
        scene.tweens.add({ targets: b, scaleY: 1.4, duration: 80, yoyo: true, hold: 120, onComplete: () => b.destroy() });
        sfx('hit_heavy', { detune: i * 120, volume: 0.6 });
        onHit(i, false);
        await wait(scene, 90);
      }
      boom(scene, to.x, to.y + 40, 1.7 * k, 0xb8a6ff);
      onHit(n, true);
      return;
    }
    case 'fire': {
      const n = 1 + rank;
      for (let i = 0; i < n; i++) {
        const f = scene.add.sprite(to.x + (i - (n - 1) / 2) * 70, 476, 'fx_flame_0').setOrigin(0.5, 1).setDepth(57).setBlendMode('ADD').setScale(0.9 * k);
        f.play('anim_flame');
        f.once('animationcomplete', () => f.destroy());
        sfx('launch', { volume: 0.5 });
        onHit(i, false);
        await wait(scene, 120);
      }
      boom(scene, to.x, to.y, 1.6 * k, 0xff7a45);
      onHit(n, true);
      return;
    }
    case 'meteor': {
      sfx('launch');
      const p = scene.add.image(to.x, -40, 'fx_pillar').setOrigin(0.5, 0).setDepth(56).setBlendMode('ADD').setTint(0xff9f43).setScale(k, 0.1);
      scene.tweens.add({ targets: p, scaleY: 1, duration: 200, yoyo: true, hold: 200, onComplete: () => p.destroy() });
      await wait(scene, 220);
      const c = scene.add.image(to.x, 470, 'fx_crack').setDepth(6).setScale(0.2, 1);
      scene.tweens.add({ targets: c, scaleX: 1.6 * k, duration: 160 });
      scene.tweens.add({ targets: c, alpha: 0, delay: 900, duration: 400, onComplete: () => c.destroy() });
      boom(scene, to.x, to.y, 2.4 * k, 0xff9f43);
      fx.shake(10, 260);
      await hits(rank, 80, () => fx.ring(to.x, to.y, 0xff9f43, 2.5 * k));
      return;
    }
    case 'letters': {
      const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      const n = 4 + rank * 2;
      for (let i = 0; i < n; i++) {
        const t = scene.add.text(to.x + (Math.random() - 0.5) * 220, -60, abc[Math.floor(Math.random() * 26)], {
          fontFamily: 'Arial Black, Arial', fontSize: `${Math.round(60 * k)}px`, fontStyle: 'bold', color: '#ffe14a', stroke: '#7a3b00', strokeThickness: 8,
        }).setOrigin(0.5).setDepth(58).setAngle(Math.random() * 60 - 30);
        scene.tweens.add({ targets: t, y: to.y, duration: 260, ease: 'Quad.in', delay: i * 70, onComplete: () => {
          boom(scene, t.x, t.y, 0.7 * k, 0xffe14a);
          sfx('hit_light', { detune: i * 80, volume: 0.5 });
          onHit(i, i === n - 1);
          t.destroy();
        } });
      }
      await wait(scene, 260 + n * 70 + 60);
      return;
    }
    case 'storm': {
      const n = 8 + rank * 3;
      fx.zoom(1.1, 600);
      await hits(n, 45, (i) => {
        slashAnim(scene, to.x + (Math.random() - 0.5) * 120, to.y + (Math.random() - 0.5) * 120, Math.random() * 360, 1.2 * k, [0xff6bc8, 0xffffff, 0xffe14a][i % 3]);
        if (i % 3 === 0) sfx(`swing${(i % 3) + 1}`, { volume: 0.4 });
      });
      boom(scene, to.x, to.y, 2.2 * k, 0xff6bc8);
      return;
    }
    default:
      await hits(rank, 80, (i) => slashAnim(scene, to.x, to.y, -20 + i * 40, 1.4 * k, i ? def.color : undefined));
  }
}

/** 技能名横幅（DNF 式）：大字 + 底色条 */
export function banner(scene: Phaser.Scene, x: number, y: number, name: string, css: string) {
  const bar = scene.add.rectangle(x, y, 300, 52, 0x1b1030, 0.75).setDepth(86).setScale(0, 1);
  const label = scene.add.text(x, y, name, {
    fontFamily: '"PingFang SC","Microsoft YaHei",sans-serif', fontSize: '38px', fontStyle: 'bold', color: css, stroke: '#1b1030', strokeThickness: 8,
  }).setOrigin(0.5).setDepth(87).setScale(1.6).setAlpha(0);
  scene.tweens.add({ targets: bar, scaleX: 1, duration: 120 });
  scene.tweens.add({ targets: label, scale: 1, alpha: 1, duration: 160, ease: 'Back.out' });
  scene.tweens.add({ targets: [bar, label], alpha: 0, delay: 800, duration: 300, onComplete: () => { bar.destroy(); label.destroy(); } });
}
