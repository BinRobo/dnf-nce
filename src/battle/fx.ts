import Phaser from 'phaser';
import { EN_FONT, FONT } from '../ui/widgets';

/**
 * 打击感工具箱：顿帧、闪白、击退、震屏、粒子、伤害数字、HIT 计数。
 * 参数来自需求文档（起始值，需真机调手感）。reduceFx 时震屏减半、关闭全屏闪光。
 */
export function makeFxTextures(scene: Phaser.Scene) {
  if (scene.textures.exists('fx_star')) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const gen = (key: string, w: number, h: number, draw: () => void) => {
    g.clear();
    draw();
    g.generateTexture(key, w, h);
  };
  // 刀光：月牙形（两条圆弧之间的区域）
  const crescent = (key: string, r: number, thick: number, color: number) =>
    gen(key, r * 2 + 8, r * 2 + 8, () => {
      const c = r + 4;
      g.fillStyle(color, 1);
      g.beginPath();
      g.arc(c, c, r, -1.25, 1.25, false);
      g.arc(c - thick, c, r - thick * 0.6, 1.1, -1.1, true);
      g.closePath();
      g.fillPath();
      g.fillStyle(0xffffff, 1);
      g.beginPath();
      g.arc(c, c, r - 2, -1.0, 1.0, false);
      g.arc(c - thick * 0.45, c, r - thick * 0.45, 0.9, -0.9, true);
      g.closePath();
      g.fillPath();
    });
  crescent('fx_slash', 90, 34, 0x9fe3ff);
  crescent('fx_slash_gold', 100, 40, 0xffd34a);
  crescent('fx_slash_big', 150, 60, 0xff9f43);
  gen('fx_star', 32, 32, () => {
    g.fillStyle(0xffffff, 1);
    const pts: Phaser.Math.Vector2[] = [];
    for (let i = 0; i < 8; i++) {
      const r = i % 2 ? 4 : 16;
      const a = (i * Math.PI) / 4;
      pts.push(new Phaser.Math.Vector2(16 + r * Math.cos(a), 16 + r * Math.sin(a)));
    }
    g.fillPoints(pts, true);
  });
  gen('fx_dot', 12, 12, () => g.fillStyle(0xffffff, 1).fillCircle(6, 6, 6));
  gen('fx_puff', 48, 48, () => g.fillStyle(0xffffff, 1).fillCircle(24, 24, 22));
  gen('fx_ring', 128, 128, () => g.lineStyle(10, 0xffffff, 1).strokeCircle(64, 64, 56));
  gen('fx_shield', 80, 92, () => {
    g.fillStyle(0x7fd0ff, 0.85).lineStyle(5, 0x2b2a4a, 1);
    g.beginPath();
    g.moveTo(40, 4);
    g.lineTo(76, 18);
    g.lineTo(70, 60);
    g.lineTo(40, 88);
    g.lineTo(10, 60);
    g.lineTo(4, 18);
    g.closePath();
    g.fillPath();
    g.strokePath();
  });
  g.destroy();
}

export class Fx {
  private sparks: Phaser.GameObjects.Particles.ParticleEmitter;
  private dust: Phaser.GameObjects.Particles.ParticleEmitter;
  private nums: Phaser.GameObjects.Text[] = [];
  private stopUntil = 0;
  private stopTimer?: number;
  hitText: Phaser.GameObjects.Text;
  private hits = 0;
  private hitReset?: Phaser.Time.TimerEvent;

  constructor(private scene: Phaser.Scene, private reduce: boolean) {
    makeFxTextures(scene);
    this.sparks = scene.add.particles(0, 0, 'fx_star', {
      speed: { min: 220, max: 480 }, scale: { start: 0.7, end: 0 }, lifespan: { min: 220, max: 380 },
      rotate: { min: 0, max: 360 }, emitting: false, blendMode: 'ADD', tint: [0xffffff, 0xffe14a, 0x9fe3ff],
    }).setDepth(60);
    this.dust = scene.add.particles(0, 0, 'fx_puff', {
      speed: { min: 40, max: 140 }, angle: { min: 200, max: 340 }, scale: { start: 0.5, end: 1.1 }, alpha: { start: 0.5, end: 0 },
      lifespan: 450, emitting: false, tint: 0xd8cfe8,
    }).setDepth(9);
    this.hitText = scene.add.text(scene.scale.width - 36, 120, '', {
      fontFamily: EN_FONT, fontSize: '46px', fontStyle: 'bold italic', color: '#ffe14a', stroke: '#5a2a00', strokeThickness: 7,
    }).setOrigin(1, 0.5).setDepth(80);
  }

  /** 顿帧：把场景的补间与计时器放慢到 5%，用真实时间恢复（不能用被放慢的计时器来恢复） */
  hitstop(ms: number) {
    const until = performance.now() + ms;
    if (until <= this.stopUntil) return;
    this.stopUntil = until;
    this.scene.tweens.timeScale = 0.05;
    this.scene.time.timeScale = 0.05;
    window.clearTimeout(this.stopTimer);
    this.stopTimer = window.setTimeout(() => {
      this.scene.tweens.timeScale = 1;
      this.scene.time.timeScale = 1;
      this.stopUntil = 0;
    }, ms);
  }

  /** 慢动作 */
  slowmo(scale: number, ms: number) {
    this.scene.tweens.timeScale = scale;
    this.scene.time.timeScale = scale;
    window.setTimeout(() => {
      this.scene.tweens.timeScale = 1;
      this.scene.time.timeScale = 1;
    }, ms);
  }

  /** 震屏：px 为像素幅度 */
  shake(px: number, ms: number) {
    const k = this.reduce ? 0.4 : 1;
    this.scene.cameras.main.shake(ms, (px * k) / this.scene.scale.width);
  }

