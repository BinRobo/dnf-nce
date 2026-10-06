import Phaser from 'phaser';
import { need } from '../assets';
import { music, sfx } from '../audio/sound';
import { fluentMs } from '../battle/controller';
import { buildBattle, qtype } from '../battle/plan';
import { QuizPanel } from '../battle/quiz';
import { makeHero } from '../gfx/hero';
import type { Puppet } from '../gfx/puppet';
import { backdrop } from '../gfx/textures';
import { party, type BattleSnap, type PartyEnd, type PartyMember, type PartyStart } from '../net/party';
import { lookToSave, net, type PartyMsg } from '../net/realtime';
import { emptyDayLog, today } from '../save/schema';
import { game } from '../state';
import { isTouch } from '../ui/device';
import { orderQ, type AnswerLog, type Question } from '../systems/questions';
import { shuffle } from '../systems/rng';
import { finishRun } from '../systems/session';
import { confirmBox } from '../ui/modal';
import { button, COLORS, panel, text, toast } from '../ui/widgets';
import { mobTex } from './BootScene';

export const PARTY_BONUS = 0.25;
const GROUND = 440;
const BOSS_X = 980;

interface Slot {
  m: PartyMember;
  hero: Puppet;
  x: number;
  name: Phaser.GameObjects.Text;
  hearts: Phaser.GameObjects.Text;
  tag: Phaser.GameObjects.Text;
  hit: Phaser.GameObjects.Rectangle;
}

/**
 * 组队 Boss 战：每个人在自己的屏幕上答自己的题，答对 = 攻击共同的 Boss。
 * 血量、合击、Boss 出招、倒下 / 救援、终结合唱全部由服务器裁决（server/party.mjs），这里只负责演出和出题。
 */
export class PartyBattleScene extends Phaser.Scene {
  private start!: PartyStart;
  private snap!: BattleSnap;
  private slots = new Map<string, Slot>();
  private boss!: Phaser.GameObjects.Image;
  private bossBar!: Phaser.GameObjects.Graphics;
  private bossText!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private info!: Phaser.GameObjects.Text;
  private quiz!: QuizPanel;
  private pool: Question[] = [];
  private lesson!: NonNullable<ReturnType<typeof game.index.lesson>>;
  private logs = new Map<string, AnswerLog>();
  private streak = 0;
  private bestCombo = 0;
  private alive = true;
  private ended = false;
  private startedAt = 0;
  private abort: (() => void) | null = null;
  private rescueReq = '';
  private wake: (() => void) | null = null;
  private young = true;
  /** 现在显示的题（调试 / 测试用） */
  cur: Question | null = null;

  constructor() {
    super('PartyBattle');
  }

  init(data: { start: PartyStart }) {
    this.start = data.start;
    this.snap = data.start.battle;
    this.slots = new Map();
    this.logs = new Map();
    this.pool = [];
    this.streak = this.bestCombo = 0;
    this.alive = true;
    this.ended = false;
    this.abort = this.wake = null;
    this.rescueReq = '';
  }

  preload() {
    const plan = this.makePlan();
    const boss = plan.rooms.flatMap((r) => r.enemies).find((e) => e.tier === 'boss');
    need(this, {
      heroes: [game.s, ...this.start.party.members.map(lookToSave)], mobs: [boss ? (boss.kind === 'boss_generic' ? 'boss_pardon' : boss.kind) : 'boss_pardon'],
      fx: true, sfx: 'battle',
    });
  }

  private makePlan() {
    const l = game.index.lesson(this.start.party.dungeon)!;
    this.lesson = l;
    return buildBattle(l, game.s, game.index);
  }

