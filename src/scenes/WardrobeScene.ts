import { need } from '../assets';
import Phaser from 'phaser';
import { sfx } from '../audio/sound';
import { voice } from '../audio/speech';
import { makeHero } from '../gfx/hero';
import { COSTUMES, canMake, fullSet, makePiece, MAT_INFO, PIECE_NAME, PIECES, pieceId, type MatKey, type Piece } from '../systems/costumes';
import { game } from '../state';
import { button, COLORS, panel, text, toast } from '../ui/widgets';
import { layeredBg } from './BootScene';

/** 衣柜 / 裁缝：左边是试穿的主角，右边每套 3 件（打造 / 穿上 / 脱下），底部是材料 */
export class WardrobeScene extends Phaser.Scene {
  private layer?: Phaser.GameObjects.Container;
  private from = 'Town';

  constructor() {
    super('Wardrobe');
  }

  init(data: { tailor?: boolean }) {
    this.from = 'Town';
    this.tailor = !!data?.tailor;
  }

  private tailor = false;

  preload() {
    need(this, { heroes: [game.s], bgs: ['shop'], costumes: COSTUMES.map((c) => c.id), chars: ['tailor'] });
  }

  create() {
    layeredBg(this, 'shop');
    this.add.rectangle(0, 0, 1280, 720, 0x0b0d17, 0.35).setOrigin(0);
    button(this, 90, 680, 150, 48, '← 回城', () => this.scene.start(this.from), { size: 20 }).setDepth(50);
    if (this.tailor) voice('tailor', '来来来，挑一套你喜欢的！');
    this.render();
  }

  private render() {
    this.layer?.destroy();
    const L = (this.layer = this.add.container(0, 0));
    const s = game.s;
    // 左：主角试穿
    L.add(panel(this, 16, 14, 360, 640, 0.92));
    L.add(text(this, 196, 44, this.tailor ? '✂ 裁缝铺 · 衣柜' : '👗 衣柜', 26, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5));
    L.add(makeHero(this, 196, 440, s, 0.85).idle());
    const set = fullSet(s);
    L.add(text(this, 196, 478, set ? `✨ 整套「${set.name}」：称号「${set.title}」\n进场特效 · 金币 +5%` : '穿齐同一套的 3 件：\n得到称号、进场特效、金币 +5%', 15, set ? '#ffe14a' : COLORS.dim, { align: 'center' }).setOrigin(0.5, 0));
    L.add(button(this, 196, 600, 200, 44, '全部脱下', () => {
      s.wardrobe.worn = {};
      void game.persist();
      this.render();
    }, { size: 17, color: 0x444a6b }));

    // 右：套装列表
    L.add(panel(this, 390, 14, 874, 640, 0.92));
    COSTUMES.forEach((c, row) => {
      const y = 58 + row * 80;
      const css = `#${c.color.toString(16).padStart(6, '0')}`;
      L.add(this.add.rectangle(408, y - 34, 8, 68, c.color).setOrigin(0));
      L.add(text(this, 426, y - 22, c.name, 21, css, { fontStyle: 'bold' }));
      const owned = PIECES.filter((p) => s.wardrobe.owned.includes(pieceId(c.id, p))).length;
      L.add(text(this, 426, y + 8, `已有 ${owned}/3`, 14, COLORS.dim));
      PIECES.forEach((p, i) => L.add(this.pieceCard(c.id, p, 640 + i * 210, y)));
    });
    // 底：材料
    const mats = (Object.keys(MAT_INFO) as MatKey[]).map((k) => `${MAT_INFO[k].name} ${s.mats[k]}`).join('   ');
    L.add(text(this, 827, 630, `材料：${mats}   💰 ${s.gold}`, 16, '#ffd38a').setOrigin(0.5));
  }

  private pieceCard(set: string, p: Piece, x: number, y: number) {
    const s = game.s;
    const c = COSTUMES.find((k) => k.id === set)!;
    const box = this.add.container(x, y);
    const owned = s.wardrobe.owned.includes(pieceId(set, p));
    const worn = s.wardrobe.worn[p] === set;
    const g = this.add.graphics();
    g.fillStyle(worn ? 0x2a3a6a : 0x1a1f38, 1).fillRoundedRect(-98, -38, 196, 76, 10);
    g.lineStyle(worn ? 3 : 2, worn ? 0xffe14a : owned ? c.color : 0x3a4170, 1).strokeRoundedRect(-98, -38, 196, 76, 10);
    box.add(g);
    box.add(text(this, -86, -30, `${PIECE_NAME[p]}${worn ? ' ✔' : ''}`, 16, owned ? '#ffffff' : COLORS.dim, { fontStyle: 'bold' }));
    if (owned) {
      box.add(button(this, 40, 14, 100, 34, worn ? '脱下' : '穿上', () => {
        if (worn) delete s.wardrobe.worn[p];
        else s.wardrobe.worn[p] = set;
        sfx('ui_click');
        void game.persist();
        this.render();
      }, { size: 15, color: worn ? 0x444a6b : 0x3b62d9 }));
    } else {
      const cost = c.cost[p];
      const need = [...(Object.keys(MAT_INFO) as MatKey[]).filter((k) => cost[k]).map((k) => `${MAT_INFO[k].name}${cost[k]}`), cost.gold ? `💰${cost.gold}` : ''].filter(Boolean).join(' ');
      box.add(text(this, -90, -10, need, 11, COLORS.dim, { wordWrap: { width: 108 }, lineSpacing: -2 }));
      const ok = canMake(s, c, p);
      const b = button(this, 56, 14, 72, 34, '打造', () => {
        if (!this.tailor) return toast(this, '去集市找裁缝阿姨打造吧', '#ffd27a');
        if (!makePiece(s, c, p)) return;
        sfx('craft');
        voice('tailor', '好啦！快穿上看看！');
        this.cameras.main.flash(250, 255, 230, 200);
        void game.persist();
        this.render();
        if (fullSet(s)?.id === set) {
          sfx('equip_epic');
          toast(this, `🎉 集齐「${c.name}」整套！获得称号「${c.title}」`, `#${c.color.toString(16).padStart(6, '0')}`);
        }
      }, { size: 15, color: 0x8a5a12 });
      b.setEnabled(ok);
      box.add(b);
    }
    return box;
  }
}
