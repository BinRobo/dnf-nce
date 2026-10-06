import Phaser from 'phaser';
import { sfx } from '../audio/sound';
import { wait } from './fx';

/**
 * 元素特效：火 / 冰 / 雷 / 光。素材：
 * - 粒子贴图 public/assets/fx/particles/*.png（Kenney Particle Pack, CC0）→ 纹理 p_<名字>
 * - 美术序列帧与造型 public/assets/fx/*.svg → 纹理 fx2_<名字>
 * 每个元素按“蓄力 → 释放 → 命中 → 余韵”四段演出；reduce = 家长设置的“减弱特效”。
 */
export const PARTICLES = [
  'circle_1', 'circle_2', 'dirt_1', 'fire_1', 'fire_2', 'flame_1', 'light_1', 'light_2', 'magic_1', 'magic_2', 'scorch_1',
  'slash_1', 'smoke_1', 'smoke_2', 'spark_1', 'spark_2', 'star_1', 'star_2', 'trace_1', 'trace_2', 'twirl_1',
];
export const FX2 = ['ice_spike', 'ice_block', 'ice_shard', 'holy_cross', 'light_ray', 'flame_dragon', 'phoenix', ...[1, 2, 3, 4, 5, 6].map((i) => `fire_burst_${i}`)];

export function queueElementAssets(scene: Phaser.Scene) {
  for (const p of PARTICLES) scene.load.image(`p_${p}`, `assets/fx/particles/${p}.png`);
  for (const f of FX2) scene.load.svg(`fx2_${f}`, `assets/fx/${f}.svg`);
}

export const ELEMENT_COLOR = { fire: 0xff7a2e, ice: 0x9fe8ff, thunder: 0xb8a6ff, light: 0xffe9a0 };

type Img = Phaser.GameObjects.Image;

export class Elements {
  constructor(private scene: Phaser.Scene, private reduce = false) {
    if (!scene.anims.exists('anim_fireburst') && scene.textures.exists('fx2_fire_burst_1')) {
      scene.anims.create({ key: 'anim_fireburst', frames: [1, 2, 3, 4, 5, 6].map((i) => ({ key: `fx2_fire_burst_${i}` })), frameRate: 16 });
    }
  }

  private tex(key: string, fallback = 'fx_dot') {
    return this.scene.textures.exists(key) ? key : fallback;
  }

  /** 整屏色调（火偏暖、冰偏蓝、雷先暗） */
  tint(color: number, alpha: number, ms: number) {
    const r = this.scene.add.rectangle(0, 0, 1280, 720, color, this.reduce ? alpha * 0.4 : alpha).setOrigin(0).setDepth(84).setScrollFactor(0);
    this.scene.tweens.add({ targets: r, alpha: 0, duration: ms, onComplete: () => r.destroy() });
    return r;
  }

  /** 冰霜暗角：屏幕四周结霜 */
  frostVignette(ms = 900) {
    const g = this.scene.add.graphics().setDepth(84).setScrollFactor(0);
    for (let i = 0; i < 6; i++) g.lineStyle(36 - i * 5, 0xd9f6ff, 0.12 + i * 0.03).strokeRect(i * 6, i * 6, 1280 - i * 12, 720 - i * 12);
    g.setAlpha(0);
    this.scene.tweens.add({ targets: g, alpha: 1, duration: 150, yoyo: true, hold: ms, onComplete: () => g.destroy() });
  }

  /** 一次性粒子爆发 */
  burst(x: number, y: number, key: string, o: { n?: number; color?: number | number[]; speed?: [number, number]; scale?: [number, number]; life?: number; gravity?: number; angle?: [number, number]; add?: boolean; depth?: number } = {}) {
    const e = this.scene.add.particles(x, y, this.tex(`p_${key}`), {
      speed: { min: o.speed?.[0] ?? 80, max: o.speed?.[1] ?? 260 },
      angle: { min: o.angle?.[0] ?? 0, max: o.angle?.[1] ?? 360 },
      scale: { start: o.scale?.[0] ?? 0.5, end: o.scale?.[1] ?? 0 },
      alpha: { start: 1, end: 0 },
      lifespan: o.life ?? 600,
      gravityY: o.gravity ?? 0,
      tint: o.color ?? 0xffffff,
      rotate: { min: 0, max: 360 },
      blendMode: o.add === false ? 'NORMAL' : 'ADD',
      emitting: false,
    }).setDepth(o.depth ?? 58);
    e.explode(this.reduce ? Math.ceil((o.n ?? 20) / 2) : o.n ?? 20);
    this.scene.time.delayedCall((o.life ?? 600) + 100, () => e.destroy());
  }

