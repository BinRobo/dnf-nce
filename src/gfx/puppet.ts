import Phaser from 'phaser';
import { weaponDir } from '../systems/classes';

/**
 * 纸娃娃角色：按 public/assets/art/chars/<id>/rig.json 把部件拼起来，部件各自做补间动画。
 * 资源没准备好时退回到旧的程序绘制贴图（player_<job>）。
 */
export interface RigPart {
  id: string;
  file: string;
  x: number;
  y: number;
  px: number;
  py: number;
  z: number;
  parent?: string;
  /** 相对父部件的默认角度（如武器斜握） */
  rot?: number;
}
export interface Rig {
  height: number;
  parts: RigPart[];
  faces?: Record<string, string>;
}

export const CHAR_IDS = ['h_sm', 'h_sf', 'h_gm', 'h_gf', 'h_mm', 'h_mf', 'hero', 'hero_sf', 'hero_gm', 'hero_gf', 'hero_mm', 'hero_mf', 'sophie', 'blake', 'woman', 'kid', 'tailor', 'man', 'lady'] as const;
/** 装扮套装（与 src/systems/costumes.ts 一致） */
export const COSTUME_IDS = ['school', 'knight', 'mage', 'pardon', 'whomist', 'festival'];
const COSTUME_FILES = ['hat', 'body', 'armL', 'armR', 'legL', 'legR'];
export const KID_HEADS = ['hans', 'naoko', 'changwoo', 'luming', 'xiaohui', 'tim', 'sally', 'jimmy', 'andy', 'lucy'] as const;
const BASE = 'assets/art/chars/';

export const partKey = (id: string, file: string) => `ch_${id}_${file.replace(/\.svg$/, '')}`;

/** Boot 第一阶段：加载每个角色的 rig.json */
export function queueRigs(scene: Phaser.Scene) {
  for (const id of CHAR_IDS) scene.load.json(`rig_${id}`, `${BASE}${id}/rig.json`);
  scene.load.json('hero_weapons', `${BASE}hero/weapons/weapons.json`);
}

/** Boot 第二阶段：按 rig 加载部件 SVG（含表情头像、同学头像） */
export function queueParts(scene: Phaser.Scene) {
  for (const id of CHAR_IDS) {
    const rig = scene.cache.json.get(`rig_${id}`) as Rig | undefined;
    if (!rig) continue;
    const files = new Set(rig.parts.map((p) => p.file));
    for (const f of Object.values(rig.faces ?? {})) files.add(f);
    if (id === 'kid') for (const h of KID_HEADS) files.add(`head_${h}.svg`);
    for (const f of files) scene.load.svg(partKey(id, f), `${BASE}${id}/${f}`);
  }
  for (const c of COSTUME_IDS) for (const f of COSTUME_FILES) scene.load.svg(partKey('hero', `costume/${c}/${f}.svg`), `${BASE}hero/costume/${c}/${f}.svg`);
  const weapons = scene.cache.json.get('hero_weapons') as Record<string, { file: string }> | undefined;
  for (const [k, w] of Object.entries(weapons ?? {})) scene.load.svg(`hero_weapon_${k}`, `${BASE}${weaponDir()}${w.file}`);
}

export const hasRig = (scene: Phaser.Scene, id: string) => !!scene.cache.json.get(`rig_${id}`);

type PartNode = Phaser.GameObjects.Container & { img: Phaser.GameObjects.Image; base: { x: number; y: number; angle: number } };

