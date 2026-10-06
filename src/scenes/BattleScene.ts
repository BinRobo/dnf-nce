import { need } from '../assets';
import Phaser from 'phaser';
import { speak, stop } from '../audio/speech';
import { duck, music, sfx } from '../audio/sound';
import { BattleController, fluentMs, type Outcome } from '../battle/controller';
import { Fx, tween, wait } from '../battle/fx';
import { bossBannerInfo, bossDef, MOB_SFX, qtype, type BattlePlan, type Enemy, type Room } from '../battle/plan';
import { boom, castSkill, makeSkillTextures, slashAnim } from '../battle/skills';
import { BAR_KEYS, barSize, baseSkill, skillDef } from '../battle/skilldata';
import { classOf } from '../systems/classes';
import { isTouch } from '../ui/device';
import { fullSet } from '../systems/costumes';
import { makeHero } from '../gfx/hero';
import { weaponHit, weaponStyle, type WeaponStyle } from '../battle/weaponfx';
import { equippedItems } from '../systems/player';
import { loadStory } from '../story/runner';
import { QuizPanel, spk } from '../battle/quiz';
import { KID_HEADS, Puppet } from '../gfx/puppet';
import { emptyDayLog, today } from '../save/schema';
import { playerStats } from '../systems/player';
import type { Question } from '../systems/questions';
import { finishRun } from '../systems/session';
import { game } from '../state';
import { StoryRunner } from '../story/runner';
import { confirmBox } from '../ui/modal';
import { playVideo } from '../ui/video';
import { button, COLORS, EN_FONT, text } from '../ui/widgets';
import { layeredBg, mobTex } from './BootScene';

const GROUND = 456;
const HERO_X = 250;

interface EnemyView {
  e: Enemy;
  img: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Ellipse;
  tag?: Phaser.GameObjects.Text;
  air: number; // 当前浮空高度
  scale: number;
}

const ROOM_NAME: Record<Room['type'], string> = {
  battle: '战斗', elite: '精英', story: '委托人', chest: '宝箱', review: '复习', boss: 'BOSS',
};

export class BattleScene extends Phaser.Scene {
  private plan!: BattlePlan;
  private ctl!: BattleController;
  private fx!: Fx;
  private quiz!: QuizPanel;
  private hero!: Puppet;
  private wstyle!: WeaponStyle;
  /** 职业基础技能 id、是否远程职业（神枪手 / 魔法师不冲过去，原地射击 / 施法） */
  private base = 'slash';
  private ranged = false;
  private partner?: Puppet;
  private views = new Map<string, EnemyView>();
  private bg: Phaser.GameObjects.Image[] = [];
  private hud!: Phaser.GameObjects.Container;
  private bossBar?: Phaser.GameObjects.Container;
  private miniMap!: Phaser.GameObjects.Container;
  private alive = true;
  private startedAt = 0;
  private classmates: Puppet[] = [];
  private pardonUsed = 0;
  private young = true;
  private bagUsed = { heart: 0, shield: 0, hint: 0 };

  constructor() {
    super('Battle');
  }

  /** 只加载这场战斗要用的：主角、伙伴、本场怪物、背景、特效、战斗音效 */
  preload() {
    const kinds = new Set(this.plan.rooms.flatMap((r) => r.enemies.map((e) => (e.kind === 'boss_generic' ? 'boss_pardon' : e.kind))));
    need(this, {
      heroes: [game.s], chars: ['sophie', 'kid'], heads: [...KID_HEADS], mobs: [...kinds],
      bgs: [this.plan.lesson?.id === 'L005-006' ? 'classroom' : 'street', 'boss'], props: ['handbag', 'book'], fx: true, sfx: 'battle',
    });
  }

  init(data: { plan: BattlePlan }) {
    this.plan = data.plan;
    this.views = new Map();
    this.alive = true;
    this.classmates = [];
    this.pardonUsed = 0;
  }

  create() {
    const s = game.s;
    const st = playerStats(s);
    this.young = s.settings.grade === 'low';
    // 商店道具：进副本时自动使用
    const bag = { ...s.bag };
    s.bag = { heart: 0, shield: 0, hint: 0 };
    this.ctl = new BattleController(this.plan, {
      atk: st.atk, crit: st.crit, critMult: st.critMult, hearts: st.hearts + bag.heart, shield: st.shield + bag.shield,
      hints: st.hints + bag.hint, youngMode: this.young,
    }, game.index);
    this.bagUsed = bag;
    this.charge = {};
    for (const id of s.skills.bar) this.charge[id] = Math.floor(skillDef(id).cd / 2);
    this.queued = null;
    this.fx = new Fx(this, s.settings.reduceFx);
    makeSkillTextures(this);
    const spellMode = s.settings.spellMode === 'auto' ? (this.young || isTouch ? 'tiles' : 'keyboard') : s.settings.spellMode;
    this.quiz = new QuizPanel(this, { spellMode, young: this.young });
    this.startedAt = Date.now();

    this.setBg(this.plan.lesson?.id === 'L005-006' ? 'classroom' : 'street');
    this.hero = makeHero(this, HERO_X, GROUND, s).setDepth(20).idle();
    this.wstyle = weaponStyle(equippedItems(s).find((i) => i.slot === 'weapon'));
    this.base = baseSkill(s);
    // 穿齐整套装扮：进场特效
    const set = fullSet(s);
    if (set) {
      this.time.delayedCall(300, () => {
        const ring = this.add.circle(HERO_X, GROUND - 60, 30).setStrokeStyle(8, set.color).setDepth(19).setBlendMode('ADD');
        this.tweens.add({ targets: ring, scale: 5, alpha: 0, duration: 600, onComplete: () => ring.destroy() });
        this.fx.burst(HERO_X, GROUND - 80, 24, set.color);
        this.fx.label(HERO_X, GROUND - 230, `【${set.title}】登场！`, `#${set.color.toString(16).padStart(6, '0')}`, 26);
        sfx('equip_epic', { volume: 0.5 });
      });
    }
    this.ranged = classOf(s).attack !== 'swing';
    this.shadowAt(this.hero, 60);
    if (s.partners.includes('sophie')) {
      this.partner = new Puppet(this, 110, GROUND - 6, 'sophie', 0.42).setDepth(18).idle();
    }
    this.hud = this.add.container(0, 0).setDepth(90);
    this.miniMap = this.add.container(0, 0).setDepth(90);
    button(this, 1210, 30, 100, 40, '撤退', () => confirmBox(this, '现在撤退会失去本次评级，确定吗？', () => this.finish(false)), { size: 18, color: 0x444a6b }).setDepth(95);

    this.events.once('shutdown', () => {
      this.alive = false;
      stop();
      this.quiz.clear();
      this.fx.destroy();
      duck(false);
    });
    this.drawSkillBar();
    void this.run();
  }

  // ---------------- 主流程 ----------------

  private async run() {
    const s = game.s;
    music('dungeon');
    if (this.plan.story?.intro && !s.story.seen.includes(this.plan.story.intro)) {
      await StoryRunner.play(this, this.plan.story.intro);
    }
    const b = this.bagUsed;
    if (b.heart + b.shield + b.hint) {
      this.fx.label(640, 150, `使用道具：${b.heart ? `❤+${b.heart} ` : ''}${b.shield ? `🛡+${b.shield} ` : ''}${b.hint ? `💡+${b.hint}` : ''}`, '#7dffa5', 26);
    }
    let room: Room | undefined = this.plan.rooms[0];
    let first = true;
    while (room && this.alive) {
      if (first && !s.story.seen.includes('tut_start')) {
        first = false;
        this.pendingTut = 'tut_start';
      }
      const cleared = await this.playRoom(room);
      if (!cleared || !this.alive) return;
      if (room.type === 'boss') return this.bossDefeated();
      room = await this.chooseExit();
    }
  }

  private setBg(name: string) {
    for (const b of this.bg) b.destroy();
    this.bg = layeredBg(this, name) ?? [];
  }