  /** 蓄力：光点从四周汇聚到 (x, y) */
  async charge(x: number, y: number, color: number, ms = 380) {
    const e = this.scene.add.particles(x, y, this.tex('p_light_1'), {
      emitZone: { type: 'edge', source: new Phaser.Geom.Circle(0, 0, 130), quantity: 24 },
      moveToX: x, moveToY: y, lifespan: 360, scale: { start: 0.25, end: 0.05 }, alpha: { start: 0.2, end: 1 },
      tint: color, frequency: 15, blendMode: 'ADD',
    }).setDepth(57);
    const glow = this.scene.add.image(x, y, this.tex('p_circle_1')).setTint(color).setBlendMode('ADD').setScale(0.1).setDepth(57);
    this.scene.tweens.add({ targets: glow, scale: 0.7, alpha: { from: 0.4, to: 1 }, duration: ms });
    await wait(this.scene, ms);
    e.stop();
    this.scene.tweens.add({ targets: glow, scale: 1.4, alpha: 0, duration: 150, onComplete: () => glow.destroy() });
    this.scene.time.delayedCall(400, () => e.destroy());
  }

  // ---------------- 雷 ----------------

  /** 分叉闪电：程序生成的折线，闪烁 3 次 */
  lightning(x1: number, y1: number, x2: number, y2: number, color = 0xc9b8ff, width = 6, branches = 3) {
    const g = this.scene.add.graphics().setDepth(59).setBlendMode('ADD');
    const path = (ax: number, ay: number, bx: number, by: number, jag: number, segs: number) => {
      const pts: [number, number][] = [[ax, ay]];
      for (let i = 1; i < segs; i++) {
        const t = i / segs;
        pts.push([ax + (bx - ax) * t + (Math.random() - 0.5) * jag, ay + (by - ay) * t + (Math.random() - 0.5) * jag * 0.3]);
      }
      pts.push([bx, by]);
      return pts;
    };
    const draw = () => {
      g.clear();
      const main = path(x1, y1, x2, y2, 70, 12);
      for (const [w, c, a] of [[width * 3, color, 0.25], [width, color, 0.9], [width * 0.4, 0xffffff, 1]] as [number, number, number][]) {
        g.lineStyle(w, c, a).beginPath().moveTo(main[0][0], main[0][1]);
        for (const p of main) g.lineTo(p[0], p[1]);
        g.strokePath();
      }
      for (let b = 0; b < branches; b++) {
        const s = main[2 + Math.floor(Math.random() * (main.length - 4))];
        const br = path(s[0], s[1], s[0] + (Math.random() - 0.5) * 220, s[1] + 60 + Math.random() * 120, 40, 5);
        g.lineStyle(width * 0.5, color, 0.8).beginPath().moveTo(br[0][0], br[0][1]);
        for (const p of br) g.lineTo(p[0], p[1]);
        g.strokePath();
      }
    };
    draw();
    let n = 0;
    this.scene.time.addEvent({ delay: 55, repeat: 3, callback: () => (++n < 4 ? draw() : g.destroy()) });
    this.burst(x2, y2, 'spark_1', { n: 14, color: [color, 0xffffff], scale: [0.35, 0], life: 350 });
  }

  /** 敌人全身爬电弧，抖动 */
  shock(target: Img | undefined, ms = 600) {
    if (!target?.active) return;
    const x0 = target.x;
    const ev = this.scene.time.addEvent({
      delay: 70, repeat: Math.floor(ms / 70), callback: () => {
        if (!target.active) return;
        target.x = x0 + (Math.random() - 0.5) * 8;
        const cx = target.x, cy = target.y - target.displayHeight * 0.5;
        const h = target.displayHeight * 0.4;
        const a = this.scene.add.graphics().setDepth(59).setBlendMode('ADD');
        let px = cx + (Math.random() - 0.5) * 80, py = cy + (Math.random() - 0.5) * h * 2;
        a.lineStyle(3, 0xd8ccff, 1).beginPath().moveTo(px, py);
        for (let i = 0; i < 4; i++) { px += (Math.random() - 0.5) * 50; py += (Math.random() - 0.5) * 50; a.lineTo(px, py); }
        a.strokePath();
        this.scene.time.delayedCall(80, () => a.destroy());
      },
    });
    this.scene.time.delayedCall(ms + 80, () => { ev.remove(); if (target.active) target.x = x0; });
  }

  // ---------------- 火 ----------------

