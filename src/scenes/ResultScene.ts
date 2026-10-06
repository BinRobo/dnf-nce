import { need } from '../assets';
import Phaser from 'phaser';
import { expToNext } from '../config';
import { itemIcon } from '../gfx/icons';
import { backdrop } from '../gfx/textures';
import { makeHero } from '../gfx/hero';
import { makeSkillTextures } from '../battle/skills';
import { barSize, skillTree } from '../battle/skilldata';
import { BALANCE } from '../config';
import { RARITY } from '../systems/items';
import { ACHIEVEMENTS, matName, type RunResult } from '../systems/session';
import type { MatKey } from '../systems/costumes';
import { buildAbyssBattle, buildBattle } from '../battle/plan';
import { music, sfx } from '../audio/sound';
import { timeLeftMs } from '../save/schema';
import { game } from '../state';
import { bar, button, COLORS, EN_FONT, panel, text, toast } from '../ui/widgets';

const RANK_COLOR: Record<string, string> = { SSS: '#ffb020', SS: '#ff6bc8', S: '#b46bff', A: '#5aa9ff', B: '#cfd3dc', C: '#8f96c2' };

export class ResultScene extends Phaser.Scene {
  private r!: RunResult;
  private plan!: { id: string; title: string; isAbyss: boolean };

  constructor() {
    super('Result');
  }

  init(data: { result: RunResult; plan: { id: string; title: string; isAbyss: boolean } }) {
    this.r = data.result;
    this.plan = data.plan;
  }

  preload() {
    need(this, { heroes: [game.s], icons: 'all', sfx: 'battle' });
  }

  create() {
    const r = this.r;
    const s = game.s;
    const { width } = this.scale;
    music(null);
    sfx(r.cleared ? 'levelup' : 'ui_wrong', { volume: 0.5 });
    backdrop(this, this.plan.isAbyss ? 'abyss' : 'dungeon', 600);
    panel(this, 140, 30, width - 280, 560);
    text(this, width / 2, 70, r.cleared ? `${this.plan.title} · 通关` : '这次差一点！休息一下再来吧', 30).setOrigin(0.5);

    // 评级大字砸下来
    const rank = text(this, 330, 230, r.rank, 150, RANK_COLOR[r.rank], {
      fontFamily: EN_FONT, fontStyle: 'bold italic', stroke: '#000', strokeThickness: 10,
    }).setOrigin(0.5);
    this.tweens.add({ targets: rank, scale: { from: 3, to: 1 }, alpha: { from: 0, to: 1 }, duration: 450, ease: 'Back.out', onComplete: () => this.cameras.main.shake(150, 0.01) });
    text(this, 330, 330, `正确率 ${Math.round(r.accuracy * 100)}%   最高连击 ${r.bestCombo}`, 20, COLORS.dim).setOrigin(0.5);

    const lines = [
      `经验 +${r.exp}${r.firstClear ? '（含首通奖励）' : ''}`,
      `金币 +${r.gold}`,
      [r.stones ? `强化石 +${r.stones}` : '', ...Object.entries(r.mats ?? {}).map(([k, n]) => `${matName(k as MatKey)} +${n}`), r.shards ? `史诗碎片 +${r.shards}（${s.mats.shard}/10）` : '', r.souls ? `Boss之魂 +${r.souls}` : ''].filter(Boolean).join('  '),
    ].filter(Boolean);
    if (r.shards) this.time.delayedCall(1100, () => sfx('shard', { volume: 0.6 }));
    lines.forEach((l, i) => {
      const t = text(this, 560, 140 + i * 40, l, i === 2 ? 18 : 26, i === 2 ? '#ffd38a' : undefined, i === 2 ? { wordWrap: { width: 700 } } : {}).setAlpha(0);
      this.tweens.add({ targets: t, alpha: 1, x: 540, delay: 500 + i * 200, duration: 250 });
    });

    text(this, 540, 270, `Lv.${s.level}`, 24);
    const need = expToNext(s.level);
    const xb = bar(this, 640, 276, 420, 16, 0, 0x4aa8ff);
    this.tweens.addCounter({ from: 0, to: s.exp / need, delay: 800, duration: 700, onUpdate: (tw) => xb.draw(tw.getValue() ?? 0) });
    if (r.levelUps > 0) {
      const lu = text(this, 850, 230, `LEVEL UP!  Lv.${s.level}`, 36, '#ffe14a', { fontFamily: EN_FONT, fontStyle: 'bold', stroke: '#000', strokeThickness: 6 }).setOrigin(0.5).setAlpha(0);
      this.tweens.add({ targets: lu, alpha: 1, scale: { from: 2, to: 1 }, delay: 1500, duration: 400, ease: 'Back.out' });
      this.time.delayedCall(3200, () => this.levelUpCeremony(s.level - r.levelUps, s.level));
    }

    // 掉落：卡片翻开
    r.loot.forEach((it, i) => {
      const x = 560 + i * 280 + 120;
      const y = 420;
      const info = RARITY[it.rarity];
      const card = this.add.container(x, y).setScale(0, 1);
      const bg = this.add.rectangle(0, 0, 250, 140, 0x0e1122).setStrokeStyle(4, info.color);
      card.add([
        bg,
        itemIcon(this, -78, 0, it, 80),
        text(this, 36, -42, `【${info.name}】`, 18, info.css).setOrigin(0.5),
        text(this, 36, -8, it.name.replace('史诗·', ''), it.name.length > 8 ? 15 : 20, info.css, { fontStyle: 'bold', align: 'center', wordWrap: { width: 130 } }).setOrigin(0.5),
        text(this, 36, 36, [it.atk && `攻击+${it.atk}`, it.hp && `生命+${it.hp}`, it.crit && `暴击+${Math.round(it.crit * 100)}%`].filter(Boolean).join(' '), 15).setOrigin(0.5),
      ]);
      this.tweens.add({
        targets: card, scaleX: 1, delay: 1900 + i * 500, duration: 300, ease: 'Back.out',
        onStart: () => {
          sfx(it.rarity === 'epic' ? 'loot_epic' : 'loot', { volume: 0.6 });
          if (it.rarity === 'epic' || it.rarity === 'legendary') {
            const beam = this.add.rectangle(x, 0, 120, 1200, info.color, 0.35).setOrigin(0.5, 0).setBlendMode('ADD');
            this.tweens.add({ targets: beam, alpha: 0, scaleX: 0.2, duration: 1500, onComplete: () => beam.destroy() });
            this.cameras.main.flash(300, 255, 200, 80);
            if (it.rarity === 'epic') toast(this, `🎉 ${s.name} 获得了史诗装备【${it.name}】！`, info.css);
          }
        },
      });
    });
    if (!r.loot.length) text(this, 680, 420, r.cleared ? '' : '通关后才有装备掉落哦', 20, COLORS.dim).setOrigin(0.5);

    r.newAchievements.forEach((id, i) => {
      this.time.delayedCall(2600 + i * 900, () => toast(this, `🏆 达成成就「${ACHIEVEMENTS[id].name}」`, '#ffc94a'));
    });

    button(this, width / 2 - 160, 650, 260, 60, '回到城镇', () => this.scene.start('Town', { from: 'battle' }));
    button(this, width / 2 + 160, 650, 260, 60, '再来一次', () => this.again(), { color: 0x3b62d9 });
  }