  create() {
    const plan = this.makePlan();
    const s = game.s;
    this.young = s.settings.grade === 'low';
    this.startedAt = Date.now();
    party.pendingStart = null;
    backdrop(this, 'dungeon', GROUND + 16);
    music('boss');

    // 题库：把整个副本的题打平，打完一轮再洗牌重来（拼写 / 排序太慢，常规攻击里不用，排序留给终结合唱）
    const all = plan.rooms.flatMap((r) => r.enemies.flatMap((e) => e.questions)).filter((q) => q.kind !== 'order');
    this.pool = all.length >= 6 ? all : plan.rooms.flatMap((r) => r.enemies.flatMap((e) => e.questions));
    this.pool = shuffle([...this.pool]);

    const bossE = plan.rooms.flatMap((r) => r.enemies).find((e) => e.tier === 'boss');
    this.boss = this.add.image(BOSS_X, GROUND + 8, mobTex(this, bossE?.kind === 'boss_generic' ? 'boss_pardon' : bossE?.kind ?? 'boss_pardon')).setOrigin(0.5, 1).setDepth(15);
    this.boss.setScale(320 / Math.max(this.boss.height, 1));
    const sc = this.boss.scale;
    this.tweens.add({ targets: this.boss, scaleY: sc * 1.04, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.add.ellipse(BOSS_X, GROUND + 8, 220, 18, 0x000000, 0.25).setDepth(4);

    // 队员
    this.start.party.members.forEach((m, i) => {
      const x = 120 + i * 135;
      const mine = m.id === party.me;
      const save = mine ? s : lookToSave(m);
      const hero = makeHero(this, x, GROUND + (i % 2) * 10, save, 0.4).idle();
      hero.setDepth(20 + i);
      const nm = text(this, x, GROUND - hero.tall - 40, `${mine ? '★ ' : ''}${m.name}`, 16, mine ? '#ffe14a' : '#9fe3ff', { stroke: '#000', strokeThickness: 4 }).setOrigin(0.5).setDepth(40);
      const hearts = text(this, x, GROUND - hero.tall - 18, '', 15, '#ff6b7a', { stroke: '#000', strokeThickness: 3 }).setOrigin(0.5).setDepth(40);
      const tag = text(this, x, GROUND - 60, '', 18, '#ffffff', { stroke: '#000', strokeThickness: 4 }).setOrigin(0.5).setDepth(41);
      const hit = this.add.rectangle(x, GROUND - 80, 110, 190, 0xffffff, 0.001).setDepth(42).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => this.tryRescue(m.id));
      this.slots.set(m.id, { m, hero, x, name: nm, hearts, tag, hit });
    });

    // HUD
    panel(this, 300, 14, 680, 76, 0.8).setDepth(60);
    this.add.text(640, 24, `${bossE?.name ?? 'Boss'} · ${this.start.party.members.length} 人合力`, { fontSize: '20px', color: '#ffffff', fontFamily: 'sans-serif' }).setOrigin(0.5, 0).setDepth(61);
    this.bossBar = this.add.graphics().setDepth(61);
    this.bossText = text(this, 640, 66, '', 15, '#ffffff', { stroke: '#000', strokeThickness: 3 }).setOrigin(0.5).setDepth(62);
    this.banner = text(this, 640, 150, '', 40, '#ffe14a', { fontStyle: 'bold', stroke: '#7a3b00', strokeThickness: 8 }).setOrigin(0.5).setDepth(80).setAlpha(0);
    this.info = text(this, 640, 114, '', 20, '#ffd27a', { stroke: '#000', strokeThickness: 4 }).setOrigin(0.5).setDepth(70);
    button(this, 70, 40, 110, 44, '退出', () => this.quitAsk(), { size: 18, color: 0x7a2f3a }).setDepth(70);

    const spellMode = s.settings.spellMode === 'auto' ? (this.young || isTouch ? 'tiles' : 'keyboard') : s.settings.spellMode;
    this.quiz = new QuizPanel(this, { spellMode, young: this.young });

    party.onBattle = (e) => this.onMsg(e);
    this.events.once('shutdown', () => {
      this.alive = false;
      this.quiz.clear();
      party.onBattle = null;
      this.wake?.();
    });
    this.refresh();
    this.say('大家一起打败 Boss！', 1400);
    void this.loop();
  }

  // ---------------- 服务器消息 ----------------

  private onMsg(e: PartyMsg) {
    if (!this.alive) return;
    if (e.t === 'p.end') return void this.finish(e as unknown as PartyEnd);
    if (e.t !== 'p.b') return;
    const prev = this.snap;
    this.snap = e.s as BattleSnap;
    const ev = e.ev as Record<string, any>;
    const slot = (id: string) => this.slots.get(id);
    switch (ev.k) {
      case 'hit': {
        const sl = slot(ev.who);
        if (sl) this.strike(sl, ev.dmg, ev.grade === 'perfect');
        if (ev.combo) {
          const o = slot(ev.combo);
          if (o) this.strike(o, 1, false);
          this.say('合击！', 900);
          sfx('combo', { volume: 0.5 });
        }
        if (ev.finale) {
          sfx('boss_phase', { volume: 0.6 });
          this.say('Boss 撑不住了！\n大家一起读完这句话！', 2400);
          this.cameras.main.flash(300, 255, 220, 120);
          this.abort?.();
        }
        break;
      }
      case 'wrong': {
        const sl = slot(ev.who);
        if (sl) this.flashHurt(sl, ev.who === party.me);
        break;
      }
      case 'attack': {
        const sl = slot(ev.target);
        this.tweens.add({ targets: this.boss, x: sl ? sl.x + 220 : BOSS_X - 200, duration: 160, yoyo: true, ease: 'Quad.out' });
        sfx('boss_appear', { volume: 0.25 });
        if (sl) {
          if (ev.hit) this.flashHurt(sl, ev.target === party.me);
          else this.pop(sl.x, GROUND - 120, '躲开了！', '#9fe3ff');
        }
        break;
      }
      case 'rescue': {
        const sl = slot(ev.to);
        if (sl) {
          sl.hero.cheer();
          this.pop(sl.x, GROUND - 130, '被救起来了！', '#7dffa0');
          sfx('shield', { volume: 0.5 });
        }
        slot(ev.by)?.hero.cheer();
        break;
      }
      case 'chorus': {
        const sl = slot(ev.who);
        if (sl) {
          sl.hero.cheer();
          this.pop(sl.x, GROUND - 130, '♪', '#ffe14a');
        }
        break;
      }
      case 'left': {
        const sl = slot(ev.who);
        if (sl) this.pop(sl.x, GROUND - 130, '离开了', COLORS.dim);
        break;
      }
    }
    // 自己倒下 / 被救起：打断当前题
    const was = prev.members.find((m) => m.id === party.me);
    const now = this.snap.members.find((m) => m.id === party.me);
    if (was && now && was.down !== now.down) {
      if (now.down) {
        this.say('你倒下了…等队友来救你', 2000);
        this.quiz.clear();
        this.abort?.();
      }
      this.wake?.();
    }
    this.refresh();
  }

  // ---------------- 演出 ----------------

  private refresh() {
    const sn = this.snap;
    const w = 640;
    const frac = Phaser.Math.Clamp(sn.bossHp / sn.bossMax, 0, 1);
    this.bossBar.clear().fillStyle(0x000000, 0.6).fillRect(320, 48, w, 14).fillStyle(sn.phase === 'finale' ? 0xffb020 : 0xe8505b, 1).fillRect(320, 48, w * frac, 14);
    this.bossBar.lineStyle(2, 0xffffff, 0.9).lineBetween(320 + w * (sn.floor / sn.bossMax), 44, 320 + w * (sn.floor / sn.bossMax), 66);
    this.bossText.setText(sn.phase === 'finale' ? `终结合唱！还差 ${sn.finaleNeed} 人` : `${sn.bossHp} / ${sn.bossMax}`);
    for (const m of sn.members) {
      const sl = this.slots.get(m.id);
      if (!sl) continue;
      sl.hearts.setText(m.left ? '' : m.down ? '💤' : '❤'.repeat(m.hearts));
      sl.hero.setAlpha(m.left ? 0.15 : m.down ? 0.45 : 1);
      sl.tag.setText(m.left ? '' : m.down && m.id !== party.me ? '🚑 点我救人' : sn.phase === 'finale' && m.finale ? '♪ 唱完了' : '');
    }
  }

  private strike(sl: Slot, dmg: number, perfect: boolean) {
    const cls = sl.m.cls;
    if (cls === 'sword') void sl.hero.swing(Phaser.Math.Between(0, 2));
    else void sl.hero.aim();
    this.time.delayedCall(120, () => {
      if (!this.alive) return;
      sl.hero.recover?.(140);
      sfx(perfect || dmg >= 2 ? 'hit_heavy' : 'hit_light', { volume: 0.5 });
      this.boss.setTintFill(0xffffff);
      this.time.delayedCall(70, () => this.boss.clearTint());
      this.tweens.add({ targets: this.boss, x: BOSS_X + 8, duration: 50, yoyo: true });
      this.pop(BOSS_X + Phaser.Math.Between(-60, 60), GROUND - 220, `-${dmg}`, perfect || dmg >= 2 ? '#ffe14a' : '#ffffff', perfect || dmg >= 2 ? 34 : 26);
      const b = this.add.circle(sl.x + 40, GROUND - 80, 10, 0xffe9a0).setDepth(30).setBlendMode('ADD');
      this.tweens.add({ targets: b, x: BOSS_X - 80, y: GROUND - 140, duration: 180, onComplete: () => b.destroy() });
    });
  }

  private flashHurt(sl: Slot, mine: boolean) {
    sl.hero.hurt();
    sl.hero.tintAll(0xff4040);
    this.time.delayedCall(150, () => sl.hero.tintAll(null));
    this.pop(sl.x, GROUND - 130, '-1 ❤', '#ff6b7a');
    sfx('player_hurt', { volume: 0.4 });
    if (mine) this.cameras.main.shake(140, 0.006);
  }

  private pop(x: number, y: number, str: string, color: string, size = 24) {
    const t = text(this, x, y, str, size, color, { fontStyle: 'bold', stroke: '#000', strokeThickness: 5 }).setOrigin(0.5).setDepth(90);
    this.tweens.add({ targets: t, y: y - 50, alpha: 0, duration: 900, ease: 'Quad.out', onComplete: () => t.destroy() });
  }

  private say(str: string, ms: number) {
    this.banner.setText(str).setAlpha(1).setScale(1.3);
    this.tweens.killTweensOf(this.banner);
    this.tweens.add({ targets: this.banner, scale: 1, duration: 200, ease: 'Back.out' });
    this.tweens.add({ targets: this.banner, alpha: 0, delay: ms, duration: 400 });
  }

  // ---------------- 出题循环 ----------------

  private me() {
    return this.snap.members.find((m) => m.id === party.me);
  }

  private next(): Question {
    const q = this.pool.pop();
    if (q) return q;
    // 一轮打完：重新生成这一课的题
    const plan = buildBattle(this.lesson, game.s, game.index);
    this.pool = shuffle(plan.rooms.flatMap((r) => r.enemies.flatMap((e) => e.questions)).filter((x) => x.kind !== 'order'));
    return this.pool.pop()!;
  }

  private finaleQ(): Question {
    const l = this.lesson;
    const i = Math.floor(Math.random() * l.dialogue.length);
    return orderQ(l, i);
  }

  private ask(q: Question): Promise<{ correct: boolean; clean: boolean; ms: number } | null> {
    return new Promise((resolve) => {
      const t0 = performance.now();
      this.cur = q;
      this.abort = () => {
        this.abort = null;
        this.quiz.clear();
        resolve(null);
      };
      this.quiz.show(q, {
        hintsLeft: 0,
        onAnswer: (correct, clean) => {
          this.abort = null;
          resolve({ correct, clean, ms: performance.now() - t0 });
        },
      });
    });
  }

  private note(q: Question, clean: boolean, ms: number) {
    if (this.logs.has(q.itemId)) return;
    this.logs.set(q.itemId, { itemId: q.itemId, firstTry: clean, ms, type: qtype(q) });
  }

  private async loop() {
    while (this.alive && !this.ended) {
      const me = this.me();
      const sn = this.snap;
      if (!me || me.down) {
        this.info.setText(me?.left ? '' : '等队友来救你…');
        await this.sleep();
        continue;
      }
      if (sn.phase === 'finale' && me.finale) {
        this.info.setText('♪ 你唱完了，等队友一起…');
        await this.sleep();
        continue;
      }
      if (this.rescueReq) {
        const target = this.rescueReq;
        this.rescueReq = '';
        await this.rescueRound(target);
        continue;
      }
      if (sn.phase === 'finale') {
        this.info.setText('🎵 把单词按顺序排好，读完这句话！');
        const q = this.finaleQ();
        const r = await this.ask(q);
        if (!r || !this.alive) continue;
        this.note(q, r.clean, r.ms);
        await this.quiz.hide();
        if (r.correct) net.sendParty({ t: 'p.finale' });
        continue;
      }
      this.info.setText('');
      const q = this.next();
      const r = await this.ask(q);
      if (!r) {
        this.pool.push(q); // 被打断（倒下 / 救人 / 合唱开始）：这题还没答，放回去
        continue;
      }
      if (!this.alive) return;
      this.note(q, r.clean, r.ms);
      this.streak = r.correct ? this.streak + 1 : 0;
      this.bestCombo = Math.max(this.bestCombo, this.streak);
      const perfect = r.clean && r.ms < fluentMs(q, this.young) && this.streak >= 3;
      net.sendParty({ t: 'p.ans', ok: r.correct, g: perfect ? 'perfect' : 'hit' });
      await new Promise((res) => this.time.delayedCall(r.correct ? 300 : 500, () => res(null)));
      await this.quiz.hide();
    }
  }

  /** 等到下一次服务器消息（或 1 秒） */
  private sleep() {
    return new Promise<void>((res) => {
      const t = this.time.delayedCall(1000, () => done());
      const done = () => {
        this.wake = null;
        t.remove();
        res();
      };
      this.wake = done;
    });
  }

  // ---------------- 救队友 ----------------

  private tryRescue(id: string) {
    const t = this.snap.members.find((m) => m.id === id);
    const me = this.me();
    if (!t || !me || me.down || !t.down || t.left || id === party.me || this.ended) return;
    this.rescueReq = id;
    this.say('答对这题就能救起队友！', 1200);
    this.abort?.();
    this.wake?.();
  }

  private async rescueRound(target: string) {
    const picks = shuffle(this.pool.filter((q) => q.kind === 'pick'));
    const q = picks[0] ?? this.next();
    this.pool = this.pool.filter((x) => x !== q);
    this.info.setText('🚑 答对这题，就能把队友救起来');
    const r = await this.ask(q);
    if (!r || !this.alive) return;
    this.note(q, r.clean, r.ms);
    await new Promise((res) => this.time.delayedCall(350, () => res(null)));
    await this.quiz.hide();
    if (r.correct) net.sendParty({ t: 'p.rescue', target });
    else toast(this, '没答对，再点一次队友试试', '#ffd27a');
  }

  // ---------------- 退出 / 结算 ----------------

  private quitAsk() {
    if (this.ended) return;
    confirmBox(this, '现在退出，队友会少一个人哦。确定要退出吗？', () => {
      party.leave();
      void this.finish(null);
    });
  }

  private async finish(end: PartyEnd | null) {
    if (this.ended) return;
    this.ended = true;
    this.quiz.clear();
    this.abort?.();
    this.alive = false;
    const win = !!end?.win;
    const s = game.s;
    const ms = Date.now() - this.startedAt;
    const d = today();
    if (s.playtime.day !== d) s.playtime = { day: d, ms: 0 };
    s.playtime.ms += ms;
    (s.dayLog[d] ??= emptyDayLog()).ms += ms;
    const id = this.start.party.dungeon;
    const title = game.manifest.titles[id]?.title ?? id;
    const result = finishRun(s, { id, title, isAbyss: false }, [...this.logs.values()], this.bestCombo, win, PARTY_BONUS);
    void game.persist();
    if (end) this.say(win ? '胜利！' : '败了…', 1500);
    await new Promise((res) => this.time.delayedCall(end ? 1600 : 0, () => res(null)));
    party.view = null;
    this.scene.start('Result', { result, plan: { id, title, isAbyss: false }, party: end ?? { win: false, reason: 'left', stats: [], seconds: Math.round(ms / 1000) } });
  }
}
