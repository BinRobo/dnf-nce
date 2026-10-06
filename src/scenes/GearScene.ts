import { need } from '../assets';
import Phaser from 'phaser';
import { speak } from '../audio/speech';
import { layeredBg } from './BootScene';
import { CATALOG, SERIES, SLOT_NAME, usableBy, WTYPE_NAME, catalogOf, type CatalogItem } from '../systems/catalog';
import { classOf } from '../systems/classes';
import { epicsFor } from '../systems/items';
import { game } from '../state';
import { button, COLORS, EN_FONT, panel, text } from '../ui/widgets';

/** 装备图鉴：本职业能用的全部装备，没拿到的显示剪影 + 获取提示；系列集齐有称号 */
export class GearScene extends Phaser.Scene {
  private layer?: Phaser.GameObjects.Container;
  private sel: string | null = null;

  constructor() {
    super('Gear');
  }

  preload() {
    need(this, { bgs: ['shop'], icons: 'all' });
  }

  create() {
    layeredBg(this, 'shop');
    this.add.rectangle(0, 0, 1280, 720, 0x0b0d17, 0.5).setOrigin(0);
    button(this, 100, 676, 160, 50, '← 返回', () => this.scene.start('Codex'));
    this.render();
  }

  private seen() {
    const s = game.s;
    const ids = new Set(s.codex.items);
    for (const it of s.inventory) {
      const c = catalogOf(it.name);
      if (c) ids.add(c.id);
    }
    return ids;
  }

  private render() {
    this.layer?.destroy();
    const L = (this.layer = this.add.container(0, 0));
    const s = game.s;
    const cls = classOf(s);
    const seen = this.seen();
    const mine = CATALOG.filter((c) => usableBy(c, cls.wtypes, cls.armor));
    L.add(panel(this, 20, 16, 860, 640));
    L.add(text(this, 40, 30, `🗡 装备图鉴 · ${cls.name}（${mine.filter((c) => seen.has(c.id)).length}/${mine.length}）`, 24, '#ffffff', { fontStyle: 'bold' }));
    let y = 86;
    const groups: [string, CatalogItem[]][] = [
      ...Object.entries(SERIES).map(([k, v]) => [`「${v.name}」系列 · ${v.desc}`, mine.filter((c) => c.series === k)] as [string, CatalogItem[]]),
      ['通用装备', mine.filter((c) => c.chapter === 0)],
    ];
    for (const [title, items] of groups) {
      const got = items.filter((c) => seen.has(c.id)).length;
      L.add(text(this, 40, y, `${title}   ${got}/${items.length}${got === items.length && items.length ? '  🏆 集齐！' : ''}`, 16, '#ffd38a'));
      y += 28;
      items.forEach((c, i) => {
        const x = 76 + (i % 10) * 82, yy = y + 36 + Math.floor(i / 10) * 86;
        L.add(this.tile(c, x, yy, seen.has(c.id)));
      });
      y += 36 + Math.ceil(items.length / 10) * 86;
    }
    // 史诗
    L.add(text(this, 40, y, '史诗武器（集市铁匠用史诗碎片打造）', 16, '#ffb020'));
    epicsFor(s.cls).forEach((e, i) => {
      const own = s.crafted.includes(e.name) || s.inventory.some((it) => it.name === e.name);
      const x = 76 + i * 82, yy = y + 64;
      const c = this.add.container(x, yy);
      c.add(this.add.rectangle(0, 0, 70, 70, 0x0e1122).setStrokeStyle(3, own ? e.color : 0x3a4170));
      const img = this.add.image(0, 0, `icon_${e.look}`).setDisplaySize(62, 62);
      if (!own) img.setTintFill(0x1b1e33);
      c.add(img);
      L.add(c);
    });

    // 右：详情
    L.add(panel(this, 896, 16, 364, 640));
    const c = CATALOG.find((k) => k.id === this.sel);
    if (!c) {
      L.add(text(this, 1078, 300, '点一件装备\n查看详情', 22, COLORS.dim, { align: 'center' }).setOrigin(0.5));
      return;
    }
    const got = seen.has(c.id);
    const img = this.add.image(1078, 130, `icon_${c.look}`).setDisplaySize(130, 130);
    if (!got) img.setTintFill(0x1b1e33);
    L.add(img);
    L.add(text(this, 1078, 220, got ? c.name : '？？？', 26, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5));
    L.add(text(this, 1078, 256, `${SLOT_NAME[c.slot]}${c.wtype ? ' · ' + WTYPE_NAME[c.wtype] : ''}`, 17, COLORS.dim).setOrigin(0.5));
    if (c.word) {
      L.add(button(this, 1078, 310, 300, 44, `🔊 ${c.word}  ${c.zh}`, () => {
        const w = game.index.lessons.flatMap((l) => l.words).find((x) => x.en.toLowerCase() === c.word);
        speak({ text: c.word!, clip: w?.audio });
      }, { size: 19, font: EN_FONT, color: 0x2a3a5a }));
    }
    L.add(text(this, 1078, 370, got ? '已收集 ✔' : c.chapter ? `第 ${c.chapter} 章的副本里会掉落` : '任何副本都可能掉落', 17, got ? '#7dffa5' : '#ffd38a').setOrigin(0.5));
  }

  private tile(c: CatalogItem, x: number, y: number, got: boolean) {
    const box = this.add.container(x, y);
    const on = this.sel === c.id;
    box.add(this.add.rectangle(0, 0, 70, 70, 0x0e1122).setStrokeStyle(on ? 4 : 2, on ? 0xffffff : got ? 0x5aa9ff : 0x3a4170));
    const key = this.textures.exists(`icon_${c.look}`) ? `icon_${c.look}` : 'icon_longsword';
    const img = this.add.image(0, 0, key).setDisplaySize(60, 60);
    if (!got) img.setTintFill(0x23284a);
    box.add(img);
    if (!got) box.add(text(this, 0, 0, '？', 26, '#6d7399', { fontStyle: 'bold' }).setOrigin(0.5));
    box.add(text(this, 0, 44, got ? c.name : '？？？', 12, got ? '#cfd6ff' : '#6d7399').setOrigin(0.5));
    const hit = this.add.rectangle(0, 6, 76, 86, 0, 0).setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => {
      this.sel = c.id;
      this.render();
    });
    box.add(hit);
    return box;
  }
}