  zoom(z: number, ms: number) {
    const cam = this.scene.cameras.main;
    cam.zoomTo(z, ms * 0.4, 'Quad.easeOut');
    window.setTimeout(() => cam.zoomTo(1, ms * 0.6, 'Quad.easeInOut'), ms * 0.5);
  }

  flashScreen(color = 0xffffff) {
    if (this.reduce) return;
    const c = Phaser.Display.Color.IntegerToColor(color);
    this.scene.cameras.main.flash(120, c.red, c.green, c.blue);
  }

  /** 命中闪白：第一帧纯白，随后淡出（总约 60ms） */
  flash(target: Phaser.GameObjects.Image | { tintAll(c: number | null): void }, color = 0xffffff) {
    if ('tintAll' in target) {
      target.tintAll(color);
      window.setTimeout(() => target.tintAll(null), 70);
    } else {
      target.setTintFill(color);
      window.setTimeout(() => target.active && target.clearTint(), 70);
    }
  }

  slash(x: number, y: number, kind: 'normal' | 'gold' | 'big', angle: number, flipX = false) {
    const key = kind === 'gold' ? 'fx_slash_gold' : kind === 'big' ? 'fx_slash_big' : 'fx_slash';
    const s = this.scene.add.image(x, y, key).setDepth(55).setBlendMode('ADD').setAngle(angle).setScale(0.55).setFlipX(flipX);
    this.scene.tweens.add({ targets: s, scale: 1.05, alpha: 0, angle: angle + 25, duration: 200, ease: 'Quad.out', onComplete: () => s.destroy() });
  }

  burst(x: number, y: number, n: number, tint?: number) {
    if (tint !== undefined) this.sparks.setParticleTint(tint);
    this.sparks.explode(Math.round(n * (this.reduce ? 0.6 : 1)), x, y);
    if (tint !== undefined) this.sparks.setParticleTint(0xffffff);
  }

  ring(x: number, y: number, color = 0xffffff, scale = 1.4) {
    const r = this.scene.add.image(x, y, 'fx_ring').setDepth(54).setBlendMode('ADD').setTint(color).setScale(0.2);
    this.scene.tweens.add({ targets: r, scale, alpha: 0, duration: 320, ease: 'Quad.out', onComplete: () => r.destroy() });
  }

  dustAt(x: number, y: number, n = 4) {
    this.dust.explode(n, x, y);
  }

  /** 伤害数字：弹出 1.6→1，上浮淡出；多段命中错位叠放 */
  number(x: number, y: number, value: number | string, opts: { crit?: boolean; color?: string; size?: number; stack?: number } = {}) {
    let t = this.nums.find((n) => !n.visible);
    if (!t) {
      t = this.scene.add.text(0, 0, '', { fontFamily: EN_FONT, fontStyle: 'bold', stroke: '#1b1030', strokeThickness: 7 }).setOrigin(0.5).setDepth(85);
      this.nums.push(t);
    }
    const stack = opts.stack ?? 0;
    t.setText(typeof value === 'number' ? (opts.crit ? `${value}!` : String(value)) : value)
      .setFontSize(opts.size ?? (opts.crit ? 54 : 38))
      .setColor(opts.color ?? (opts.crit ? '#ffb020' : '#ffffff'))
      .setPosition(x + stack * 12, y - stack * 18)
      .setAlpha(1).setScale(1.6).setVisible(true);
    this.scene.tweens.add({ targets: t, scale: 1, duration: 120, ease: 'Back.out' });
    this.scene.tweens.add({
      targets: t, y: t.y - 60, alpha: 0, delay: 320, duration: 520, ease: 'Quad.in',
      onComplete: () => t!.setVisible(false),
    });
  }

  /** 右上角 DNF 式 HIT 计数（与答题连对 COMBO 分开） */
  hit() {
    this.hits++;
    this.hitText.setText(`${this.hits} HIT`).setScale(1.35).setAlpha(1);
    this.scene.tweens.add({ targets: this.hitText, scale: 1, duration: 120 });
    this.hitReset?.remove();
    this.hitReset = this.scene.time.delayedCall(2600, () => {
      this.scene.tweens.add({ targets: this.hitText, alpha: 0, duration: 300, onComplete: () => (this.hits = 0) });
    });
  }

  label(x: number, y: number, str: string, color = '#ffffff', size = 34) {
    const t = this.scene.add.text(x, y, str, { fontFamily: FONT, fontSize: `${size}px`, fontStyle: 'bold', color, stroke: '#1b1030', strokeThickness: 7 })
      .setOrigin(0.5).setDepth(86).setScale(0.4);
    this.scene.tweens.add({ targets: t, scale: 1, duration: 180, ease: 'Back.out' });
    this.scene.tweens.add({ targets: t, y: y - 30, alpha: 0, delay: 650, duration: 350, onComplete: () => t.destroy() });
    return t;
  }

  destroy() {
    window.clearTimeout(this.stopTimer);
    this.scene.tweens.timeScale = 1;
    this.scene.time.timeScale = 1;
  }
}

/** 按场景计时器等待（会被顿帧/慢动作拉长，从而让整段演出一起“卡肉”） */
export const wait = (scene: Phaser.Scene, ms: number) => new Promise<void>((r) => scene.time.delayedCall(ms, () => r()));

/** 补间的 Promise 版 */
export const tween = (scene: Phaser.Scene, cfg: Phaser.Types.Tweens.TweenBuilderConfig) =>
  new Promise<void>((r) => scene.tweens.add({ ...cfg, onComplete: () => r() }));