  /** 升级仪式：光柱 + 等级大字 + 属性提升 + 新技能解锁卡 */
  private levelUpCeremony(from: number, to: number) {
    makeSkillTextures(this);
    const c = this.add.container(0, 0).setDepth(300);
    const dim = this.add.rectangle(0, 0, 1280, 720, 0x0b0d17, 0.8).setOrigin(0).setInteractive();
    c.add(dim);
    sfx('levelup');
    const hero = makeHero(this, 640, 520, game.s, 0.75);
    hero.cheer();
    const pillar = this.add.image(640, 0, 'fx_pillar').setOrigin(0.5, 0).setBlendMode('ADD').setTint(0xffd34a).setScale(2.2, 0);
    c.add([pillar, hero]);
    this.tweens.add({ targets: pillar, scaleY: 1, duration: 400, ease: 'Quad.out' });
    const em = this.add.particles(640, 520, 'fx_star', { speed: { min: 150, max: 420 }, angle: { min: 200, max: 340 }, scale: { start: 0.8, end: 0 }, lifespan: 1000, tint: [0xffe14a, 0xffffff], blendMode: 'ADD', emitting: false });
    c.add(em);
    em.explode(60);
    const big = text(this, 640, 120, `LEVEL UP!  Lv.${from} → Lv.${to}`, 54, '#ffe14a', { fontFamily: EN_FONT, fontStyle: 'bold', stroke: '#7a3b00', strokeThickness: 10 }).setOrigin(0.5).setScale(0.3);
    c.add(big);
    this.tweens.add({ targets: big, scale: 1, duration: 400, ease: 'Back.out' });
    const gain = (to - from) * BALANCE.atkPerLevel;
    c.add(text(this, 640, 190, `⚔ 攻击力 +${gain}    ✦ 技能点 +${to - from}（回城到训练场学习技能）`, 26, '#ffffff', { stroke: '#000', strokeThickness: 5 }).setOrigin(0.5));
    const skills = skillTree(game.s).filter((k) => k.level > from && k.level <= to);
    const extras: string[] = [];
    const slotGain = barSize(to) - barSize(from);
    if (slotGain > 0) extras.push(`技能栏 +${slotGain} 格（现在 ${barSize(to)} 格）`);
    if (from < 5 && to >= 5) extras.push('获得蓝色光环');
    if (from < 10 && to >= 10) extras.push('获得金色光环 · 可以转职');
    skills.forEach((sk, i) => {
      const y = 260 + i * 90;
      const card = this.add.container(1000, y).setScale(0);
      const g = this.add.graphics();
      g.fillStyle(0x1b1e33, 0.95).fillRoundedRect(-200, -38, 400, 76, 12).lineStyle(3, sk.color, 1).strokeRoundedRect(-200, -38, 400, 76, 12);
      card.add([g, text(this, -180, -16, `新技能可学习：${sk.name}`, 22, '#ffe14a', { fontStyle: 'bold' }), text(this, -180, 14, sk.desc, 17, '#cfd6ff')]);
      c.add(card);
      this.tweens.add({ targets: card, scale: 1, delay: 500 + i * 250, duration: 300, ease: 'Back.out' });
    });
    extras.forEach((t, i) => c.add(text(this, 280, 280 + i * 40, `✨ ${t}`, 22, '#9fe3ff', { stroke: '#000', strokeThickness: 4 }).setOrigin(0.5)));
    c.add(button(this, 640, 650, 240, 56, '太棒了！', () => c.destroy(), { color: 0x3b62d9 }));
  }

  private again() {
    const s = game.s;
    if (timeLeftMs(s) <= 0) return toast(this, '今天的冒险时间到啦，明天见！', '#ffd27a');
    const plan = this.plan.isAbyss ? buildAbyssBattle(s, game.index) : buildBattle(game.index.lesson(this.plan.id)!, s, game.index);
    if (!plan.rooms.length) return toast(this, '深渊里暂时没有需要复习的内容了', '#ffd27a');
    this.scene.start('Battle', { plan });
  }
}
