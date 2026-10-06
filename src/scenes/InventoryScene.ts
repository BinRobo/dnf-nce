import { need } from '../assets';
import { sfx } from '../audio/sound';
import Phaser from 'phaser';
import { itemIcon, weaponLook } from '../gfx/icons';
import { backdrop } from '../gfx/textures';
import type { Item, Slot } from '../save/schema';
import { enhanceCost, enhanceRate, epicDef, itemAtk, RARITY, rarityTier, salvage, tryEnhance } from '../systems/items';
import { playerStats } from '../systems/player';
import { catalogOf, SERIES, SLOT_NAME, SLOTS, usableBy, WTYPE_NAME } from '../systems/catalog';
import { classOf } from '../systems/classes';
import { makeHero } from '../gfx/hero';
import { speak } from '../audio/speech';
import { EN_FONT } from '../ui/widgets';
import { game } from '../state';
import { confirmBox } from '../ui/modal';
import { button, COLORS, panel, text, toast } from '../ui/widgets';

const SHORT_NAME: Record<string, string> = {
  '史诗·亚历山大的字典剑': '字典剑', '史诗·莎士比亚战袍': '莎翁战袍', '史诗·牛津之心': '牛津之心', '史诗·帕顿的金号角锤': '金号角锤', '史诗·胡迷斯的名牌羽杖': '名牌羽杖',
};
/** 材料：图标、数量、用途与来源 */
const MATS: { key: string; name: string; icon: string; color: string; count: () => number; use: string; from: string }[] = [
  { key: 'stone', name: '强化石', icon: 'icon_mat_stone', color: '#6fd3ff', count: () => game.s.stones, use: '强化装备', from: '分解装备、通关副本、每日任务' },
  { key: 'shard', name: '史诗碎片', icon: 'icon_mat_shard', color: '#ffb020', count: () => game.s.mats.shard, use: '10 个在集市铁匠处打造一把史诗武器', from: '打败 Boss、深渊、分解史诗装备' },
  { key: 'soul', name: 'Boss之魂', icon: 'icon_mat_soul', color: '#d28bff', count: () => game.s.mats.soul, use: '强化 +8 及以上', from: '打败 Boss（SS 以上得 2 个）' },
];
const PER_PAGE = 25; // 5 列 x 5 行

export class InventoryScene extends Phaser.Scene {
  private selected: string | null = null;
  private page = 0;
  private tab: 'items' | 'mats' = 'items';
  private matSel = 'stone';
  /** 刚分解得到的材料：材料页签上显示 +N */
  private fresh = 0;
  private layer?: Phaser.GameObjects.Container;

  constructor() {
    super('Inventory');
  }

  preload() {
    // 背包里的武器外观也加载，换装备时主角手上立刻能显示
    const looks = game.s.inventory.filter((i) => i.slot === 'weapon').map((i) => weaponLook(i)!).filter(Boolean);
    need(this, { heroes: [game.s], icons: 'all', weapons: [...new Set(looks)] });
  }

  create() {
    backdrop(this, 'town', 700);
    button(this, 110, 670, 180, 54, '← 回城', () => this.scene.start('Town'));
    this.render();
  }

