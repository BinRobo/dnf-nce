import Phaser from 'phaser';
import type { Item, Slot } from '../save/schema';
import { RARITY } from '../systems/items';
import { catalogOf } from '../systems/catalog';

/**
 * 装备图标：程序绘制的 64x64 纹理，纹理名 icon_<key>。
 * 图标由装备名称决定（旧存档里的装备也能显示），以后换成美术素材时同名替换即可。
 */
const NAME_ICON: Record<string, string> = {
  '史诗·亚历山大的字典剑': 'epic_sword', '史诗·莎士比亚战袍': 'epic_robe', '史诗·牛津之心': 'epic_heart',
  '史诗·帕顿的金号角锤': 'epic_horn', '史诗·胡迷斯的名牌羽杖': 'epic_quill', '史诗·胡迷斯的手杖剑': 'epic_canesword',
  '史诗·帕顿的扩音炮': 'epic_megacannon', '史诗·胡迷斯的名牌左轮': 'epic_badgerevolver', '史诗·帕顿的号角法杖': 'epic_hornstaff',
};
const SLOT_ICON: Record<Slot, string> = { weapon: 'longsword', helmet: 'hat', armor: 'cloth', shoes: 'shoes', accessory: 'necklace', ring: 'ring' };
/** 美术绘制的 SVG 图标（public/assets/art/icons/<key>.svg），Boot 时加载为 icon_<key> */
export const SVG_ICONS = ['epic_sword', 'epic_horn', 'epic_quill', 'umbrella', 'penstaff', 'pencilbow', 'handbaghammer', 'ticketdagger', 'bookblade', 'hat', 'coat', 'suit', 'shoes', 'tie', 'passport', 'watch',
  'pistol', 'rifle', 'cannon', 'icecreampistol', 'carcannon', 'keyboardrifle', 'epic_megacannon', 'epic_badgerevolver', 'epic_canesword',
  'wand', 'orb', 'tome', 'teacherwand', 'glassorb', 'epic_hornstaff'];

const lookOf = (it: Pick<Item, 'name' | 'slot'>) => NAME_ICON[it.name] ?? catalogOf(it.name)?.look;

/** 装备名 → 主角手持武器外观（public/assets/art/chars/hero/weapons/） */
export const weaponLook = (it: Pick<Item, 'name' | 'slot'> | undefined) => (it && it.slot === 'weapon' ? lookOf(it) ?? 'longsword' : null);

export const iconKey = (it: Pick<Item, 'name' | 'slot'>) => `icon_${lookOf(it) ?? SLOT_ICON[it.slot]}`;
export const slotIconKey = (slot: Slot) => `icon_${SLOT_ICON[slot]}`;

const STEEL = 0xdfe8ff, STEEL_D = 0x8796c4, GOLD = 0xffc94a, GOLD_D = 0xb8862a, WOOD = 0x9a6233, WOOD_D = 0x6b3f1d, OUT = 0x1b1e33;

type G = Phaser.GameObjects.Graphics;
type P = [number, number][];
const poly = (g: G, pts: P, fill: number, line = OUT) => {
  const v = pts.map(([x, y]) => new Phaser.Math.Vector2(x, y));
  g.fillStyle(fill, 1).fillPoints(v, true);
  g.lineStyle(2, line, 1).strokePoints(v, true);
};

/** 竖直的剑，绘制前坐标系已旋转 */
function sword(g: G, len: number, width: number, blade = STEEL, edge = STEEL_D, guardW = 24) {
  poly(g, [[0, -len], [width / 2, -len + width], [width / 2, 4], [-width / 2, 4], [-width / 2, -len + width]], blade);
  g.lineStyle(2, edge, 1).lineBetween(0, -len + width, 0, 2);
  poly(g, [[-guardW / 2, 4], [guardW / 2, 4], [guardW / 2, 9], [-guardW / 2, 9]], GOLD);
  poly(g, [[-3, 9], [3, 9], [3, 22], [-3, 22]], WOOD);
  g.fillStyle(GOLD, 1).fillCircle(0, 25, 4).lineStyle(2, OUT, 1).strokeCircle(0, 25, 4);
}