  /** 火焰爆裂：序列帧 + 火焰粒子 + 火星 + 余烬 */
  fireBurst(x: number, y: number, scale = 1) {
    if (this.scene.anims.exists('anim_fireburst')) {
      const s = this.scene.add.sprite(x, y, 'fx2_fire_burst_1').setDepth(58).setScale(scale * 1.3).setBlendMode('ADD');
      s.play('anim_fireburst');
      s.once('animationcomplete', () => s.destroy());
    }
    this.burst(x, y, 'fire_1', { n: 18, color: [0xff7a2e, 0xffd34a, 0xff4a1a], speed: [60, 220 * scale], scale: [0.55 * scale, 0], life: 520 });
    this.burst(x, y, 'flame_1', { n: 10, color: [0xffb020, 0xff5a2e], speed: [30, 120], scale: [0.6 * scale, 0.1], life: 700, gravity: -200 });
    this.embers(x, y, 16);
  }

  /** 火星：向上飘、慢慢熄灭（余韵） */
  embers(x: number, y: number, n = 12) {
    this.burst(x, y, 'spark_2', { n, color: [0xffd34a, 0xff8a3d], speed: [40, 160], scale: [0.18, 0], life: 1300, gravity: -120, angle: [200, 340] });
  }

  /** 地面焦痕 + 残火 1 秒 */
  scorch(x: number, ground: number, w = 1) {
    const s = this.scene.add.image(x, ground - 4, this.tex('p_scorch_1')).setTint(0x2a1208).setAlpha(0.6).setScale(0.9 * w, 0.22).setDepth(5);
    const f = this.scene.add.particles(x, ground - 6, this.tex('p_flame_1'), {
      x: { min: -60 * w, max: 60 * w }, speedY: { min: -90, max: -40 }, lifespan: 500, scale: { start: 0.22, end: 0 },
      tint: [0xff7a2e, 0xffd34a], frequency: this.reduce ? 120 : 45, blendMode: 'ADD',
    }).setDepth(57);
    this.scene.time.delayedCall(1000, () => f.stop());
    this.scene.tweens.add({ targets: s, alpha: 0, delay: 1200, duration: 600, onComplete: () => s.destroy() });
    this.scene.time.delayedCall(1700, () => f.destroy());
  }

  /** 火柱：从地面喷起 */
  pillar(x: number, ground: number, h = 1) {
    this.burst(x, ground, 'fire_2', { n: 22, color: [0xff7a2e, 0xffd34a], speed: [250 * h, 520 * h], angle: [255, 285], scale: [0.6, 0.1], life: 520 });
    this.burst(x, ground, 'smoke_1', { n: 6, color: 0x5a3020, speed: [60, 140], angle: [240, 300], scale: [0.6, 1], life: 900, add: false });
  }

  // ---------------- 冰 ----------------

  /** 冰锥从地面刺出，返回冰锥（用于随后击碎） */
  iceSpikes(x: number, ground: number, n: number, spread: number, scale = 1) {
    const out: Img[] = [];
    for (let i = 0; i < n; i++) {
      const sx = x + (n === 1 ? 0 : (i / (n - 1) - 0.5) * spread) + (Math.random() - 0.5) * 20;
      const sp = this.scene.add.image(sx, ground + 6, this.tex('fx2_ice_spike', 'fx_ice')).setOrigin(0.5, 1).setDepth(56)
        .setScale(0.5 * scale * (0.7 + Math.random() * 0.5), 0.05).setAngle((Math.random() - 0.5) * 30);
      this.scene.tweens.add({ targets: sp, scaleY: sp.scaleX, duration: 140, delay: i * 35, ease: 'Back.out' });
      out.push(sp);
    }
    this.burst(x, ground, 'smoke_2', { n: 8, color: 0xe8f8ff, speed: [40, 120], angle: [200, 340], scale: [0.4, 0.8], life: 700 });
    return out;
  }

  /** 冻住敌人：半透明冰块罩住，返回击碎函数 */
  freeze(target: Img | undefined, x: number, y: number, w = 1) {
    const sc = target ? Math.max(target.displayWidth / 230, target.displayHeight / 270) * 1.05 : w;
    const bx = target?.x ?? x, by = target ? target.y + 6 : y;
    const block = this.scene.add.image(bx, by, this.tex('fx2_ice_block', 'fx_ice')).setOrigin(0.5, 1).setDepth(57).setScale(sc * 0.2).setAlpha(0);
    this.scene.tweens.add({ targets: block, scale: sc, alpha: 1, duration: 200, ease: 'Back.out' });
    target?.setTint(0x9fdcff);
    this.frostVignette(600);
    return async () => {
      target?.clearTint();
      block.destroy();
      this.shards(bx, by - block.displayHeight * 0.5, 16);
    };
  }