  private shadowAt(target: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject, w: number) {
    const sh = this.add.ellipse((target as unknown as { x: number }).x, GROUND + 4, w, 14, 0x000000, 0.22).setDepth(5);
    this.events.on('update', () => sh.setX((target as unknown as { x: number }).x));
    return sh;
  }

  private pendingTut: string | null = null;
  /** 技能栏：各技能已充能（答对题数）与已选中待释放的技能 */
  private charge: Record<string, number> = {};
  private queued: string | null = null;
  private skillBar?: Phaser.GameObjects.Container;
  private skillKeys?: (e: KeyboardEvent) => void;

  private ready(id: string) {
    return (this.charge[id] ?? 0) >= skillDef(id).cd;
  }

  private queue(id: string) {
    if (!this.ready(id) || id === this.base) return;
    this.queued = this.queued === id ? null : id;
    sfx('ui_click');
    this.drawSkillBar();
  }

  /** 题目面板上方的技能栏（Q/W/E/R 或点击选择，下一次答对时释放） */
  private drawSkillBar() {
    this.skillBar?.destroy();
    const bar = game.s.skills.bar.slice(0, barSize(game.s.level));
    const c = (this.skillBar = this.add.container(0, 0).setDepth(72));
    const keys = BAR_KEYS;
    bar.forEach((id, i) => {
      const d = skillDef(id);
      const x = 52 + i * 72, y = 428;
      const ready = this.ready(id);
      const sel = this.queued === id;
      const g = this.add.graphics();
      g.fillStyle(0x0b0d17, 0.75).fillCircle(x, y, 32);
      g.fillStyle(d.color, ready ? 0.9 : 0.25).fillCircle(x, y, 27);
      if (!ready && d.cd > 0) {
        const p = (this.charge[id] ?? 0) / d.cd;
        g.lineStyle(5, 0xffffff, 0.9).beginPath().arc(x, y, 30, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2).strokePath();
      }
      g.lineStyle(sel ? 5 : 2, sel ? 0xffe14a : 0x2b2a4a, 1).strokeCircle(x, y, 32);
      c.add(g);
      c.add(text(this, x, y, d.glyph, 26, ready ? '#1b1030' : '#6d7399', { fontStyle: 'bold' }).setOrigin(0.5));
      c.add(text(this, x + 22, y + 20, keys[i], 13, '#ffffff', { stroke: '#000', strokeThickness: 3, fontStyle: 'bold' }).setOrigin(0.5));
      if (sel) {
        const t = text(this, x, y - 46, '待释放', 13, '#ffe14a', { stroke: '#000', strokeThickness: 3 }).setOrigin(0.5);
        c.add(t);
      }
      if (ready && id !== this.base && !sel) {
        const glow = this.add.circle(x, y, 34, d.color, 0.35).setBlendMode('ADD');
        c.addAt(glow, 0);
        this.tweens.add({ targets: glow, scale: 1.25, alpha: 0, duration: 700, repeat: -1 });
      }
      const hit = this.add.circle(x, y, 32, 0, 0).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => this.queue(id));
      c.add(hit);
    });
    if (!this.skillKeys) {
      this.skillKeys = (e: KeyboardEvent) => {
        // 拼写题用键盘打字时，字母键不触发技能（可以点击技能图标）
        if (this.ctl.current?.question.kind === 'spell') return;
        const i = keys.indexOf(e.key.toUpperCase());
        const id = game.s.skills.bar.slice(0, barSize(game.s.level))[i];
        if (i >= 0 && id) this.queue(id);
      };
      window.addEventListener('keydown', this.skillKeys);
      this.events.once('shutdown', () => window.removeEventListener('keydown', this.skillKeys!));
    }
  }

  /** 只在第一次遇到时播放的教学/剧情片段 */
  private async once(id: string) {
    if (game.s.story.seen.includes(id) || !this.alive) return;
    if (!(await loadStory(id))) return;
    duck(true);
    await StoryRunner.play(this, id);
    duck(false);
  }

  private lessonTag() {
    return this.plan.lesson ? `L${String(this.plan.lesson.lessons[0]).padStart(3, '0')}` : '';
  }

  private async playRoom(room: Room): Promise<boolean> {
    this.ctl.enter(room.id);
    this.drawMiniMap();
    this.drawHud();
    if (room.type === 'boss') {
      this.setBg('boss');
      if (this.plan.showVideo && this.plan.video) {
        music(null);
        await new Promise<void>((r) => playVideo(this.plan.video!, `课文动画 · ${this.plan.title}`, r));
      }
    }
    // 角色入场
    this.hero.setX(-80).run();
    await tween(this, { targets: this.hero, x: HERO_X, duration: 600, ease: 'Quad.out' });
    this.hero.idle();
    this.spawnEnemies(room);
    if (room.type === 'boss') {
      music('boss');
      sfx('boss_appear');
      this.fx.shake(6, 400);
      await this.bossBanner(this.ctl.queue[0]);
      this.drawBossBar();
      if (this.plan.story?.boss) await StoryRunner.play(this, this.plan.story.boss);
    } else if (room.type === 'story') {
      const id = `room_${this.lessonTag()}`;
      if (await loadStory(id)) await StoryRunner.play(this, id);
      else this.fx.label(640, 170, '委托人被雾困住了，帮 Ta 说出这句话！', '#ffffff', 28);
    } else {
      this.fx.label(640, 170, `${ROOM_NAME[room.type]}房`, '#ffffff', 34);
    }
    if (this.pendingTut) {
      const t = this.pendingTut;
      this.pendingTut = null;
      await this.once(t);
    }
    await wait(this, 500);

    while (this.alive) {
      const cur = this.ctl.current;
      if (!cur) break;
      const out = await this.askAndResolve(cur.enemy, cur.question);
      if (!this.alive) return false;
      if (out.runOver) {
        await this.finish(false);
        return false;
      }
    }
    if (!this.alive) return false;
    sfx('door');
    if (room.type === 'chest') {
      game.s.gold += 50;
      game.s.stones += 1;
      this.fx.label(640, 220, '宝箱：金币 +50 · 强化石 +1', '#ffe14a', 30);
    } else if (room.type !== 'boss') {
      this.fx.label(640, 220, '清理完毕', '#ffe14a', 46);
    }
    await wait(this, 700);
    return true;
  }

  private spawnEnemies(room: Room) {
    this.views.clear();
    room.enemies.forEach((e, i) => {
      const tex = mobTex(this, e.kind === 'boss_generic' ? 'boss_pardon' : e.kind);
      const img = this.add.image(1400, GROUND + 4, tex).setOrigin(0.5, 1).setDepth(15 - i);
      const target = e.kind === 'boss_whomist' ? 350 : e.tier === 'boss' ? 300 : e.tier === 'elite' ? 180 : 120;
      const scale = target / Math.max(img.height, 1);
      img.setScale(scale);
      const shadow = this.add.ellipse(1400, GROUND + 4, img.displayWidth * 0.7, 16, 0x000000, 0.22).setDepth(4);
      const v: EnemyView = { e, img, shadow, air: 0, scale };
      if (e.tier !== 'boss') {
        const color = e.revenge ? '#e2c6ff' : e.tier === 'elite' ? '#ffb020' : '#ffffff';
        v.tag = text(this, 0, 0, `Lv.${e.level} ${e.name}${e.revenge ? '（复习）' : ''}`, e.tier === 'elite' ? 17 : 14, color, {
          stroke: '#1b1030', strokeThickness: 4, fontStyle: e.tier === 'elite' ? 'bold' : 'normal',
        }).setOrigin(0.5).setDepth(16).setAlpha(0);
      }
      this.views.set(e.uid, v);
      this.tweens.add({ targets: img, scaleY: scale * 1.05, duration: 600 + i * 70, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    });
    this.layoutEnemies(true);
  }

  private layoutEnemies(entering = false) {
    this.ctl.queue.forEach((e, i) => {
      const v = this.views.get(e.uid);
      if (!v) return;
      const x = e.tier === 'boss' ? 1010 : 720 + i * 125;
      const vis = i < 5 ? 1 : 0;
      this.tweens.add({ targets: [v.img], x, alpha: vis, duration: entering ? 500 + i * 90 : 280, ease: 'Quad.out' });
      this.tweens.add({ targets: v.shadow, x, alpha: vis * 0.22, duration: entering ? 500 + i * 90 : 280 });
      if (v.tag) this.tweens.add({ targets: v.tag, x, y: GROUND - v.img.displayHeight - 14, alpha: vis, duration: 300 });
    });
  }

  /** 怪物音效：mob_<种类>_<hurt|attack|die>，Boss 统一用 mob_boss_* */
  private mobSfx(e: Enemy, kind: 'hurt' | 'attack' | 'die', volume = 0.7) {
    const base = e.tier === 'boss' ? 'boss' : MOB_SFX[e.kind] ?? e.kind;
    sfx(`mob_${base}_${kind}`, { volume, detune: (Math.random() - 0.5) * 200 }, kind === 'die' ? 'enemy_pop' : kind === 'attack' ? 'swing1' : 'hit_light');
  }

  private viewOf(e: Enemy) {
    return this.views.get(e.uid)!;
  }

  // ---------------- 一道题 ----------------

  private async askAndResolve(enemy: Enemy, q: Question & { boss?: { muffled?: boolean; rescue?: string; finale?: boolean } }): Promise<Outcome> {
    const v = this.viewOf(enemy);
    const spell = q.kind === 'spell';
    if (spell) await this.once('tut_spell');
    // 拼写：主角先冲到怪面前，每个字母一刀
    if (spell) await this.dashTo(v);
    this.ctl.markShown(performance.now());
    duck(true);
    const t0 = performance.now();
    const res = await new Promise<{ correct: boolean; clean: boolean }>((resolve) => {
      this.quiz.show(q, {
        hintsLeft: this.ctl.hintsLeft,
        onHint: () => {
          const ok = this.ctl.useHint();
          if (ok) this.drawHud();
          return ok;
        },
        muffled: !!q.boss?.muffled,
        onPardon: () => this.onPardon(),
        onLetter: spell ? (ok, done, total) => this.letterHit(v, ok, done, total) : undefined,
        onAnswer: (correct, clean) => resolve({ correct, clean }),
      });
    });
    const ms = performance.now() - t0;
    duck(false);
    await wait(this, res.correct ? 250 : 400);
    if (!this.alive) throw new Error('scene gone');
    await this.quiz.hide();

    const o = this.ctl.answer({ correct: res.correct, clean: res.clean, ms, hintUsed: this.quiz.hintUsed });
    const log = this.ctl.logs.get(q.itemId);
    if (log && log.type === undefined) {
      log.type = qtype(q);
      log.fluent = log.firstTry && ms <= fluentMs(q, this.young);
    }
    if (res.correct && spell) game.s.daily.spelled++;
    if (o.enemyDefeated && enemy.revenge) game.s.daily.revenge++;

    if (o.grade === 'miss') {
      if (spell) await this.returnHome();
      await this.quiz.explain(q);
      await this.enemyAttack(o);
      await this.once('tut_wrong');
      this.layoutEnemies();
      this.drawHud();
      return o;
    }
    await this.perform(o, q, v, spell);
    for (const id of game.s.skills.bar) this.charge[id] = Math.min(skillDef(id).cd, (this.charge[id] ?? 0) + 1);
    this.drawSkillBar();
    if (o.bossPhase) await this.bossPhase(o.bossPhase);
    if (o.gaugeFull) {
      sfx('gauge_full');
      this.fx.label(640, 240, '觉醒槽满了！下一道连词成句释放觉醒技', '#ffb020', 26);
      await this.once('tut_awaken');
    }
    if (o.enemyAttack !== 'none') await this.enemyAttack(o);
    this.drawHud();
    this.drawBossBar();
    return o;
  }

  private async dashTo(v: EnemyView) {
    const gap = v.e.tier === 'boss' ? 210 : 120;
    this.hero.run();
    this.fx.dustAt(this.hero.x, GROUND, 3);
    sfx('step', { volume: 0.4 });
    await tween(this, { targets: this.hero, x: v.img.x - gap, duration: 150, ease: 'Quad.in' });
    this.hero.idle();
  }

  private async returnHome() {
    this.hero.run();
    await tween(this, { targets: this.hero, x: HERO_X, duration: 260, ease: 'Quad.out' });
    this.hero.idle();
  }

  /**
   * 远程普通攻击：神枪手射出字母子弹、魔法师放出魔法弹，飞到敌人身上时 resolve。
   */
  private async rangedShot(v: EnemyView, last: boolean, ms = 180) {
    const gun = classOf(game.s).attack === 'shoot';
    const from = { x: this.hero.x + 70, y: GROUND - 118 };
    const to = { x: v.img.x - 10 + (Math.random() - 0.5) * 20, y: v.img.y - v.img.displayHeight * 0.55 + (Math.random() - 0.5) * 30 };
    await this.hero.aim(70);
    sfx(gun ? 'gun_shot' : 'mage_bolt', { volume: 0.5, detune: (Math.random() - 0.5) * 200 }, 'swing1');
    const color = this.wstyle.tier > 0 ? this.wstyle.color : gun ? 0xffe14a : 0x9fe3ff;
    const p = gun
      ? this.add.text(from.x, from.y, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)], { fontFamily: 'Arial Black, Arial', fontSize: last ? '40px' : '28px', fontStyle: 'bold', color: `#${color.toString(16).padStart(6, '0')}`, stroke: '#2b2a4a', strokeThickness: 6 }).setOrigin(0.5)
      : this.add.image(from.x, from.y, this.textures.exists('p_magic_1') ? 'p_magic_1' : 'fx_dot').setTint(color).setScale(last ? 0.5 : 0.32).setBlendMode('ADD');
    p.setDepth(58);
    const flash = this.add.circle(from.x, from.y, 14, 0xfff1a8, 0.9).setDepth(58).setBlendMode('ADD');
    this.tweens.add({ targets: flash, scale: 2, alpha: 0, duration: 120, onComplete: () => flash.destroy() });
    await tween(this, { targets: p, x: to.x, y: to.y, angle: gun ? 0 : 360, duration: ms, ease: 'Quad.in' });
    p.destroy();
  }

  /** 拼写时每个字母：对 = 一刀轻击（音调逐个升高），错 = 空挥 */
  private letterHit(v: EnemyView, ok: boolean, done: number, total: number) {
    if (!ok) {
      sfx('letter_miss', { volume: 0.5 });
      void (this.ranged ? this.hero.aim(70) : this.hero.swing(done % 3, 70)).then(() => this.hero.recover(120));
      return;
    }
    sfx('letter_ok', { detune: Math.min(700, done * 100) });
    void (this.ranged ? this.rangedShot(v, false, 140) : this.hero.swing(done % 3, 60)).then(() => {
      this.impact(v, Math.round(this.ctl.kit.atk * 0.6), { heavy: false, crit: false, stack: done % 4, gold: done === total });
      this.hero.recover(100);
    });
  }

  // ---------------- 战斗演出 ----------------

  private async perform(o: Outcome, q: Question & { boss?: { rescue?: string; finale?: boolean } }, v: EnemyView, spellDone: boolean) {
    const tier = o.grade;
    const launchAt = tier === 'hit' ? -1 : 1;
    if (o.awaken) await this.awakenCutIn(q, v);
    if (q.boss?.rescue) await this.rescueClassmate(q.boss.rescue, v);

    if (!spellDone && !this.ranged) await this.dashTo(v);
    // 拼写题：字母已逐个命中，这里只打终结技
    const segs = spellDone ? o.segments.slice(-1) : o.segments;
    for (let i = 0; i < segs.length; i++) {
      if (!this.alive) return;
      const last = i === segs.length - 1;
      if (last && tier === 'perfect') {
        this.fx.slowmo(0.3, 350);
        this.fx.zoom(1.08, 450);
      }
      if (this.ranged) await this.rangedShot(v, last);
      else await this.hero.swing(i % 3, last ? 110 : 80);
      if (i === launchAt && !spellDone) this.launch(v);
      const hit = () => this.impact(v, segs[i], {
        heavy: last, crit: last && o.crit, stack: i, gold: tier !== 'hit', big: last && (tier === 'perfect' || o.awaken || spellDone),
      });
      if (last && tier !== 'miss') {
        // 终结一击：放出技能栏里选中的技能（没选就用单词斩）
        const id = this.queued ?? this.base;
        const def = skillDef(id);
        const rank = Math.max(1, game.s.skills.ranks[id] ?? 1);
        this.queued = null;
        if (id !== this.base) this.charge[id] = 0;
        const to = { x: v.img.x, y: v.img.y - v.img.displayHeight * 0.55 };
        const base = segs[i] * def.power[rank - 1];
        await castSkill(this, this.fx, def, rank, { x: this.hero.x, y: GROUND }, to, (k, end) => this.impact(v, Math.round(base * (end ? 0.5 : 0.25) * (0.9 + Math.random() * 0.2)), {
          heavy: end, crit: end && o.crit, stack: k % 4, gold: tier !== 'hit', big: end && (tier === 'perfect' || o.awaken), silent: true,
        }), v.img);
        void hit;
      } else {
        if (!this.ranged) slashAnim(this, v.img.x - 10, v.img.y - v.img.displayHeight * 0.55, -30 + i * 40, 0.8, tier !== 'hit' ? 0xffe14a : undefined);
        hit();
      }
      await wait(this, last ? 160 : 70);
    }
    if (q.boss?.finale && o.enemyDefeated && this.plan.bossMech === 'pardon') await this.handbagFinale(v);
    if (q.boss?.finale && o.enemyDefeated && this.plan.bossMech === 'whomist') await this.classShout();
    this.hero.recover(150);
    if (v.air > 0) await this.land(v);
    if (o.enemyDefeated) await this.defeat(v, q);
    if (!this.ranged) await this.returnHome();
    else this.hero.idle();
    this.layoutEnemies();
  }

  private impact(v: EnemyView, dmg: number, o: { heavy: boolean; crit: boolean; stack: number; gold: boolean; big?: boolean; silent?: boolean }) {
    const ex = v.img.x;
    const ey = v.img.y - v.img.displayHeight * 0.55;
    const combo = this.ctl.combo;
    if (!o.silent) {
      sfx(o.crit ? 'hit_crit' : o.heavy ? 'hit_heavy' : 'hit_light', { detune: Math.min(700, combo * 100), volume: 0.75 });
      sfx(`swing${(o.stack % 3) + 1}`, { volume: 0.35 });
    } else if (o.crit) sfx('hit_crit', { volume: 0.5 });
    this.fx.slash(ex - 10, ey, o.big ? 'big' : o.gold ? 'gold' : 'normal', -20 + o.stack * 35);
    this.fx.burst(ex, ey, o.crit ? 28 : o.heavy ? 18 : 10);
    weaponHit(this, this.fx, this.wstyle, ex, ey, o.heavy, !o.silent || o.heavy);
    if (o.heavy) this.fx.ring(ex, ey, o.crit ? 0xffb020 : 0xffffff);
    this.fx.flash(v.img);
    if (o.heavy || o.stack % 2 === 0) this.mobSfx(v.e, 'hurt', o.heavy ? 0.75 : 0.5);
    this.fx.number(ex + 20, ey - 40, dmg, { crit: o.crit, stack: o.stack });
    if (o.crit) this.fx.label(ex, ey - 120, '暴击！', '#ffb020', 32);
    this.fx.hit();
    // 击退
    const kb = v.e.tier === 'boss' ? (o.heavy ? 12 : 4) : o.heavy ? 48 : 16;
    this.tweens.add({ targets: v.img, x: v.img.x + kb, duration: 120, ease: 'Quad.out' });
    // 浮空时每次被追击再抬升
    if (v.air > 0) {
      v.air *= 1.15;
      this.tweens.add({ targets: v.img, y: GROUND + 4 - v.air, duration: 120, ease: 'Quad.out' });
    }
    this.fx.hitstop(o.crit ? 120 : o.heavy ? 80 : 50);
    if (o.heavy) this.fx.shake(o.crit ? 8 : 6, o.crit ? 160 : 120);
  }

  private launch(v: EnemyView) {
    if (v.e.tier === 'boss') return;
    sfx('launch', { volume: 0.5 });
    v.air = 90;
    this.tweens.add({ targets: v.img, y: GROUND + 4 - v.air, angle: -25, duration: 200, ease: 'Quad.out' });
  }

  private async land(v: EnemyView) {
    await tween(this, { targets: v.img, y: GROUND + 4, angle: 0, duration: 180, ease: 'Quad.in' });
    sfx('land', { volume: 0.5 });
    this.fx.dustAt(v.img.x, GROUND, 5);
    await tween(this, { targets: v.img, y: GROUND - 20, duration: 90, yoyo: true, ease: 'Quad.out' });
    v.air = 0;
  }

  /** 怪物被打散：化成这道题的单词/句子飘回去，并播一次原声（“还台词”） */
  private async defeat(v: EnemyView, q: Question) {
    if (v.e.tier === 'boss') return this.bossDeath(v);
    this.mobSfx(v.e, 'die', 0.8);
    const word = q.kind === 'spell' ? q.word : q.kind === 'order' ? q.answer.join(' ') : q.kind === 'pick' && q.mode === 'meaning' ? q.options[q.answer] : '';
    this.fx.burst(v.img.x, v.img.y - v.img.displayHeight / 2, 30, 0xd9b8ff);
    this.tweens.killTweensOf(v.img);
    this.tweens.add({ targets: v.img, scale: v.scale * 1.3, alpha: 0, duration: 220, onComplete: () => v.img.destroy() });
    this.tweens.add({ targets: v.shadow, alpha: 0, duration: 220, onComplete: () => v.shadow.destroy() });
    v.tag?.destroy();
    if (word) {
      const t = text(this, v.img.x, v.img.y - 80, word, 30, '#ffe14a', { fontFamily: EN_FONT, fontStyle: 'bold', stroke: '#2b2a4a', strokeThickness: 6 }).setOrigin(0.5).setDepth(85);
      this.tweens.add({ targets: t, y: 120, alpha: 0, duration: 1100, ease: 'Quad.in', onComplete: () => t.destroy() });
    }
    this.views.delete(v.e.uid);
    await wait(this, 250);
  }

  /** Boss 死亡演出：慢放 → 抖动闪烁 → 连环爆炸 → 碎成字母飞回台词簿 → 全屏光爆 → 击败横幅 → 掉落喷出 */
  private async bossDeath(v: EnemyView) {
    const img = v.img;
    const cx = img.x, cy = img.y - img.displayHeight * 0.5;
    this.tweens.killTweensOf(img);
    music(null);
    this.mobSfx(v.e, 'die', 1);
    this.fx.slowmo(0.35, 1400);
    this.fx.zoom(1.15, 1600);
    // 抖动 + 闪烁
    this.tweens.add({ targets: img, x: cx + 8, duration: 40, yoyo: true, repeat: 18 });
    for (let i = 0; i < 6; i++) this.time.delayedCall(i * 120, () => (i % 2 ? img.clearTint() : img.setTintFill(0xffffff)));
    // 连环爆炸
    for (let i = 0; i < 7; i++) {
      this.time.delayedCall(150 + i * 140, () => {
        const x = cx + (Math.random() - 0.5) * img.displayWidth * 0.8;
        const y = cy + (Math.random() - 0.5) * img.displayHeight * 0.8;
        boom(this, x, y, 1 + Math.random() * 0.8, [0xffe14a, 0xff9f43, 0xff6bc8][i % 3]);
        sfx('hit_heavy', { detune: i * 100, volume: 0.6 });
        this.fx.shake(8, 150);
      });
    }
    await wait(this, 1250);
    // 碎成字母，飞向屏幕上方（还给台词簿）
    sfx('boss_down');
    const abc = (this.plan.lesson?.dialogue.map((d) => d.en).join(' ') ?? 'EXCUSE ME').replace(/[^A-Za-z]/g, '').toUpperCase();
    for (let i = 0; i < 28; i++) {
      const t = text(this, cx + (Math.random() - 0.5) * img.displayWidth, cy + (Math.random() - 0.5) * img.displayHeight, abc[i % abc.length] ?? 'A', 34, '#ffe14a', {
        fontStyle: 'bold', stroke: '#7a3b00', strokeThickness: 6,
      }).setOrigin(0.5).setDepth(88);
      this.tweens.add({ targets: t, x: 640 + (Math.random() - 0.5) * 200, y: -40, angle: Math.random() * 720, duration: 900 + Math.random() * 500, ease: 'Quad.in', onComplete: () => t.destroy() });
    }
    this.tweens.add({ targets: img, alpha: 0, scale: v.scale * 1.4, duration: 400, onComplete: () => img.destroy() });
    this.tweens.add({ targets: v.shadow, alpha: 0, duration: 400, onComplete: () => v.shadow.destroy() });
    // 全屏光爆
    boom(this, cx, cy, 4, 0xffffff);
    this.fx.ring(cx, cy, 0xffe14a, 9);
    this.fx.flashScreen(0xffffff);
    const pillar = this.add.image(cx, 0, 'fx_pillar').setOrigin(0.5, 0).setDepth(56).setBlendMode('ADD').setTint(0xffe14a).setScale(2.5, 0);
    this.tweens.add({ targets: pillar, scaleY: 1, duration: 300, yoyo: true, hold: 600, onComplete: () => pillar.destroy() });
    this.views.delete(v.e.uid);
    await wait(this, 700);
    // 击败横幅
    const band = this.add.rectangle(640, 260, 1280, 150, 0x1b0b2b, 0.85).setDepth(97).setScale(1, 0);
    const t1 = text(this, 640, 236, 'BOSS 击败！', 70, '#ffe14a', { fontStyle: 'bold', stroke: '#7a3b00', strokeThickness: 10 }).setOrigin(0.5).setDepth(98).setScale(2.4).setAlpha(0);
    const t2 = text(this, 640, 304, `${v.e.name} 被打散了，台词回来了！`, 24, '#ffffff').setOrigin(0.5).setDepth(98).setAlpha(0);
    this.tweens.add({ targets: band, scaleY: 1, duration: 180 });
    this.tweens.add({ targets: t1, scale: 1, alpha: 1, duration: 260, ease: 'Back.out' });
    this.tweens.add({ targets: t2, alpha: 1, delay: 250, duration: 250 });
    this.fx.shake(10, 300);
    // 掉落喷出
    sfx('loot');
    for (let i = 0; i < 14; i++) {
      const coin = this.add.circle(cx, cy, 9, i % 4 ? 0xffc94a : 0x9fe3ff).setStrokeStyle(3, 0x2b2a4a).setDepth(60);
      const tx = cx + (Math.random() - 0.5) * 400;
      this.tweens.add({ targets: coin, x: tx, duration: 700, ease: 'Linear' });
      this.tweens.add({ targets: coin, y: cy - 160 - Math.random() * 100, duration: 300, ease: 'Quad.out', yoyo: false, onComplete: () => {
        this.tweens.add({ targets: coin, y: GROUND - 6, duration: 400, ease: 'Bounce.out' });
      } });
      this.tweens.add({ targets: coin, alpha: 0, delay: 2000, duration: 300, onComplete: () => coin.destroy() });
    }
    this.time.delayedCall(260, () => sfx('coin'));
    this.hero.cheer();
    this.partner?.cheer();
    await wait(this, 2000);
    for (const o of [band, t1, t2]) o.destroy();
  }

  private async enemyAttack(o: Outcome) {
    const front = this.ctl.queue[0] ?? o.enemy;
    const v = this.views.get(front.uid);
    if (!v || o.enemyAttack === 'none') return;
    const x0 = v.img.x;
    this.mobSfx(v.e, 'attack', 0.8);
    let back: () => Promise<unknown> = () => tween(this, { targets: v.img, x: x0, duration: 220, ease: 'Quad.out' });
    if (v.e.tier === 'boss') back = await this.bossMove(v);
    else await tween(this, { targets: v.img, x: this.hero.x + 110, duration: 170, ease: 'Quad.in' });
    if (o.enemyAttack === 'blocked') {
      sfx('shield');
      const sh = this.add.image(this.hero.x + 50, GROUND - 90, 'fx_shield').setDepth(60).setScale(0.6);
      this.tweens.add({ targets: sh, scale: 0.9, alpha: 0, duration: 450, onComplete: () => sh.destroy() });
      this.fx.label(this.hero.x, GROUND - 210, '格挡！', '#9fe3ff', 30);
    } else if (o.enemyAttack === 'shield') {
      sfx('shield');
      this.fx.burst(this.hero.x + 40, GROUND - 90, 12, 0x7fd0ff);
      this.fx.label(this.hero.x, GROUND - 210, '护盾 −1', '#9fe3ff', 26);
    } else {
      sfx('player_hurt');
      this.hero.hurt();
      this.hero.tintAll(0xff6b6b, false);
      this.time.delayedCall(220, () => this.hero.tintAll(null));
      this.fx.shake(6, 200);
      this.redEdge();
    }
    await back();
    if (o.rescued) await this.rescue();
  }

  private bossMoveN = 0;

  /**
   * Boss 专属招式（轮流使用），在“打到主角”的瞬间返回，返回值是收招动画。
   * 帕顿：声波咆哮 / 肚皮冲撞 / 吞音吸气；胡迷斯：名牌飞镖 / 雾隐突袭 / 帽子戏法
   */
  private async bossMove(v: EnemyView): Promise<() => Promise<unknown>> {
    const img = v.img, x0 = img.x, y0 = img.y, sx = img.scaleX, sy = img.scaleY;
    const hx = this.hero.x, hy = GROUND - 90;
    const n = this.bossMoveN++ % 3;
    const mouth = { x: img.x - img.displayWidth * 0.3, y: img.y - img.displayHeight * 0.62 };
    const name = (t: string, c: string) => this.fx.label(img.x, img.y - img.displayHeight - 20, t, c, 30);
    const stay = () => tween(this, { targets: img, scaleX: sx, scaleY: sy, x: x0, y: y0, alpha: 1, duration: 200 });
    // 招式表：帕顿、胡迷斯写死；其他 Boss 读 chapters.json（从 6 种招式里选 3 种，各有自己的招式名和主色）
    const set = this.bossMoves(v.e.kind);
    const move = set.moves[n] ?? 'slam';
    const nm = `${set.names[n] ?? '重击'}！`;
    const color = set.color;
    const css = `#${color.toString(16).padStart(6, '0')}`;
    {
      if (move === 'waves') {
        name(nm, css);
        await tween(this, { targets: img, scaleX: sx * 0.9, scaleY: sy * 1.1, duration: 260, ease: 'Quad.out' });
        sfx('sk_wave_cast', { volume: 0.6, detune: -400 });
        this.tweens.add({ targets: img, scaleX: sx * 1.12, scaleY: sy * 0.92, duration: 120, yoyo: true });
        for (let i = 0; i < 4; i++) {
          const r = this.add.ellipse(mouth.x, mouth.y, 40, 90).setStrokeStyle(8, color).setDepth(40);
          this.tweens.add({ targets: r, x: hx + 30, scaleX: 1.6, scaleY: 1.8, alpha: 0.2, delay: i * 70, duration: 320, ease: 'Quad.in', onComplete: () => r.destroy() });
        }
        for (const ch of ['W', 'H', 'A', 'T', '?']) {
          const t = text(this, mouth.x, mouth.y, ch, 34, '#ffd34a', { fontStyle: 'bold', stroke: '#7a3b00', strokeThickness: 5 }).setOrigin(0.5).setDepth(41);
          this.tweens.add({ targets: t, x: hx + 30 + Math.random() * 40, y: hy + (Math.random() - 0.5) * 80, angle: 360, alpha: 0, duration: 420, ease: 'Quad.in', onComplete: () => t.destroy() });
        }
        await wait(this, 400);
        this.fx.shake(5, 160);
        return stay;
      }
      if (move === 'slam') {
        name(nm, css);
        await tween(this, { targets: img, scaleX: sx * 1.1, scaleY: sy * 0.85, duration: 200 });
        await tween(this, { targets: img, x: hx + 150, y: y0 - 160, scaleX: sx, scaleY: sy, duration: 260, ease: 'Quad.out' });
        await tween(this, { targets: img, y: y0, duration: 170, ease: 'Quad.in' });
        sfx('hit_heavy', { detune: -500 });
        this.fx.shake(10, 260);
        this.fx.burst(img.x, GROUND, 24, 0xd9b38c);
        this.fx.ring(img.x, GROUND - 20, color, 2);
        return () => tween(this, { targets: img, x: x0, duration: 380, ease: 'Quad.inOut' });
      }
      if (move === 'inhale') {
      name(nm, css);
      sfx('sk_whirl_cast', { volume: 0.5, detune: -600 });
      this.tweens.add({ targets: img, scaleX: sx * 1.12, scaleY: sy * 1.08, duration: 600 });
      this.tweens.add({ targets: this.hero, x: hx + 40, duration: 500, ease: 'Quad.in' });
      for (let i = 0; i < 10; i++) {
        const t = text(this, hx + (Math.random() - 0.5) * 60, hy + (Math.random() - 0.5) * 120, 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)], 26, '#ffffff', { fontStyle: 'bold', stroke: '#2b2a4a', strokeThickness: 4 }).setOrigin(0.5).setDepth(41);
        this.tweens.add({ targets: t, x: mouth.x, y: mouth.y, scale: 0.3, delay: i * 40, duration: 360, ease: 'Quad.in', onComplete: () => t.destroy() });
      }
      await wait(this, 620);
      sfx('hit_heavy', { detune: -300, volume: 0.7 });
      return async () => {
        this.tweens.add({ targets: this.hero, x: hx, duration: 250 });
        await stay();
      };
      }
    }
    if (move === 'tags') {
      name(nm, css);
      await tween(this, { targets: img, angle: 8, duration: 180 });
      const cols = [0xff6b6b, 0xffd34a, 0x5aa9ff, 0x7dffa5, 0xd28bff];
      for (let i = 0; i < 5; i++) {
        const r = this.add.rectangle(img.x - 40, img.y - img.displayHeight * 0.6, 34, 20, cols[i]).setStrokeStyle(3, 0x2b2a4a).setDepth(41);
        this.time.delayedCall(i * 60, () => sfx('swing1', { volume: 0.35, detune: 300 + i * 120 }));
        this.tweens.add({ targets: r, x: hx + 20, y: hy + (i - 2) * 22, angle: 720, delay: i * 60, duration: 300, ease: 'Quad.in', onComplete: () => r.destroy() });
      }
      await wait(this, 520);
      this.tweens.add({ targets: img, angle: 0, duration: 200 });
      return stay;
    }
    if (move === 'fog') {
      name(nm, css);
      this.fx.burst(img.x, img.y - 120, 20, 0xc9d6e0);
      sfx('sk_frost_cast', { volume: 0.4, detune: -300 });
      await tween(this, { targets: img, alpha: 0, scaleX: sx * 0.6, duration: 220 });
      img.setX(hx + 120);
      this.fx.burst(img.x, img.y - 120, 20, 0xc9d6e0);
      await tween(this, { targets: img, alpha: 1, scaleX: sx, duration: 160 });
      sfx('sk_slash_cast', { volume: 0.6, detune: -200 });
      slashAnim(this, hx + 20, hy, 150, 1, color);
      await wait(this, 120);
      return async () => {
        await tween(this, { targets: img, alpha: 0, duration: 160 });
        img.setX(x0);
        await tween(this, { targets: img, alpha: 1, duration: 200 });
      };
    }
    name(nm, css);
    await tween(this, { targets: img, scaleY: sy * 1.08, duration: 200, yoyo: true });
    sfx('sk_letters_cast', { volume: 0.5 });
    for (let i = 0; i < 3; i++) {
      const hat = this.add.graphics().setDepth(41);
      hat.fillStyle(color, 1).lineStyle(3, 0x2b2a4a, 1).fillRect(-16, -30, 32, 30).strokeRect(-16, -30, 32, 30).fillRect(-26, 0, 52, 8).strokeRect(-26, 0, 52, 8);
      hat.setPosition(hx - 60 + i * 60, hy - 260);
      this.tweens.add({ targets: hat, y: hy - 40, delay: i * 110, duration: 300, ease: 'Bounce.out', onComplete: () => this.tweens.add({ targets: hat, alpha: 0, duration: 250, onComplete: () => hat.destroy() }) });
    }
    await wait(this, 520);
    return stay;
  }

  private bossMoves(kind: string): { moves: string[]; names: string[]; color: number } {
    if (kind === 'boss_pardon') return { moves: ['waves', 'slam', 'inhale'], names: ['声波咆哮', '肚皮冲撞', '吞音吸气'], color: 0xff7a2e };
    if (kind === 'boss_whomist') return { moves: ['tags', 'fog', 'hats'], names: ['名牌飞镖', '雾隐突袭', '帽子戏法'], color: 0x2fd39a };
    const d = bossDef(kind);
    if (d) return { moves: d.moves, names: d.moveNames, color: parseInt(d.color.slice(1), 16) };
    if (kind === 'duke') return { moves: ['fog', 'waves', 'inhale'], names: ['寂静降临', '无声咆哮', '吞噬台词'], color: 0x6d5a9b };
    return { moves: ['slam', 'waves', 'hats'], names: ['重击', '声波', '乱砸'], color: 0x8a6dd9 };
  }

  /** 屏幕边缘红色暗角（不做全屏红闪） */
  private redEdge() {
    const g = this.add.graphics().setDepth(88);
    g.lineStyle(40, 0xff3b3b, 0.35).strokeRect(0, 0, 1280, 720);
    this.tweens.add({ targets: g, alpha: 0, duration: 300, onComplete: () => g.destroy() });
  }

  private async rescue() {
    const p = this.partner ?? new Puppet(this, -60, GROUND, 'sophie', 0.45).setDepth(19);
    p.setVisible(true).run();
    await tween(this, { targets: p, x: this.hero.x - 60, duration: 400 });
    p.cheer();
    sfx('levelup');
    this.fx.label(this.hero.x, GROUND - 230, 'Sophie 救了你！❤×3', '#ff9fb3', 28);
    this.fx.burst(this.hero.x, GROUND - 100, 24, 0xff9fb3);
    await wait(this, 700);
    if (!this.partner) p.destroy();
    else p.idle();
  }

  /** 觉醒技：速度线 + 大立绘切入 + 句子单词飞入剑中 + 8 连斩 + 全屏冲击波 + 光柱 + 慢动作 */
  private async awakenCutIn(q: Question, v: EnemyView) {
    sfx('awaken_cast', {}, 'awaken');
    const words = q.kind === 'order' ? q.answer : ['Excuse', 'me!'];
    const L = this.add.container(0, 0).setDepth(100);
    const dark = this.add.rectangle(0, 0, 1280, 720, 0x0b0d17, 0).setOrigin(0);
    const band = this.add.rectangle(640, 300, 1280, 300, 0xff9f43, 1).setScale(1, 0);
    const speed = this.add.tileSprite(640, 300, 1280, 300, 'fx_speed').setBlendMode('ADD').setAlpha(0.8).setScale(1, 0);
    L.add([dark, band, speed]);
    this.tweens.add({ targets: dark, fillAlpha: 0.65, duration: 150 });
    this.tweens.add({ targets: [band, speed], scaleY: 1, duration: 160, ease: 'Quad.out' });
    const scroll = this.time.addEvent({ delay: 16, loop: true, callback: () => (speed.tilePositionX += 40) });
    const big = makeHero(this, -260, 560, game.s, 1.15);
    big.setFace('happy');
    L.add(big);
    this.tweens.add({ targets: big, x: 320, duration: 260, ease: 'Back.out' });
    const title = text(this, 820, 250, '觉醒 · 台词风暴', 64, '#ffffff', { fontStyle: 'bold', stroke: '#7a3b00', strokeThickness: 12 }).setOrigin(0.5).setScale(2).setAlpha(0);
    const sub = text(this, 820, 330, `${game.s.name} 把找回的台词化为力量！`, 24, '#fff2b0', { stroke: '#7a3b00', strokeThickness: 6 }).setOrigin(0.5).setAlpha(0);
    L.add([title, sub]);
    this.tweens.add({ targets: title, scale: 1, alpha: 1, duration: 220, delay: 150, ease: 'Back.out' });
    this.tweens.add({ targets: sub, alpha: 1, duration: 200, delay: 350 });
    this.fx.shake(6, 300);
    await wait(this, 1100);
    scroll.remove();
    this.tweens.add({ targets: L, alpha: 0, duration: 200, onComplete: () => L.destroy() });

    // 单词从四周飞入主角的剑
    for (const [i, w] of words.entries()) {
      const t = text(this, 200 + Math.random() * 880, 80 + Math.random() * 200, w, 30, '#ffe14a', { fontFamily: EN_FONT, fontStyle: 'bold', stroke: '#2b2a4a', strokeThickness: 6 }).setOrigin(0.5).setDepth(95);
      this.tweens.add({ targets: t, x: this.hero.x + 30, y: GROUND - 150, scale: 0.3, alpha: 0.2, delay: i * 70, duration: 380, ease: 'Quad.in', onComplete: () => t.destroy() });
    }
    sfx('gauge_full');
    const pillarHero = this.add.image(this.hero.x, 0, 'fx_pillar').setOrigin(0.5, 0).setDepth(19).setBlendMode('ADD').setTint(0xffd34a).setScale(1.2, 0);
    this.tweens.add({ targets: pillarHero, scaleY: 1, duration: 300, yoyo: true, hold: 400, onComplete: () => pillarHero.destroy() });
    await wait(this, 450 + words.length * 70);
    // 8 连斩：主角在怪周围瞬移
    for (let k = 0; k < 8; k++) {
      const ang = (k * 137) % 360;
      this.hero.setX(v.img.x + (k % 2 ? 120 : -150));
      slashAnim(this, v.img.x, v.img.y - v.img.displayHeight * 0.5, ang, 1.3, k % 2 ? 0xffe14a : 0xffffff);
      sfx(`swing${(k % 3) + 1}`, { volume: 0.4 });
      sfx('hit_light', { detune: k * 90, volume: 0.5 });
      this.fx.burst(v.img.x, v.img.y - v.img.displayHeight * 0.5, 10, 0xffe14a);
      this.fx.flash(v.img);
      this.fx.hit();
      await wait(this, 70);
    }
    // 全屏冲击波 + 光柱 + 慢动作
    this.fx.slowmo(0.25, 500);
    this.fx.zoom(1.12, 600);
    this.fx.flashScreen(0xfff2b0);
    boom(this, v.img.x, v.img.y - v.img.displayHeight * 0.5, 2.4, 0xffd34a);
    this.fx.ring(v.img.x, v.img.y - v.img.displayHeight * 0.5, 0xffd34a, 6);
    for (const dx of [-160, 0, 160]) {
      const p = this.add.image(v.img.x + dx, 0, 'fx_pillar').setOrigin(0.5, 0).setDepth(56).setBlendMode('ADD').setTint(0xff9f43).setScale(0.8, 0);
      this.tweens.add({ targets: p, scaleY: 1, duration: 180, yoyo: true, hold: 300, onComplete: () => p.destroy() });
    }
    sfx('hit_crit');
    this.fx.shake(12, 400);
    this.hero.setX(v.img.x - (v.e.tier === 'boss' ? 210 : 120));
  }

  // ---------------- Boss 机制 ----------------

  private onPardon() {
    this.pardonUsed++;
    if (this.pardonUsed === 1) {
      this.fx.label(640, 180, '说得好！听不清就说 Pardon?', '#9fe3ff', 28);
      game.s.gold += 20;
    }
    const v = [...this.views.values()].find((x) => x.e.tier === 'boss');
    if (v) this.tweens.add({ targets: v.img, scaleX: v.scale * 1.1, duration: 120, yoyo: true });
  }

  private async bossPhase(phase: number) {
    sfx('boss_phase');
    this.fx.shake(8, 300);
    const id = `boss_${this.lessonTag()}_p${phase}`;
    if (await loadStory(id)) {
      await StoryRunner.play(this, id);
      return;
    }
    const msg = this.plan.bossMech === 'pardon'
      ? phase === 2 ? '回音怪放出吞音雾！听不清就点 Pardon?' : '它把手提包吞进肚子里了！'
      : this.plan.bossMech === 'whomist' ? (phase === 2 ? '迷雾更浓了，再救几位同学！' : '最后几位同学！') : `第 ${phase} 阶段！`;
    this.fx.label(640, 200, msg, '#ffb3c8', 28);
    await wait(this, 900);
  }

  private async rescueClassmate(name: string, boss: EnemyView) {
    const head = (KID_HEADS as readonly string[]).includes(name) ? name : undefined;
    const kid = new Puppet(this, -60, GROUND, 'kid', 0.4, { head }).setDepth(19);
    kid.run();
    sfx('combo');
    await tween(this, { targets: kid, x: boss.img.x - 180, duration: 450, ease: 'Quad.in' });
    await kid.swing(0, 80);
    this.impact(boss, Math.round(this.ctl.kit.atk * 0.8), { heavy: true, crit: false, stack: 0, gold: true });
    kid.setFace(name);
    this.fx.label(kid.x, GROUND - 200, `${name[0].toUpperCase()}${name.slice(1)} 得救了！`, '#7dffa5', 24);
    kid.run();
    const slot = 40 + this.classmates.length * 46;
    await tween(this, { targets: kid, x: slot, duration: 420 });
    kid.idle();
    kid.setScale(0.36);
    this.classmates.push(kid);
  }

  private async classShout() {
    const l = this.plan.lesson!;
    const line = l.dialogue.find((d) => d.en === 'Nice to meet you.');
    for (const k of this.classmates) k.cheer();
    this.hero.cheer();
    if (line) speak({ text: line.en, clip: line.audio });
    this.fx.label(640, 160, 'Nice to meet you!', '#ffe14a', 54);
    this.fx.flashScreen(0xfff2b0);
    await wait(this, 1400);
  }

  private async handbagFinale(v: EnemyView) {
    const bag = this.add.image(v.img.x - 40, v.img.y - v.img.displayHeight * 0.4, 'prop_handbag').setDepth(30).setScale(0.2);
    sfx('launch');
    await tween(this, { targets: bag, scale: 1.1, y: bag.y - 160, x: bag.x - 120, angle: -40, duration: 350, ease: 'Quad.out' });
    await tween(this, { targets: bag, x: v.img.x, y: v.img.y - v.img.displayHeight * 0.6, angle: 200, duration: 260, ease: 'Quad.in' });
    this.impact(v, Math.round(this.ctl.kit.atk * 3), { heavy: true, crit: true, stack: 0, gold: true, big: true });
    this.tweens.add({ targets: bag, x: 560, y: GROUND - 30, angle: 360, scale: 0.8, duration: 500, ease: 'Bounce.out' });
    await wait(this, 600);
  }

  private async bossDefeated() {
    await wait(this, 300);
    if (this.plan.story?.clear && this.alive) await StoryRunner.play(this, this.plan.story.clear, { music: 'story' });
    if (this.plan.lesson?.id === 'L005-006' && this.alive && !game.s.story.seen.includes('L005_duke')) {
      this.setBg('boss');
      await StoryRunner.play(this, 'L005_duke', { music: 'story' });
    }
    if (this.plan.lesson?.id === 'L005-006') for (const k of ['hans', 'naoko', 'changwoo', 'luming', 'xiaohui']) game.s.partners.includes(k) || game.s.partners.push(k);
    await this.finish(true);
  }

  /** DNF 式 Boss 登场横幅：小字称号 + 大字名字 + 一句来历 */
  private async bossBanner(e: Enemy) {
    const info = this.plan.lesson ? bossBannerInfo(this.plan.lesson.id, e.kind) : undefined;
    const [title, name] = info ? [info.title, info.name] : e.name.split(' · ');
    const c = this.add.container(0, 0).setDepth(96);
    const band = this.add.rectangle(640, 250, 1280, 170, 0x1b0b2b, 0.88).setScale(1, 0);
    const line1 = this.add.rectangle(640, 165, 1280, 4, 0xe8505b).setScale(0, 1);
    const line2 = this.add.rectangle(640, 335, 1280, 4, 0xe8505b).setScale(0, 1);
    const lv = text(this, 300, 200, `Lv.${e.level}  ${title ?? ''}`, 26, '#ff9fb3', { fontStyle: 'bold' }).setOrigin(0, 0.5).setAlpha(0);
    const nm = text(this, 300, 256, name ?? e.name, 64, '#ffffff', { fontStyle: 'bold', stroke: '#e8505b', strokeThickness: 8 }).setOrigin(0, 0.5).setX(1400);
    const tag = text(this, 300, 312, info?.tagline ?? '静默军团', 20, '#d9c8ff').setOrigin(0, 0.5).setAlpha(0);
    c.add([band, line1, line2, lv, nm, tag]);
    this.tweens.add({ targets: band, scaleY: 1, duration: 200, ease: 'Quad.out' });
    this.tweens.add({ targets: [line1, line2], scaleX: 1, duration: 300 });
    this.tweens.add({ targets: nm, x: 300, duration: 350, delay: 120, ease: 'Back.out' });
    this.tweens.add({ targets: [lv, tag], alpha: 1, duration: 300, delay: 300 });
    await wait(this, 2200);
    await tween(this, { targets: c, alpha: 0, duration: 250 });
    c.destroy();
  }

  // ---------------- 房间出口 / 小地图 / HUD ----------------

  private async chooseExit(): Promise<Room | undefined> {
    await this.once('tut_exit');
    return this.pickExit();
  }

  private pickExit(): Promise<Room | undefined> {
    const exits = this.ctl.exits();
    if (!exits.length) return Promise.resolve(undefined);
    return new Promise((resolve) => {
      const c = this.add.container(0, 0).setDepth(92);
      exits.forEach((r, i) => {
        const label = r.optional ? `↪ ${ROOM_NAME[r.type]}房（可选）` : r.type === 'boss' ? '▶ 前往 BOSS 房' : `▶ 下一间：${ROOM_NAME[r.type]}房`;
        const b = button(this, 1040, 300 + i * 70, 400, 58, label, async () => {
          c.destroy();
          sfx('door');
          this.hero.run();
          await tween(this, { targets: this.hero, x: 1400, duration: 500, ease: 'Quad.in' });
          resolve(r);
        }, { size: 22, color: r.optional ? 0x2f7a4d : r.type === 'boss' ? 0xb8323f : 0x3b62d9 });
        c.add(b);
        if (i === 0) this.tweens.add({ targets: b, x: 1056, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      });
    });
  }

  private drawMiniMap() {
    const m = this.miniMap;
    m.removeAll(true);
    const ox = 1030, oy = 64, cs = 30;
    const g = this.add.graphics();
    g.fillStyle(0x0b0d17, 0.6).fillRoundedRect(ox - 10, oy - 10, cs * 3 + 20, cs * 3 + 20, 8);
    m.add(g);
    const cur = this.ctl.room;
    for (const r of this.plan.rooms) {
      const x = ox + r.cell[0] * cs + cs / 2, y = oy + r.cell[1] * cs + cs / 2;
      const visited = this.ctl.visited.has(r.id);
      const color = r === cur ? 0xffe14a : r.type === 'boss' ? 0xe8505b : visited ? 0x4fdc7b : 0x3a4170;
      m.add(this.add.rectangle(x, y, cs - 6, cs - 6, color, r.optional && !visited ? 0.5 : 1).setStrokeStyle(1, 0xffffff, 0.3));
      const icon = r.type === 'boss' ? '👑' : visited && r !== cur ? '✓' : r === cur ? '●' : '?';
      m.add(text(this, x, y, icon, 13, r === cur ? '#2b2a4a' : '#ffffff').setOrigin(0.5));
    }
  }

  private drawHud() {
    const h = this.hud;
    h.removeAll(true);
    for (let i = 0; i < this.ctl.maxHearts; i++) h.add(this.add.image(30 + i * 30, 30, i < this.ctl.hearts ? 'heart' : 'heart_empty'));
    for (let i = 0; i < this.ctl.kit.shield; i++) h.add(this.add.image(30 + i * 26, 64, 'fx_shield').setScale(0.28).setAlpha(i < this.ctl.shield ? 1 : 0.25));
    // 觉醒槽
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.5).fillRoundedRect(20, 86, 200, 12, 6);
    g.fillStyle(this.ctl.awakenReady ? 0xffb020 : 0x9b7bff, 1).fillRoundedRect(20, 86, Math.max(12, 2 * this.ctl.gauge), 12, 6);
    h.add(g);
    h.add(text(this, 228, 82, this.ctl.awakenReady ? '觉醒!' : '觉醒槽', 14, this.ctl.awakenReady ? '#ffb020' : COLORS.dim));
    h.add(text(this, 640, 24, `${this.plan.title} · ${ROOM_NAME[this.ctl.room.type]}房`, 22, '#ffffff', { stroke: '#000', strokeThickness: 5 }).setOrigin(0.5));
    if (this.ctl.combo >= 2) h.add(text(this, 640, 56, `连对 ${this.ctl.combo}`, 20, '#ffe14a', { stroke: '#000', strokeThickness: 4 }).setOrigin(0.5));
  }

  private drawBossBar() {
    this.bossBar?.destroy();
    const p = this.ctl.bossProgress;
    if (!p) return;
    const c = (this.bossBar = this.add.container(0, 0).setDepth(90));
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.6).fillRoundedRect(340, 86, 600, 22, 8);
    g.fillStyle(0xe8505b, 1).fillRoundedRect(340, 86, Math.max(0, (600 * p.left) / p.total), 22, 8);
    g.lineStyle(2, 0xffffff, 0.5).strokeRoundedRect(340, 86, 600, 22, 8);
    // 阶段刻度
    g.lineStyle(2, 0xffffff, 0.8).lineBetween(340 + 200, 86, 340 + 200, 108).lineBetween(340 + 400, 86, 340 + 400, 108);
    c.add(g);
    c.add(text(this, 640, 97, `${this.ctl.queue.find((e) => e.tier === 'boss')?.name ?? ''} · 阶段 ${p.phase}/3`, 15, '#ffffff', { stroke: '#000', strokeThickness: 3 }).setOrigin(0.5));
  }

  // ---------------- 结算 ----------------

  private async finish(cleared: boolean) {
    if (!this.alive) return;
    this.alive = false;
    this.quiz.clear();
    const s = game.s;
    const ms = Date.now() - this.startedAt;
    const d = today();
    if (s.playtime.day !== d) s.playtime = { day: d, ms: 0 };
    s.playtime.ms += ms;
    (s.dayLog[d] ??= emptyDayLog()).ms += ms;
    const result = finishRun(s, this.plan, this.ctl.answerLogs(), this.ctl.bestCombo, cleared);
    void game.persist();
    this.scene.start('Result', { result, plan: { id: this.plan.id, title: this.plan.title, isAbyss: this.plan.isAbyss } });
  }
}

export { spk };