export class Puppet extends Phaser.GameObjects.Container {
  readonly parts = new Map<string, PartNode>();
  private idleTweens: Phaser.Tweens.Tween[] = [];
  private rig?: Rig;
  readonly baseScale: number;
  /** 退回用的整张贴图 */
  private flat?: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, x: number, y: number, readonly charId: string, scale = 0.5, opts: { head?: string; fallback?: string; flip?: boolean } = {}) {
    super(scene, x, y);
    this.baseScale = scale;
    this.rig = scene.cache.json.get(`rig_${charId}`) as Rig | undefined;
    if (!this.rig) {
      this.flat = scene.add.image(0, 0, opts.fallback ?? 'player_novice').setOrigin(0.5, 1);
      this.add(this.flat);
      this.setScale(opts.flip ? -1 : 1, 1);
    } else {
      const sorted = [...this.rig.parts].sort((a, b) => a.z - b.z);
      for (const p of sorted) {
        const file = p.id === 'head' && opts.head ? `head_${opts.head}.svg` : p.file;
        const key = partKey(charId, file);
        const node = scene.add.container(p.x, p.y) as PartNode;
        const img = scene.add.image(0, 0, scene.textures.exists(key) ? key : partKey(charId, p.file));
        const w = img.width || 1;
        const h = img.height || 1;
        img.setOrigin(p.px / w, p.py / h);
        node.add(img);
        node.img = img;
        node.base = { x: p.x, y: p.y, angle: p.rot ?? 0 };
        node.setAngle(node.base.angle);
        this.parts.set(p.id, node);
      }
      // 挂接父子（武器挂在右手上）
      for (const p of sorted) {
        const node = this.parts.get(p.id)!;
        const parent = p.parent && this.parts.get(p.parent);
        if (parent) {
          // z 比父部件小的（如武器）画在手臂下面，让手握住剑柄
          const parentZ = sorted.find((q) => q.id === p.parent)!.z;
          if (p.z < parentZ) parent.addAt(node, 0);
          else parent.add(node);
          node.setPosition(p.x, p.y);
        } else this.add(node);
      }
      this.setScale(scale * (opts.flip ? -1 : 1), scale);
    }
    scene.add.existing(this);
  }

  /** 角色在屏幕上的站立高度（像素） */
  get tall() {
    return (this.rig?.height ?? 110) * (this.rig ? this.baseScale : 1);
  }

  private part(id: string) {
    return this.parts.get(id);
  }

  setFace(face: string) {
    const head = this.part('head');
    const file = this.rig?.faces?.[face];
    if (!head || !file) return this;
    const key = partKey(this.charId, file);
    if (this.scene.textures.exists(key)) head.img.setTexture(key);
    return this;
  }

  /** 换武器外观（按装备），rarity 颜色用于发光 */
  setWeapon(look: string | null, glow?: number) {
    const node = this.part('weapon');
    if (!node) return this;
    const weapons = this.scene.cache.json.get('hero_weapons') as Record<string, { px: number; py: number }> | undefined;
    const w = look ? weapons?.[look] : undefined;
    const key = `hero_weapon_${look}`;
    if (w && this.scene.textures.exists(key)) {
      node.img.setTexture(key);
      node.img.setOrigin(w.px / node.img.width, w.py / node.img.height);
    }
    node.img.preFX?.clear();
    if (glow !== undefined) node.img.preFX?.addGlow(glow, 4, 0, false, 0.1, 10);
    return this;
  }

  /**
   * 换装扮：hat/top/bottom 各指定一个套装 id（不指定 = 原始衣服）。
   * 部件 SVG 与原部件同尺寸同锚点，直接换贴图；帽子是叠在头上的一张同尺寸图。
   */
  setCostume(worn: { hat?: string; top?: string; bottom?: string }) {
    if (!this.rig) return this;
    // H 造型：每个角色有自己的一套装扮（chars/h_xx/costume/），上衣件含披风/背包
    const own = this.charId.startsWith('h_');
    const src = own ? this.charId : 'hero';
    const swap = (part: string, set?: string) => {
      const node = this.part(part);
      if (!node) return;
      const p = this.rig!.parts.find((q) => q.id === part)!;
      const key = set ? partKey(src, `costume/${set}/${part}.svg`) : partKey(this.charId, p.file);
      if (this.scene.textures.exists(key)) node.img.setTexture(key);
    };
    for (const part of own ? ['body', 'armL', 'armR', 'cape'] : ['body', 'armL', 'armR']) swap(part, worn.top);
    for (const part of ['legL', 'legR']) swap(part, worn.bottom);
    const head = this.part('head');
    this.hat?.destroy();
    this.hat = undefined;
    const hk = worn.hat && partKey(src, `costume/${worn.hat}/hat.svg`);
    if (head && hk && this.scene.textures.exists(hk)) {
      this.hat = this.scene.add.image(0, 0, hk).setOrigin(head.img.originX, head.img.originY);
      head.add(this.hat);
    }
    return this;
  }

  private hat?: Phaser.GameObjects.Image;

  /** 武器特效档位（0 普通 … 4 史诗）与刀尖粒子，挥砍时加密成拖尾 */
  private wTier = 0;
  private wEmitter?: Phaser.GameObjects.Particles.ParticleEmitter;
  private wIdleFreq = 0;

  /**
   * 稀有度越高，手上越炫：
   * 1 蓝：淡光；2 紫：亮光 + 刀尖闪点；3 粉：脉动光 + 持续粒子；4 史诗：强脉动 + 大量光尘 + 金色描边
   */
  weaponFx(tier: number, color: number) {
    const node = this.part('weapon');
    this.wTier = tier;
    if (!node || tier <= 0) return this;
    const img = node.img;
    img.preFX?.clear();
    const glow = img.preFX?.addGlow(color, [0, 2, 4, 5, 6][tier], 0, false, 0.1, 12);
    if (glow && tier >= 3) {
      this.scene.tweens.add({ targets: glow, outerStrength: tier === 4 ? 10 : 7, duration: tier === 4 ? 500 : 800, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    }
    if (tier >= 4) img.preFX?.addShine(0.6, 0.4, 4);
    if (tier < 2) return this;
    this.wIdleFreq = [0, 0, 260, 110, 45][tier];
    const e = this.scene.add.particles(0, 0, 'fx_dot', {
      x: { min: -8, max: 8 }, y: { min: -8, max: 8 }, speed: { min: 5, max: tier === 4 ? 50 : 25 }, lifespan: tier === 4 ? 900 : 600,
      scale: { start: tier === 4 ? 0.7 : 0.45, end: 0 }, alpha: { start: 1, end: 0 }, tint: tier === 4 ? [color, 0xffffff, 0xffe9a0] : color,
      frequency: this.wIdleFreq, blendMode: 'ADD', gravityY: tier === 4 ? -40 : 0,
    });
    e.setDepth(this.depth + 1);
    this.wEmitter = e;
    const follow = () => {
      if (!this.active || !img.active) return;
      // 刀尖：贴图顶部中点
      const m = img.getWorldTransformMatrix();
      const p = m.transformPoint(img.width / 2 - img.displayOriginX, img.height * 0.12 - img.displayOriginY);
      e.setPosition(p.x, p.y);
      e.setDepth(this.depth + 1);
    };
    this.scene.events.on('update', follow);
    this.once('destroy', () => this.scene?.events.off('update', follow));
    this.once('destroy', () => e.destroy());
    return this;
  }

  /** 高等级光环：脚下一圈缓慢旋转的光点 */
  aura(color: number) {
    const e = this.scene.add.particles(0, 0, 'fx_dot', {
      x: { min: -60, max: 60 }, y: { min: -10, max: 0 }, speedY: { min: -60, max: -20 }, lifespan: 1200,
      scale: { start: 0.6, end: 0 }, alpha: { start: 0.8, end: 0 }, tint: color, frequency: 90, blendMode: 'ADD',
    });
    e.setDepth(this.depth - 1);
    const follow = () => {
      if (!this.active) return;
      const m = this.getWorldTransformMatrix();
      e.setPosition(m.tx, m.ty);
    };
    this.scene.events.on('update', follow);
    this.once('destroy', () => this.scene?.events.off('update', follow));
    this.once('destroy', () => e.destroy());
    return this;
  }

  /** 所有部件染色（受击闪白/闪红） */
  tintAll(color: number | null, fill = true) {
    const imgs = this.flat ? [this.flat] : [...this.parts.values()].map((p) => p.img);
    for (const i of imgs) {
      if (color === null) i.clearTint();
      else if (fill) i.setTintFill(color);
      else i.setTint(color);
    }
  }

  stopIdle() {
    for (const t of this.idleTweens) t.stop();
    this.idleTweens = [];
    for (const p of this.parts.values()) {
      p.setAngle(p.base.angle);
      p.setPosition(p.base.x, p.base.y);
    }
    if (this.rig) this.setAngle(0);
  }

  idle() {
    this.stopIdle();
    const t = this.scene.tweens;
    const body = this.part('body'), head = this.part('head');
    const armL = this.part('armL'), armR = this.part('armR');
    if (this.flat) {
      this.idleTweens.push(t.add({ targets: this.flat, y: -4, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut' }));
      return this;
    }
    if (body) this.idleTweens.push(t.add({ targets: body, y: body.base.y - 5, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.inOut' }));
    if (head) this.idleTweens.push(t.add({ targets: head, y: head.base.y - 6, angle: 3, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.inOut' }));
    if (armL) this.idleTweens.push(t.add({ targets: armL, angle: 6, y: armL.base.y - 4, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.inOut' }));
    if (armR) this.idleTweens.push(t.add({ targets: armR, angle: -6, y: armR.base.y - 4, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.inOut' }));
    return this;
  }

  /** 跑步：摆腿摆臂 */
  run() {
    this.stopIdle();
    const t = this.scene.tweens;
    const pairs: [string, number][] = [['legL', 28], ['legR', -28], ['armL', -24], ['armR', 24]];
    for (const [id, a] of pairs) {
      const p = this.part(id);
      if (p) this.idleTweens.push(t.add({ targets: p, angle: { from: -a, to: a }, duration: 140, yoyo: true, repeat: -1, ease: 'Sine.inOut' }));
    }
    const body = this.part('body');
    if (body) this.idleTweens.push(t.add({ targets: body, y: body.base.y - 8, duration: 140, yoyo: true, repeat: -1 }));
    return this;
  }

  /** 挥砍：variant 0 横斩、1 上挑、2 下劈；返回在“命中瞬间”resolve 的 Promise */
  swing(variant = 0, dur = 90): Promise<void> {
    this.stopIdle();
    const armR = this.part('armR');
    const t = this.scene.tweens;
    // 角度：0 = 手臂自然下垂，负值 = 向前抬起（面朝右）
    const [from, to] = variant === 1 ? [40, -130] : variant === 2 ? [-180, -30] : [-160, -50];
    return new Promise((resolve) => {
      if (!armR) {
        t.add({ targets: this.flat ?? this, angle: { from: -8, to: 10 }, duration: dur, yoyo: true, onYoyo: () => resolve() });
        return;
      }
      armR.setAngle(from);
      // 稀有武器挥砍时刀尖拖出光尾
      if (this.wTier >= 1) this.trail(dur);
      t.add({ targets: this, angle: { from: -3, to: 4 }, duration: dur, yoyo: true });
      t.add({ targets: armR, angle: to, duration: dur, ease: 'Quad.in', onComplete: () => resolve() });
    });
  }

  private trail(dur: number) {
    const e = this.wEmitter;
    if (e) {
      e.frequency = 8;
      this.scene.time.delayedCall(dur + 60, () => e.active && (e.frequency = this.wIdleFreq));
      return;
    }
    // 蓝色装备：没有常驻粒子，挥砍时临时拖尾
    const img = this.part('weapon')?.img;
    if (!img) return;
    const glowColor = 0x5aa9ff;
    const tmp = this.scene.add.particles(0, 0, 'fx_dot', {
      lifespan: 260, scale: { start: 0.5, end: 0 }, alpha: { start: 0.8, end: 0 }, tint: glowColor, frequency: 10, blendMode: 'ADD',
    }).setDepth(this.depth + 1);
    const follow = () => {
      if (!img.active) return;
      const p = img.getWorldTransformMatrix().transformPoint(img.width / 2 - img.displayOriginX, img.height * 0.12 - img.displayOriginY);
      tmp.setPosition(p.x, p.y);
    };
    this.scene.events.on('update', follow);
    this.scene.time.delayedCall(dur + 40, () => {
      this.scene?.events.off('update', follow);
      tmp.stop();
      this.scene?.time.delayedCall(300, () => tmp.destroy());
    });
  }

  /** 射击 / 施法：右臂平举指向前方，后坐一下；在“出手”瞬间 resolve */
  aim(dur = 80): Promise<void> {
    this.stopIdle();
    const armR = this.part('armR');
    if (!armR) return Promise.resolve();
    armR.setAngle(-70);
    return new Promise((resolve) => {
      this.scene.tweens.add({ targets: armR, angle: -88, duration: dur / 2, yoyo: true, onYoyo: () => resolve() });
      this.scene.tweens.add({ targets: this, x: this.x - 6, duration: dur / 2, yoyo: true });
    });
  }

  /** 恢复站姿（挥砍后） */
  recover(dur = 160) {
    const t = this.scene.tweens;
    for (const p of this.parts.values()) t.add({ targets: p, angle: p.base.angle, x: p.base.x, y: p.base.y, duration: dur, ease: 'Quad.out' });
    this.scene.time.delayedCall(dur, () => this.idle());
  }

  /** 受击后仰 */
  hurt() {
    this.stopIdle();
    const t = this.scene.tweens;
    // 整体绕脚底后仰（头和手臂跟着身体走，不会脱节）
    const dir = this.scaleX < 0 ? 1 : -1;
    t.add({ targets: this, angle: 12 * dir, duration: 80, yoyo: true, hold: 120 });
    const head = this.part('head');
    if (head) t.add({ targets: head, angle: -8, duration: 80, yoyo: true, hold: 120 });
    this.scene.time.delayedCall(320, () => this.idle());
  }

  /** 开心跳一下 */
  cheer() {
    this.setFace('happy');
    const t = this.scene.tweens;
    t.add({ targets: this, y: this.y - 24, duration: 160, yoyo: true, repeat: 1, ease: 'Quad.out' });
    const armL = this.part('armL'), armR = this.part('armR');
    if (armL) t.add({ targets: armL, angle: 150, duration: 160, yoyo: true, repeat: 1 });
    if (armR) t.add({ targets: armR, angle: -150, duration: 160, yoyo: true, repeat: 1 });
  }
}
