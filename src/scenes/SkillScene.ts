import { need } from '../assets';
import Phaser from 'phaser';
import { sfx } from '../audio/sound';
import { castSkill, makeSkillTextures } from '../battle/skills';
import { BAR_KEYS, BAR_LEVELS, barSize, baseSkill, canLearn, learn, MAX_RANK, rankLevel, resetSkills, skillChapter, skillDef, skillPoints, skillTree, toggleBar } from '../battle/skilldata';
import { classOf } from '../systems/classes';
import { Fx } from '../battle/fx';
import { weaponHit, weaponStyle } from '../battle/weaponfx';
import { equippedItems } from '../systems/player';
import { makeHero } from '../gfx/hero';
import { game } from '../state';
import { confirmBox } from '../ui/modal';
import { button, COLORS, panel, text, toast } from '../ui/widgets';
import { layeredBg } from './BootScene';

/** 技能树：花技能点学习/升级技能，配置技能栏（最多 4 个），右侧木头假人可试放 */
export class SkillScene extends Phaser.Scene {
  private layer?: Phaser.GameObjects.Container;
  private selected = '';
  private chapter = 1;
  private fx!: Fx;
  private demoBusy = false;

  constructor() {
    super('Skills');
  }

  preload() {
    need(this, { heroes: [game.s], bgs: ['training'], mobs: ['golem'], fx: true, sfx: 'battle' });
  }

  create() {
    this.selected = this.selected && skillTree(game.s).some((k) => k.id === this.selected) ? this.selected : baseSkill(game.s);
    this.chapter = skillChapter(skillDef(this.selected).level);
    layeredBg(this, 'training');
    this.add.rectangle(0, 0, 1280, 720, 0x0b0d17, 0.35).setOrigin(0);
    makeSkillTextures(this);
    this.fx = new Fx(this, game.s.settings.reduceFx);
    button(this, 90, 680, 150, 48, '← 回城', () => this.scene.start('Town'), { size: 20 }).setDepth(50);
    this.render();
  }