function diag(g: G, draw: () => void) {
  g.save();
  g.translateCanvas(32, 32);
  g.rotateCanvas(Math.PI / 4);
  draw();
  g.restore();
}

const DRAW: Record<string, (g: G) => void> = {
  // ---- 装扮材料 ----
  mat_cloth: (g) => {
    poly(g, [[10, 18], [50, 12], [54, 46], [14, 52]], 0xe8d2a6);
    g.lineStyle(2, 0xb89a68, 1).lineBetween(14, 26, 50, 21).lineBetween(16, 36, 52, 31);
    poly(g, [[44, 40], [58, 50], [46, 58]], 0xd6bd8a);
  },
  mat_thread: (g) => {
    poly(g, [[22, 10], [42, 10], [38, 18], [26, 18]], 0x9a6233);
    poly(g, [[26, 46], [38, 46], [42, 54], [22, 54]], 0x9a6233);
    poly(g, [[24, 18], [40, 18], [40, 46], [24, 46]], 0xff6bc8);
    g.lineStyle(2, 0xffd1ea, 1).lineBetween(24, 26, 40, 24).lineBetween(24, 34, 40, 32).lineBetween(24, 42, 40, 40);
  },
  mat_brass: (g) => {
    poly(g, [[8, 26], [22, 26], [50, 10], [50, 54], [22, 38], [8, 38]], 0xffc94a);
    poly(g, [[50, 10], [56, 14], [56, 50], [50, 54]], 0xb8862a);
    g.fillStyle(0xfff1b0, 1).fillCircle(30, 22, 3);
  },
  mat_badge: (g) => {
    poly(g, [[10, 18], [54, 18], [54, 46], [10, 46]], 0xdfe8ff);
    poly(g, [[10, 18], [54, 18], [54, 26], [10, 26]], 0x5aa9ff);
    g.lineStyle(3, 0x8796c4, 1).lineBetween(16, 34, 46, 34).lineBetween(16, 40, 36, 40);
  },
  mat_ribbon: (g) => {
    poly(g, [[8, 20], [30, 30], [8, 44]], 0xff6bc8);
    poly(g, [[56, 20], [34, 30], [56, 44]], 0x7dffa5);
    poly(g, [[26, 24], [38, 24], [38, 38], [26, 38]], 0xffd34a);
    poly(g, [[28, 38], [24, 58], [30, 54]], 0x5aa9ff);
    poly(g, [[36, 38], [40, 58], [34, 54]], 0xff9f43);
  },
  // ---- 材料 ----
  mat_stone: (g) => {
    poly(g, [[32, 8], [52, 24], [44, 54], [20, 54], [12, 24]], 0x6fd3ff);
    poly(g, [[32, 8], [40, 24], [32, 54], [24, 24]], 0xb8ecff);
    g.fillStyle(0xffffff, 0.9).fillCircle(24, 20, 3);
  },
  mat_shard: (g) => {
    poly(g, [[30, 4], [42, 22], [36, 58], [22, 40], [20, 18]], 0xffb020);
    poly(g, [[30, 4], [34, 24], [36, 58], [28, 30]], 0xffe08a);
    poly(g, [[46, 30], [54, 40], [48, 56], [42, 44]], 0xff8a20);
    g.fillStyle(0xffffff, 1).fillCircle(26, 16, 3).fillCircle(50, 38, 2);
  },
  mat_soul: (g) => {
    poly(g, [[32, 6], [44, 26], [50, 42], [42, 56], [22, 56], [14, 42], [20, 26], [26, 30]], 0xb46bff);
    poly(g, [[32, 22], [40, 38], [36, 52], [28, 52], [24, 40]], 0xe6c8ff);
    g.fillStyle(OUT, 1).fillCircle(28, 42, 3).fillCircle(37, 42, 3);
  },
  dagger: (g) => diag(g, () => sword(g, 18, 9, STEEL, STEEL_D, 18)),
  longsword: (g) => diag(g, () => sword(g, 30, 8)),
  greatsword: (g) => diag(g, () => {
    poly(g, [[0, -32], [8, -24], [8, 4], [-8, 4], [-8, -24]], STEEL);
    g.lineStyle(3, STEEL_D, 1).lineBetween(0, -24, 0, 0);
    poly(g, [[-17, 4], [17, 4], [14, 10], [-14, 10]], GOLD);
    poly(g, [[-3, 10], [3, 10], [3, 24], [-3, 24]], WOOD);
    g.fillStyle(0xff5a7a, 1).fillCircle(0, 7, 3);
    g.fillStyle(GOLD, 1).fillCircle(0, 27, 4).lineStyle(2, OUT, 1).strokeCircle(0, 27, 4);
  }),
  epic_sword: (g) => diag(g, () => {
    poly(g, [[0, -32], [6, -26], [6, 4], [-6, 4], [-6, -26]], 0xfff2b0, GOLD_D);
    g.lineStyle(2, 0xffb020, 1).lineBetween(0, -26, 0, 2);
    poly(g, [[-16, 2], [-6, 4], [6, 4], [16, 2], [12, 10], [-12, 10]], GOLD);
    g.fillStyle(0x5ad1ff, 1).fillCircle(0, 7, 3.5);
    poly(g, [[-3, 10], [3, 10], [3, 23], [-3, 23]], 0x7a1f2b);
    g.fillStyle(0x5ad1ff, 1).fillCircle(0, 26, 4).lineStyle(2, OUT, 1).strokeCircle(0, 26, 4);
  }),
  staff: (g) => diag(g, () => {
    poly(g, [[-3, -14], [3, -14], [3, 30], [-3, 30]], WOOD, WOOD_D);
    poly(g, [[-9, -16], [-4, -14], [4, -14], [9, -16], [6, -10], [-6, -10]], GOLD);
    g.fillStyle(0x9b7bff, 1).fillCircle(0, -24, 9).lineStyle(2, OUT, 1).strokeCircle(0, -24, 9);
    g.fillStyle(0xe6dcff, 1).fillCircle(-3, -27, 3);
  }),
  bow: (g) => {
    g.lineStyle(7, OUT, 1).beginPath().arc(20, 32, 26, -1.15, 1.15).strokePath();
    g.lineStyle(5, WOOD, 1).beginPath().arc(20, 32, 26, -1.15, 1.15).strokePath();
    const ex = 20 + 26 * Math.cos(1.15), ey = 26 * Math.sin(1.15);
    g.lineStyle(1.5, 0xf2f2f2, 1).lineBetween(ex, 32 - ey, ex, 32 + ey);
    g.lineStyle(3, WOOD_D, 1).lineBetween(14, 32, 56, 32);
    poly(g, [[56, 27], [63, 32], [56, 37]], STEEL);
    g.fillStyle(0xff5a5a, 1).fillTriangle(14, 32, 8, 27, 10, 32).fillTriangle(14, 32, 8, 37, 10, 32);
  },
  axe: (g) => diag(g, () => {
    poly(g, [[-3, -26], [3, -26], [3, 30], [-3, 30]], WOOD, WOOD_D);
    poly(g, [[3, -24], [20, -32], [24, -14], [20, 2], [3, -8]], STEEL);
    g.lineStyle(2, STEEL_D, 1).lineBetween(18, -28, 21, -2);
    poly(g, [[-3, -20], [-12, -24], [-12, -10], [-3, -12]], STEEL_D);
  }),
  cloth: (g) => {
    poly(g, [[20, 10], [26, 8], [32, 14], [38, 8], [44, 10], [58, 22], [50, 30], [44, 26], [44, 56], [20, 56], [20, 26], [14, 30], [6, 22]], 0x7fb2ff);
    g.lineStyle(2, 0x4d7ccc, 1).lineBetween(20, 46, 44, 46);
    g.fillStyle(0xffffff, 1).fillCircle(32, 24, 2).fillCircle(32, 32, 2);
  },
  leather: (g) => {
    poly(g, [[18, 10], [27, 8], [32, 16], [37, 8], [46, 10], [52, 20], [46, 24], [46, 56], [18, 56], [18, 24], [12, 20]], 0xa8703c);
    g.lineStyle(2, 0x6b3f1d, 1).lineBetween(32, 16, 32, 56);
    g.lineStyle(1, 0xf5d7a8, 1);
    for (let y = 22; y < 54; y += 6) g.lineBetween(29, y, 35, y + 3);
    poly(g, [[18, 40], [46, 40], [46, 45], [18, 45]], 0x5a3519);
    poly(g, [[29, 39], [35, 39], [35, 46], [29, 46]], GOLD);
  },
  chainmail: (g) => {
    poly(g, [[18, 10], [27, 8], [32, 14], [37, 8], [46, 10], [56, 24], [48, 30], [46, 26], [46, 56], [18, 56], [18, 26], [16, 30], [8, 24]], 0xb7c0d6);
    g.fillStyle(0x7f8aa8, 1);
    for (let y = 18; y < 54; y += 5) for (let x = 21 + ((y / 5) % 2) * 2.5; x < 44; x += 5) g.fillCircle(x, y, 1.3);
  },
  plate: (g) => {
    poly(g, [[20, 12], [44, 12], [48, 22], [46, 54], [32, 58], [18, 54], [16, 22]], 0xe2e8f5);
    poly(g, [[6, 16], [20, 12], [18, 28], [8, 26]], 0xc7d0e6);
    poly(g, [[58, 16], [44, 12], [46, 28], [56, 26]], 0xc7d0e6);
    g.lineStyle(2, STEEL_D, 1).lineBetween(32, 14, 32, 56).lineBetween(20, 34, 44, 34).lineBetween(21, 44, 43, 44);
    g.fillStyle(GOLD, 1).fillCircle(32, 24, 4);
  },
  cloak: (g) => {
    poly(g, [[24, 8], [40, 8], [46, 20], [56, 58], [8, 58], [18, 20]], 0x7a4bc4);
    poly(g, [[24, 8], [40, 8], [42, 20], [32, 26], [22, 20]], 0x5a3399);
    g.fillStyle(0x2a1550, 1).fillEllipse(32, 16, 12, 10);
    g.lineStyle(2, 0x9e7be0, 1).lineBetween(32, 26, 26, 58).lineBetween(32, 26, 40, 58);
    g.fillStyle(GOLD, 1).fillCircle(32, 26, 3);
  },
  epic_robe: (g) => {
    poly(g, [[20, 8], [26, 8], [32, 16], [38, 8], [44, 8], [58, 22], [50, 30], [46, 26], [52, 58], [12, 58], [18, 26], [14, 30], [6, 22]], 0xc4283c, GOLD_D);
    poly(g, [[26, 8], [32, 16], [38, 8], [36, 58], [28, 58]], GOLD);
    g.lineStyle(2, GOLD, 1).lineBetween(13, 52, 51, 52);
    g.fillStyle(0x5ad1ff, 1).fillCircle(32, 22, 3);
  },
  necklace: (g) => {
    g.lineStyle(3, GOLD_D, 1).beginPath().arc(32, 18, 20, 0.2, Math.PI - 0.2).strokePath();
    g.lineStyle(2, GOLD, 1).beginPath().arc(32, 18, 20, 0.2, Math.PI - 0.2).strokePath();
    poly(g, [[32, 34], [41, 44], [32, 58], [23, 44]], 0x5ad1ff);
    g.fillStyle(0xd8f6ff, 1).fillTriangle(32, 37, 37, 44, 32, 44);
    g.fillStyle(0xffffff, 1).fillCircle(32, 44, 1);
  },
  ring: (g) => {
    g.lineStyle(9, OUT, 1).strokeCircle(32, 38, 15);
    g.lineStyle(6, GOLD, 1).strokeCircle(32, 38, 15);
    poly(g, [[25, 18], [32, 10], [39, 18], [32, 26]], 0xff5a7a);
    g.fillStyle(0xffd0da, 1).fillTriangle(32, 13, 36, 18, 32, 18);
  },
  bracelet: (g) => {
    g.lineStyle(11, OUT, 1).strokeEllipse(32, 34, 46, 30);
    g.lineStyle(8, 0xc9d4ef, 1).strokeEllipse(32, 34, 46, 30);
    for (const [x, c] of [[14, 0x5ad1ff], [32, 0x6be08a], [50, 0xff5a7a]] as const) {
      g.fillStyle(c, 1).fillCircle(x, x === 32 ? 49 : 41, 4).lineStyle(1.5, OUT, 1).strokeCircle(x, x === 32 ? 49 : 41, 4);
    }
  },
  earring: (g) => {
    g.lineStyle(3, GOLD, 1).beginPath().arc(32, 16, 8, Math.PI, Math.PI * 2.2).strokePath();
    g.lineStyle(2, GOLD_D, 1).lineBetween(32, 24, 32, 32);
    g.fillStyle(0x9b7bff, 1).fillCircle(32, 44, 11).lineStyle(2, OUT, 1).strokeCircle(32, 44, 11);
    g.fillStyle(0xe6dcff, 1).fillCircle(28, 40, 3.5);
  },
  amulet: (g) => {
    g.lineStyle(2, WOOD_D, 1).lineBetween(14, 6, 26, 22).lineBetween(50, 6, 38, 22);
    g.fillStyle(GOLD, 1).fillCircle(32, 38, 18).lineStyle(2, OUT, 1).strokeCircle(32, 38, 18);
    g.fillStyle(0x3fb27f, 1).fillCircle(32, 38, 12);
    const star: P = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 4 : 10, a = -Math.PI / 2 + (i * Math.PI) / 5;
      star.push([32 + r * Math.cos(a), 38 + r * Math.sin(a)]);
    }
    poly(g, star, 0xfff2b0, GOLD_D);
  },
  epic_heart: (g) => {
    g.fillStyle(GOLD, 1).fillCircle(22, 26, 14).fillCircle(42, 26, 14).fillTriangle(9, 31, 55, 31, 32, 58);
    g.fillStyle(0xd61f45, 1).fillCircle(22, 26, 10).fillCircle(42, 26, 10).fillTriangle(13, 30, 51, 30, 32, 52);
    g.fillStyle(0xff9fb3, 1).fillCircle(19, 22, 4);
    g.fillStyle(0xffffff, 1).fillCircle(44, 20, 2);
  },
};