  private render() {
    this.layer?.destroy();
    const L = (this.layer = this.add.container(0, 0));
    const s = game.s;
    const st = playerStats(s);

    // 左：角色和已装备
    L.add(panel(this, 20, 20, 360, 620));
    L.add(makeHero(this, 200, 250, s, 0.5).idle());
    L.add(text(this, 200, 272, `⚔ ${st.atk}   🛡 ${st.shield}   ✦ ${Math.round(st.crit * 100)}%`, 22).setOrigin(0.5));
    L.add(text(this, 200, 302, `💰 ${s.gold}   💎 强化石 ${s.stones}`, 17, COLORS.dim).setOrigin(0.5));
    SLOTS.forEach((slot, i) => {
      const it = s.inventory.find((x) => x.uid === s.equipped[slot]);
      const x = i % 2 ? 288 : 112, y = 372 + Math.floor(i / 2) * 88;
      L.add(text(this, x - 82, y - 44, SLOT_NAME[slot], 14, COLORS.dim));
      L.add(this.itemButton(it, x, y, 170, slot));
    });

    // 中：背包
    L.add(panel(this, 400, 20, 500, 620));
    const tabBtn = (x: number, label: string, t: 'items' | 'mats') => {
      const b = button(this, x, 50, 150, 44, label, () => {
        this.tab = t;
        if (t === 'mats') this.fresh = 0;
        this.render();
      }, { size: 18, color: this.tab === t ? 0x3b62d9 : 0x2a2f52 });
      L.add(b);
      return b;
    };
    tabBtn(500, `装备 (${s.inventory.length})`, 'items');
    tabBtn(660, '材料', 'mats');
    if (this.fresh) {
      const badge = text(this, 730, 30, `+${this.fresh}`, 16, '#ffffff', { backgroundColor: '#e8505b', padding: { x: 6, y: 1 } }).setOrigin(0.5);
      L.add(badge);
      this.tweens.add({ targets: badge, scale: 1.25, duration: 350, yoyo: true, repeat: -1 });
    }
    if (this.tab === 'mats') return this.renderMats(L);
    const list = [...s.inventory].sort((a, b) => b.obtainedAt - a.obtainedAt);
    const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
    this.page = Math.min(this.page, pages - 1);
    list.slice(this.page * PER_PAGE, (this.page + 1) * PER_PAGE).forEach((it, i) => {
      L.add(this.itemTile(it, 466 + (i % 5) * 92, 128 + Math.floor(i / 5) * 96));
    });
    if (!list.length) L.add(text(this, 650, 300, '还没有装备，去副本里打怪吧！', 20, COLORS.dim).setOrigin(0.5));
    if (pages > 1) {
      L.add(button(this, 560, 600, 100, 40, '上一页', () => { this.page = Math.max(0, this.page - 1); this.render(); }, { size: 18 }));
      L.add(text(this, 650, 600, `${this.page + 1}/${pages}`, 18).setOrigin(0.5));
      L.add(button(this, 740, 600, 100, 40, '下一页', () => { this.page = Math.min(pages - 1, this.page + 1); this.render(); }, { size: 18 }));
    }

    // 右：详情
    L.add(panel(this, 920, 20, 340, 620));
    const it = s.inventory.find((x) => x.uid === this.selected);
    if (!it) {
      L.add(text(this, 1090, 300, '点一件装备\n查看详情', 22, COLORS.dim, { align: 'center' }).setOrigin(0.5));
      return;
    }
    const info = RARITY[it.rarity];
    L.add(itemIcon(this, 1000, 90, it, 96));
    const cat = catalogOf(it.name);
    L.add(text(this, 1060, 58, `【${info.name}】${SLOT_NAME[it.slot]}${cat?.wtype ? ' · ' + WTYPE_NAME[cat.wtype] : ''}`, 18, info.css));
    if (cat?.word) {
      // 系列装备：印着课文单词，点一下听发音
      const w = game.index.lessons.flatMap((l) => l.words).find((x) => x.en.toLowerCase() === cat.word);
      const b = button(this, 1090, 140, 290, 40, `🔊 ${cat.word}  ${cat.zh}`, () => speak({ text: cat.word!, clip: w?.audio }), { size: 18, font: EN_FONT, color: 0x2a3a5a });
      L.add(b);
      if (cat.series) L.add(text(this, 1090, 112, `「${SERIES[cat.series].name}」系列`, 14, '#ffd38a').setOrigin(0.5));
    }
    L.add(text(this, 1060, 84, `${it.name}${it.enhance ? ` +${it.enhance}` : ''}`, 20, info.css, { fontStyle: 'bold', wordWrap: { width: 190 } }));
    const props = [
      it.atk && `攻击 +${itemAtk(it)}`,
      it.hp && `生命 +${it.hp}`,
      it.crit && `暴击 +${Math.round(it.crit * 100)}%`,
    ].filter(Boolean) as string[];
    props.forEach((p, i) => L.add(text(this, 1090, 186 + i * 28, p, 21).setOrigin(0.5)));
    L.add(text(this, 1090, 272, `来自：${it.from}`, 16, COLORS.dim, { wordWrap: { width: 300 }, align: 'center' }).setOrigin(0.5));

    const equipped = s.equipped[it.slot] === it.uid;
    const cdef = classOf(s);
    const usable = it.rarity === 'epic' ? (epicDef(it.name)?.cls ?? cdef.id) === cdef.id : !cat || usableBy(cat, cdef.wtypes, cdef.armor);
    if (!usable) L.add(text(this, 1090, 296, `${cdef.name}用不了这件（可以分解）`, 15, '#ff9a9a').setOrigin(0.5));
    const eqb = button(this, 1090, 330, 260, 52, equipped ? '卸下' : '装备', () => {
      if (equipped) delete s.equipped[it.slot];
      else {
        s.equipped[it.slot] = it.uid;
        const tier = rarityTier(it.rarity);
        if (tier >= 4) sfx('equip_epic');
        else if (tier >= 2) sfx(`hit_t${tier}`, { volume: 0.6 });
      }
      this.commit();
    }, { color: 0x3b62d9 });
    eqb.setEnabled(usable || equipped);
    L.add(eqb);

    const cost = enhanceCost(it);
    const rate = Math.round(enhanceRate(it) * 100);
    L.add(text(this, 1090, 395, `强化 +${it.enhance} → +${it.enhance + 1}${rate >= 100 ? '（必定成功）' : ''}`, 18).setOrigin(0.5));
    L.add(text(this, 1090, 422, `消耗 💎${cost.stones}  💰${cost.gold}${cost.soul ? `  ☠Boss之魂×${cost.soul}` : ''}`, 16, COLORS.dim).setOrigin(0.5));
    L.add(button(this, 1090, 470, 260, 52, '🔨 强化', () => this.enhance(it), { color: 0xb46bff }));
    L.add(button(this, 1090, 550, 260, 46, '分解成强化石', () =>
      confirmBox(this, `分解【${it.name}】？`, () => {
        const epic = it.rarity === 'epic';
        const n = salvage(s, it);
        this.selected = null;
        this.fresh += n + (epic ? 3 : 0);
        toast(this, `获得强化石 ×${n}${epic ? '、史诗碎片 ×3' : ''}（放进了「材料」）`, '#9fe3ff');
        sfx('coin');
        this.commit();
        // 材料图标飞进“材料”页签
        for (let k = 0; k < Math.min(6, n); k++) {
          const ic = this.add.image(1090, 550, 'icon_mat_stone').setDisplaySize(40, 40).setDepth(80);
          this.tweens.add({ targets: ic, x: 660, y: 50, delay: k * 80, duration: 500, ease: 'Quad.in', onComplete: () => ic.destroy() });
        }
      }), { size: 20, color: 0x6b2a35 }));
  }