  private render() {
    this.layer?.destroy();
    const L = (this.layer = this.add.container(0, 0));
    const s = game.s;
    const slots = barSize(s.level);
    // 老存档：技能栏超出当前格数的部分去掉
    if (s.skills.bar.length > slots) s.skills.bar = s.skills.bar.slice(0, slots);
    const pts = skillPoints(s);
    L.add(panel(this, 16, 14, 760, 640, 0.94));
    L.add(text(this, 36, 28, `✦ ${classOf(s).name}技能树`, 26, '#ffffff', { fontStyle: 'bold' }));
    L.add(text(this, 220, 34, `剩余技能点 ${pts.free}（每升 1 级 +1）`, 20, pts.free ? '#ffe14a' : COLORS.dim));
    L.add(button(this, 690, 40, 140, 40, '重置技能点', () => confirmBox(this, '把技能点全部退回来重新分配吗？（免费）', () => {
      resetSkills(s);
      void game.persist();
      this.render();
    }), { size: 16, color: 0x6b2a35 }));

    // 按章分页，页内按开放等级分层
    const tree = skillTree(s);
    const chapters = [...new Set(tree.map((k) => skillChapter(k.level)))];
    chapters.forEach((ch, i) => {
      const on = ch === this.chapter;
      const lv = Math.min(...tree.filter((k) => skillChapter(k.level) === ch).map((k) => k.level));
      L.add(button(this, 92 + i * 112, 80, 104, 34, `第${ch}章${s.level < lv ? ' 🔒' : ''}`, () => {
        this.chapter = ch;
        this.render();
      }, { size: 15, color: on ? 0x3b62d9 : 0x2a2f52 }));
    });
    const inCh = tree.filter((k) => skillChapter(k.level) === this.chapter);
    const tiers = [...new Set(inCh.map((k) => k.level))];
    tiers.forEach((lv, row) => {
      const y = 148 + row * 86;
      const locked = s.level < lv;
      L.add(text(this, 36, y, `Lv.${lv}`, 18, locked ? '#6d7399' : '#9fe3ff', { fontStyle: 'bold' }).setOrigin(0, 0.5));
      inCh.filter((k) => k.level === lv).forEach((k, i) => {
        const x = 150 + i * 300;
        const rank = s.skills.ranks[k.id] ?? 0;
        const sel = this.selected === k.id;
        const g = this.add.graphics();
        g.fillStyle(sel ? 0x2a3a6a : 0x1b1e33, 0.95).fillRoundedRect(x - 40, y - 36, 280, 72, 12);
        g.lineStyle(sel ? 3 : 2, sel ? 0xffe14a : k.passive ? 0x8a5a12 : 0x3a4170, 1).strokeRoundedRect(x - 40, y - 36, 280, 72, 12);
        g.fillStyle(k.color, locked ? 0.2 : rank ? 0.95 : 0.45).fillCircle(x, y, 26);
        g.lineStyle(3, 0x2b2a4a, 1).strokeCircle(x, y, 26);
        L.add(g);
        L.add(text(this, x, y, k.glyph, 24, locked ? '#6d7399' : '#1b1030', { fontStyle: 'bold' }).setOrigin(0.5));
        L.add(text(this, x + 38, y - 18, k.name, k.name.length > 6 ? 16 : 20, locked ? '#6d7399' : '#ffffff', { fontStyle: 'bold' }));
        if (k.passive) L.add(text(this, x + 200, y - 30, '被动', 12, '#ffd38a'));
        // 等级小格
        for (let r = 0; r < MAX_RANK; r++) L.add(this.add.rectangle(x + 44 + r * 20, y + 16, 15, 10, r < rank ? 0xffe14a : s.level >= rankLevel(k, r + 1) ? 0x3a4170 : 0x23284a));
        if (s.skills.bar.includes(k.id)) L.add(text(this, x + 150, y + 8, '已装备', 13, '#7dffa5'));
        if (canLearn(s, k.id)) {
          const plus = text(this, x + 222, y, '＋', 30, '#ffe14a', { fontStyle: 'bold' }).setOrigin(0.5);
          L.add(plus);
          this.tweens.add({ targets: plus, scale: 1.2, duration: 400, yoyo: true, repeat: -1 });
        }
        const hit = this.add.rectangle(x + 100, y, 280, 72, 0, 0).setInteractive({ useHandCursor: true });
        hit.on('pointerdown', () => {
          this.selected = k.id;
          sfx('ui_click');
          this.render();
        });
        L.add(hit);
      });
    });

    // 右侧：详情 + 技能栏 + 试放
    L.add(panel(this, 790, 14, 474, 640, 0.94));
    const d = skillDef(this.selected);
    const rank = s.skills.ranks[d.id] ?? 0;
    L.add(text(this, 1027, 46, d.name, 30, `#${d.color.toString(16).padStart(6, '0')}`, { fontStyle: 'bold' }).setOrigin(0.5));
    L.add(text(this, 1027, 84, d.desc, 18, '#e9ecff', { wordWrap: { width: 420 }, align: 'center' }).setOrigin(0.5));
    L.add(text(this, 1027, 116, `开放 Lv.${d.level} · ${d.passive ? '被动技能' : `充能 ${d.cd ? `答对 ${d.cd} 题` : '随时可用'}`} · 当前 ${rank}/${MAX_RANK} 级`, 16, COLORS.dim).setOrigin(0.5));
    L.add(text(this, 1027, 142, d.passive ? `4 级需 Lv.${rankLevel(d, 4)}，5 级需 Lv.${rankLevel(d, 5)}` : `威力 ×${d.power.join(' / ×')}（4 级需 Lv.${rankLevel(d, 4)}，5 级需 Lv.${rankLevel(d, 5)}）`, 14, COLORS.dim).setOrigin(0.5));
    const lb = button(this, 920, 190, 190, 50, rank ? '升级 (+1 点)' : '学习 (1 点)', () => {
      if (learn(s, d.id)) {
        sfx('levelup', { volume: 0.5 });
        void game.persist();
        this.render();
        void this.demo();
      }
    }, { size: 19, color: 0x2f7a4d });
    lb.setEnabled(canLearn(s, d.id));
    L.add(lb);
    const inBar = s.skills.bar.includes(d.id);
    const eb = button(this, 1134, 190, 190, 50, inBar ? '从技能栏卸下' : '装到技能栏', () => {
      toggleBar(s, d.id);
      void game.persist();
      this.render();
    }, { size: 19, color: 0x3b62d9 });
    eb.setEnabled(!d.passive && rank > 0 && (inBar ? s.skills.bar.length > 1 : s.skills.bar.length < slots));
    L.add(eb);
    if (s.level < rankLevel(d, rank + 1) && rank < MAX_RANK) L.add(text(this, 1027, 228, `达到 Lv.${rankLevel(d, rank + 1)} 后才能${rank ? '升级' : '学习'}`, 16, '#ff9a9a').setOrigin(0.5));

    // 技能栏
    L.add(text(this, 810, 260, `战斗技能栏（${s.skills.bar.length}/${slots} 格，升级会开放更多格）：按 ${BAR_KEYS.slice(0, slots).join('/')} 或点击`, 15, COLORS.dim, { wordWrap: { width: 440 } }));
    BAR_KEYS.forEach((key, i) => {
      const id = s.skills.bar[i];
      const x = 834 + i * 64, y = 320;
      const open = i < slots;
      const g = this.add.graphics();
      g.fillStyle(id ? skillDef(id).color : 0x2a2f52, id ? 0.9 : open ? 0.5 : 0.25).fillCircle(x, y, 26).lineStyle(3, open ? 0x2b2a4a : 0x4a5080, 1).strokeCircle(x, y, 26);
      L.add(g);
      if (open) {
        L.add(text(this, x, y, id ? skillDef(id).glyph : '', 22, '#1b1030', { fontStyle: 'bold' }).setOrigin(0.5));
        L.add(text(this, x + 19, y + 19, key, 13, '#ffffff', { stroke: '#000', strokeThickness: 3 }).setOrigin(0.5));
      } else {
        L.add(text(this, x, y - 6, '🔒', 16).setOrigin(0.5));
        L.add(text(this, x, y + 12, `Lv.${BAR_LEVELS[i]}`, 12, '#8f96c2').setOrigin(0.5));
      }
    });

    // 试放区：木头假人
    const ground = 600;
    const dummy = this.add.image(1150, ground, 'mob_golem').setOrigin(0.5, 1).setScale(0.75);
    L.add(dummy);
    this.dummy = dummy;
    const hero = makeHero(this, 900, ground, s, 0.42).idle();
    L.add(hero);
    this.hero = hero;
    if (!d.passive) L.add(button(this, 1027, 636, 220, 40, rank > 0 ? '▶ 试放这个技能' : '▶ 抢先体验（未解锁）', () => void this.demo(), { size: 17, color: 0x8a5a12 }));
    else L.add(text(this, 1027, 636, '被动技能：学会后自动生效', 16, '#ffd38a').setOrigin(0.5));
  }