export function makeIconTextures(scene: Phaser.Scene) {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  for (const [k, draw] of Object.entries(DRAW)) {
    g.clear();
    draw(g);
    g.generateTexture(`icon_${k}`, 64, 64);
  }
  g.destroy();
}

/** 带稀有度边框的图标；size 为外框边长 */
export function itemIcon(scene: Phaser.Scene, x: number, y: number, it: Item | null, size = 52, slot?: Slot) {
  const c = scene.add.container(x, y);
  const color = it ? RARITY[it.rarity].color : 0x3a4170;
  const bg = scene.add.rectangle(0, 0, size, size, 0x0e1122).setStrokeStyle(it ? 3 : 2, color);
  c.add(bg);
  if (it && (it.rarity === 'legendary' || it.rarity === 'epic')) {
    const glow = scene.add.rectangle(0, 0, size + 6, size + 6, color, 0.25).setBlendMode('ADD');
    c.addAt(glow, 0);
    scene.tweens.add({ targets: glow, alpha: 0.05, duration: 700, yoyo: true, repeat: -1 });
  }
  const key = it ? iconKey(it) : slot ? slotIconKey(slot) : null;
  if (key) {
    const img = scene.add.image(0, 0, key).setDisplaySize(size - 8, size - 8);
    if (!it) img.setTintFill(0x2c3254);
    c.add(img);
  }
  if (it?.enhance) {
    c.add(scene.add.text(size / 2 - 3, size / 2 - 2, `+${it.enhance}`, {
      fontFamily: 'Arial', fontSize: `${Math.round(size / 4)}px`, fontStyle: 'bold', color: '#ffe14a', stroke: '#000', strokeThickness: 3,
    }).setOrigin(1, 1));
  }
  return c;
}