  /** 材料页：格子 + 右侧说明 */
  private renderMats(L: Phaser.GameObjects.Container) {
    MATS.forEach((m, i) => {
      const x = 466 + (i % 5) * 92, y = 128 + Math.floor(i / 5) * 96;
      const c = this.add.container(x, y);
      const sel = this.matSel === m.key;
      c.add(this.add.rectangle(0, 0, 72, 72, 0x0e1122).setStrokeStyle(sel ? 4 : 3, sel ? 0xffffff : Phaser.Display.Color.HexStringToColor(m.color).color));
      c.add(this.add.image(0, 0, m.icon).setDisplaySize(62, 62));
      c.add(text(this, 33, 33, `×${m.count()}`, 17, '#ffffff', { stroke: '#000', strokeThickness: 4, fontStyle: 'bold' }).setOrigin(1, 1));
      c.add(text(this, 0, 46, m.name, 13, m.color).setOrigin(0.5));
      const hit = this.add.rectangle(0, 6, 84, 92, 0, 0).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => {
        this.matSel = m.key;
        this.render();
      });
      c.add(hit);
      L.add(c);
    });
    L.add(text(this, 650, 590, '以后会有更多材料：打造套装、装扮都要用到', 15, COLORS.dim).setOrigin(0.5));
    const m = MATS.find((x) => x.key === this.matSel)!;
    L.add(panel(this, 920, 20, 340, 620));
    L.add(this.add.image(1090, 130, m.icon).setDisplaySize(120, 120));
    L.add(text(this, 1090, 220, `${m.name} ×${m.count()}`, 28, m.color, { fontStyle: 'bold' }).setOrigin(0.5));
    L.add(text(this, 1090, 290, `用途：${m.use}`, 18, '#e9ecff', { wordWrap: { width: 290 }, align: 'center' }).setOrigin(0.5, 0));
    L.add(text(this, 1090, 380, `获得：${m.from}`, 18, COLORS.dim, { wordWrap: { width: 290 }, align: 'center' }).setOrigin(0.5, 0));
  }

  /** 已装备栏：图标 + 名称 */
  private itemButton(it: Item | undefined, x: number, y: number, w: number, slot?: Slot) {
    const c = this.add.container(x, y);
    const bg = this.add.rectangle(0, 0, w, 64, 0x1a1f38).setStrokeStyle(2, it ? RARITY[it.rarity].color : 0x3a4170);
    c.add([bg, itemIcon(this, -w / 2 + 34, 0, it ?? null, 56, slot)]);
    const name = it ? `${SHORT_NAME[it.name] ?? it.name}${it.enhance ? ` +${it.enhance}` : ''}` : `（空）`;
    c.add(text(this, -w / 2 + 70, 0, name, 15, it ? RARITY[it.rarity].css : COLORS.dim, { wordWrap: { width: w - 76 } }).setOrigin(0, 0.5));
    if (it) {
      if (this.selected === it.uid) bg.setStrokeStyle(4, 0xffffff);
      bg.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        this.selected = it.uid;
        this.render();
      });
    }
    return c;
  }

  /** 背包格子：大图标 + 下方短名称 */
  private itemTile(it: Item, x: number, y: number) {
    const c = this.add.container(x, y);
    const icon = itemIcon(this, 0, 0, it, 72);
    c.add(icon);
    if (this.selected === it.uid) c.addAt(this.add.rectangle(0, 0, 82, 82, 0xffffff, 0.25).setStrokeStyle(3, 0xffffff), 0);
    if (Object.values(game.s.equipped).includes(it.uid)) {
      c.add(text(this, -33, -36, '✔', 18, '#7dffa5', { stroke: '#000', strokeThickness: 4 }));
    }
    const short = SHORT_NAME[it.name] ?? it.name;
    c.add(text(this, 0, 46, short, 13, RARITY[it.rarity].css).setOrigin(0.5));
    const hit = this.add.rectangle(0, 6, 84, 92, 0, 0).setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => {
      this.selected = it.uid;
      this.render();
    });
    c.add(hit);
    return c;
  }

  private enhance(it: Item) {
    const r = tryEnhance(game.s, it);
    if (r === 'poor') return toast(this, enhanceCost(it).soul > game.s.mats.soul ? '+8 以上需要 Boss之魂：去挑战 Boss 吧！' : '材料不够，去副本里收集吧', '#ffd27a');
    if (r === 'max') return toast(this, '已经强化到最高级啦', '#ffd27a');
    if (r === 'ok') {
      this.cameras.main.flash(200, 200, 160, 255);
      toast(this, `强化成功！+${it.enhance}`, '#d9a6ff');
    } else {
      toast(this, '强化失败…下次成功率提升 10%', '#9fb0ff');
    }
    this.commit();
  }

  private commit() {
    void game.persist();
    this.render();
  }
}