  private dummy?: Phaser.GameObjects.Image;
  private hero?: ReturnType<typeof makeHero>;

  private async demo() {
    if (this.demoBusy || !this.dummy || !this.hero) return;
    const d = skillDef(this.selected);
    const rank = Math.max(1, game.s.skills.ranks[d.id] ?? 0);
    this.demoBusy = true;
    const dm = this.dummy;
    const to = { x: dm.x, y: dm.y - dm.displayHeight * 0.55 };
    if (classOf(game.s).attack === 'swing') await this.hero.swing(0, 90);
    else await this.hero.aim(90);
    await castSkill(this, this.fx, d, rank, { x: this.hero.x, y: 600 }, to, (i, last) => {
      if (!dm.active) return;
      this.fx.flash(dm);
      this.fx.number(to.x, to.y - 40, Math.round(30 * d.power[rank - 1] * (last ? 2 : 1)), { crit: last, stack: i % 4 });
      this.fx.hit();
      weaponHit(this, this.fx, weaponStyle(equippedItems(game.s).find((it) => it.slot === 'weapon')), to.x, to.y, last);
      this.tweens.add({ targets: dm, x: dm.x + (last ? 16 : 5), duration: 80, yoyo: true });
      if (last) this.fx.shake(5, 120);
    }, dm);
    this.hero.recover(150);
    this.demoBusy = false;
    if (!(game.s.skills.ranks[d.id] ?? 0)) toast(this, game.s.level < d.level ? `升到 Lv.${d.level} 就能学会「${d.name}」！` : `花 1 个技能点就能学会「${d.name}」！`, '#ffe14a');
  }
}