  /** 冰碎片四散 */
  shards(x: number, y: number, n = 12) {
    const key = this.tex('fx2_ice_shard', 'fx_dot');
    for (let i = 0; i < (this.reduce ? n / 2 : n); i++) {
      const s = this.scene.add.image(x, y, key).setDepth(58).setScale(0.6 + Math.random() * 0.8).setAngle(Math.random() * 360);
      const a = Math.random() * Math.PI * 2, d = 80 + Math.random() * 160;
      this.scene.tweens.add({ targets: s, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * 0.6, angle: s.angle + 360, duration: 380, ease: 'Quad.out' });
      this.scene.tweens.add({ targets: s, y: '+=180', alpha: 0, delay: 380, duration: 420, ease: 'Quad.in', onComplete: () => s.destroy() });
    }
    this.burst(x, y, 'star_1', { n: 10, color: 0xe8f8ff, scale: [0.3, 0], life: 450 });
  }

  // ---------------- 光 ----------------

  lightRay(x: number, scale = 1, color = 0xfff1a8) {
    const r = this.scene.add.image(x, 0, this.tex('fx2_light_ray', 'fx_pillar')).setOrigin(0.5, 0).setDepth(56).setBlendMode('ADD').setTint(color).setScale(0.2 * scale, 1).setAlpha(0);
    this.scene.tweens.add({ targets: r, scaleX: scale, alpha: 1, duration: 140 });
    this.scene.tweens.add({ targets: r, scaleX: 0.1, alpha: 0, delay: 480, duration: 280, onComplete: () => r.destroy() });
  }

  holyCross(x: number, y: number, scale = 1) {
    const c = this.scene.add.image(x, y, this.tex('fx2_holy_cross', 'fx_star')).setDepth(59).setBlendMode('ADD').setScale(0.2).setAlpha(0);
    this.scene.tweens.add({ targets: c, scale: 1.3 * scale, alpha: 1, angle: 45, duration: 220, ease: 'Back.out' });
    this.scene.tweens.add({ targets: c, scale: 1.8 * scale, alpha: 0, delay: 420, duration: 300, onComplete: () => c.destroy() });
    this.burst(x, y, 'star_2', { n: 16, color: [0xfff1a8, 0xffffff], scale: [0.35, 0], life: 600 });
  }

  /** 光尘缓缓飘落（余韵） */
  dust(x: number, y: number, color = 0xfff1a8) {
    this.burst(x, y - 120, 'light_2', { n: 14, color, speed: [10, 50], angle: [60, 120], scale: [0.18, 0], life: 1500, gravity: 40 });
  }

  // ---------------- 造型 ----------------

  /** 火龙冲向目标 */
  async dragon(fromX: number, y: number, toX: number, scale = 1) {
    const d = this.scene.add.image(fromX, y, this.tex('fx2_flame_dragon', 'fx_flame_0')).setDepth(58).setScale(0.6 * scale).setBlendMode('ADD');
    const trail = this.scene.add.particles(0, 0, this.tex('p_fire_1'), {
      follow: d, followOffset: { x: -80 * scale, y: 0 }, speed: { min: 20, max: 80 }, lifespan: 420, scale: { start: 0.5 * scale, end: 0 },
      tint: [0xff7a2e, 0xffd34a, 0xff4a1a], frequency: this.reduce ? 40 : 12, blendMode: 'ADD',
    }).setDepth(57);
    sfx('sk_fire_cast', { volume: 0.7, detune: -300 });
    await new Promise<void>((res) => this.scene.tweens.add({ targets: d, x: toX, scale: 0.9 * scale, duration: 380, ease: 'Quad.in', onComplete: () => res() }));
    d.destroy();
    trail.stop();
    this.scene.time.delayedCall(500, () => trail.destroy());
  }

  /** 凤凰从左上俯冲到目标 */
  async phoenix(toX: number, toY: number, scale = 1) {
    const p = this.scene.add.image(toX - 600, toY - 320, this.tex('fx2_phoenix', 'fx_flame_0')).setDepth(58).setScale(0.6 * scale).setAngle(25).setBlendMode('ADD');
    const trail = this.scene.add.particles(0, 0, this.tex('p_flame_1'), {
      follow: p, speed: { min: 30, max: 90 }, lifespan: 700, scale: { start: 0.5, end: 0 }, tint: [0xff8a3d, 0xffd34a], frequency: this.reduce ? 40 : 10, blendMode: 'ADD',
    }).setDepth(57);
    await new Promise<void>((res) => this.scene.tweens.add({ targets: p, x: toX, y: toY, scale: 1.1 * scale, duration: 520, ease: 'Quad.in', onComplete: () => res() }));
    p.destroy();
    trail.stop();
    this.scene.time.delayedCall(800, () => trail.destroy());
  }
}
