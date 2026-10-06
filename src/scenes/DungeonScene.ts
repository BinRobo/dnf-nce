import Phaser from 'phaser';
import { speak, stop } from '../audio/speech';
import { backdrop } from '../gfx/textures';
import { playerStats } from '../systems/player';
import type { AnswerLog, DungeonPlan, OrderQ, PickQ, Question, Room, SpellQ } from '../systems/questions';
import { finishRun } from '../systems/session';
import { game } from '../state';
import { confirmBox } from '../ui/modal';
import { playVideo } from '../ui/video';
import { button, COLORS, EN_FONT, panel, text, type Button } from '../ui/widgets';

const GROUND = 410;
const PLAYER_X = 230;
const PANEL_Y = 432;

type Outcome = { ok: true; clean: boolean } | { ok: false };

interface Mob {
  q: Question;
  sprite: Phaser.GameObjects.Image;
  tag?: Phaser.GameObjects.Text;
}

export class DungeonScene extends Phaser.Scene {
  private plan!: DungeonPlan;
  private roomIdx = 0;
  private mobs: Mob[] = [];
  private boss?: { sprite: Phaser.GameObjects.Image; total: number; hpBar: Phaser.GameObjects.Graphics };
  private logs = new Map<string, AnswerLog>();
  private hp = 5;
  private maxHp = 5;
  private combo = 0;
  private bestCombo = 0;
  private busy = false;
  private qStart = 0;
  private videoShown = false;
  private stats!: ReturnType<typeof playerStats>;

  private player!: Phaser.GameObjects.Image;
  private hearts: Phaser.GameObjects.Image[] = [];
  private roomLabel!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private qBox?: Phaser.GameObjects.Container;
  private keyHandler?: (e: KeyboardEvent) => void;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor() {
    super('Dungeon');
  }

  init(data: { plan: DungeonPlan }) {
    this.plan = data.plan;
    this.roomIdx = 0;
    this.mobs = [];
    this.boss = undefined;
    this.logs = new Map();
    this.stats = playerStats(game.s);
    this.maxHp = this.hp = this.stats.hp;
    this.combo = this.bestCombo = 0;
    this.busy = false;
    this.hearts = [];
    this.videoShown = false;
  }

  create() {
    backdrop(this, this.plan.isAbyss ? 'abyss' : 'dungeon', GROUND);
    this.player = this.add.image(PLAYER_X, GROUND + 6, `player_${game.s.job}`).setOrigin(0.5, 1).setDepth(5);
    this.sparks = this.add.particles(0, 0, 'spark', {
      speed: { min: 120, max: 420 }, scale: { start: 0.9, end: 0 }, lifespan: 500, emitting: false, blendMode: 'ADD',
    }).setDepth(20);

    for (let i = 0; i < this.maxHp; i++) this.hearts.push(this.add.image(36 + i * 32, 34, 'heart').setDepth(30));
    this.roomLabel = text(this, this.scale.width / 2, 30, '', 26, '#ffffff', { stroke: '#000', strokeThickness: 5 }).setOrigin(0.5).setDepth(30);
    this.comboText = text(this, this.scale.width - 40, 70, '', 40, '#ffc94a', {
      fontFamily: EN_FONT, fontStyle: 'bold italic', stroke: '#5a2a00', strokeThickness: 6,
    }).setOrigin(1, 0.5).setDepth(30);
    button(this, this.scale.width - 70, 30, 110, 40, '撤退', () => confirmBox(this, '现在撤退会失去本次评级，确定吗？', () => this.finish(false)), { size: 18, color: 0x444a6b }).setDepth(30);

    this.events.once('shutdown', () => {
      stop();
      if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
    });
    this.enterRoom();
  }

  // ---------------- 房间流程 ----------------

  private get room(): Room {
    return this.plan.rooms[this.roomIdx];
  }

  private enterRoom() {
    const room = this.room;
    this.roomLabel.setText(`${this.roomIdx + 1}/${this.plan.rooms.length}  ${room.name}`);
    this.player.x = -60;
    this.tweens.add({ targets: this.player, x: PLAYER_X, duration: 500, ease: 'Quad.out' });

    if (room.kind === 'boss' && this.plan.video && !this.videoShown) {
      // 进 Boss 房间前先看一遍课文动画
      this.videoShown = true;
      this.player.x = PLAYER_X;
      playVideo(this.plan.video, `课文动画 · ${this.plan.title}`, () => this.enterRoom());
      return;
    }
    if (room.kind === 'boss') {
      const sprite = this.add.image(1020, GROUND + 6, room.monster).setOrigin(0.5, 1).setDepth(4).setAlpha(0);
      this.tweens.add({ targets: sprite, alpha: 1, duration: 600 });
      this.tweens.add({ targets: sprite, y: GROUND, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      const hpBar = this.add.graphics().setDepth(30);
      this.boss = { sprite, total: room.questions.length, hpBar };
      this.mobs = room.questions.map((q) => ({ q, sprite }));
      this.drawBossHp();
      this.cameras.main.shake(400, 0.006);
      const warn = text(this, 640, 200, 'BOSS 出现！', 56, '#ff5a5a', { stroke: '#000', strokeThickness: 8 }).setOrigin(0.5).setDepth(40);
      this.tweens.add({ targets: warn, scale: 1.2, alpha: 0, delay: 700, duration: 500, onComplete: () => warn.destroy() });
    } else {
      this.boss = undefined;
      this.mobs = room.questions.map((q) => this.spawnMob(q));
      this.layoutMobs(true);
    }
    this.time.delayedCall(650, () => this.nextQuestion());
  }

  private spawnMob(q: Question): Mob {
    const key = q.revenge ? 'ghost' : this.room.monster === 'boss' ? 'goblin' : this.room.monster;
    const sprite = this.add.image(1400, GROUND + 6, key).setOrigin(0.5, 1).setDepth(4);
    if (this.room.kind === 'elite' && !q.revenge) sprite.setScale(1.3).setTint(0xffb0b0);
    const mob: Mob = { q, sprite };
    if (q.revenge) {
      mob.tag = text(this, 0, 0, '怨念', 16, '#e2c6ff', { stroke: '#000', strokeThickness: 4 }).setOrigin(0.5).setDepth(6);
    }
    return mob;
  }

  private layoutMobs(entering = false) {
    this.mobs.forEach((m, i) => {
      const x = 720 + i * 120;
      const scale = i === 0 ? 1 : 0.85;
      const base = this.room.kind === 'elite' && !m.q.revenge ? 1.3 : 1;
      this.tweens.add({ targets: m.sprite, x, scale: base * scale, alpha: i < 5 ? 1 : 0, duration: entering ? 600 + i * 80 : 300, ease: 'Quad.out' });
      if (m.tag) this.tweens.add({ targets: m.tag, x, y: GROUND - 110, alpha: i < 5 ? 1 : 0, duration: entering ? 600 : 300 });
    });
  }

  private drawBossHp() {
    if (!this.boss) return;
    const g = this.boss.hpBar;
    const r = this.mobs.length / this.boss.total;
    g.clear();
    g.fillStyle(0x000000, 0.6).fillRoundedRect(340, 60, 600, 22, 8);
    g.fillStyle(0xff3b3b, 1).fillRoundedRect(340, 60, Math.max(0, 600 * r), 22, 8);
    g.lineStyle(2, 0xffffff, 0.5).strokeRoundedRect(340, 60, 600, 22, 8);
  }

  private nextQuestion() {
    this.busy = false;
    if (!this.mobs.length) return this.roomCleared();
    const q = this.mobs[0].q;
    this.qStart = this.time.now;
    this.showQuestion(q);
  }

  private roomCleared() {
    this.clearQuestion();
    this.boss?.hpBar.destroy();
    const last = this.roomIdx >= this.plan.rooms.length - 1;
    const t = text(this, 640, 220, last ? '副本通关！' : '清理完毕  GO ▶', 52, '#ffe14a', { stroke: '#000', strokeThickness: 8 }).setOrigin(0.5).setDepth(40);
    this.tweens.add({ targets: t, scale: { from: 0.4, to: 1 }, duration: 300, ease: 'Back.out' });
    this.time.delayedCall(1200, () => {
      t.destroy();
      if (last) return this.finish(true);
      this.tweens.add({
        targets: this.player, x: 1400, duration: 600, ease: 'Quad.in',
        onComplete: () => {
          this.roomIdx++;
          this.enterRoom();
        },
      });
    });
  }

  private finish(cleared: boolean) {
    this.clearQuestion();
    const result = finishRun(game.s, this.plan, [...this.logs.values()], this.bestCombo, cleared);
    void game.persist();
    this.scene.start('Result', { result, plan: this.plan });
  }

  // ---------------- 作答结算 ----------------

  private resolve(q: Question, out: Outcome) {
    if (this.busy) return;
    this.busy = true;
    const ms = this.time.now - this.qStart;
    if (!this.logs.has(q.itemId)) this.logs.set(q.itemId, { itemId: q.itemId, firstTry: out.ok && out.clean, ms });

    if (out.ok) {
      this.combo++;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
      this.attack(q);
    } else {
      this.combo = 0;
      this.comboText.setText('');
      this.time.delayedCall(1700, () => this.getHit());
    }
  }

  private attack(q: Question) {
    if (q.kind !== 'pick' || q.mode !== 'listen') speak(speakOf(q));
    if (this.combo >= 2) {
      this.comboText.setText(`${this.combo} COMBO`).setScale(1.4);
      this.tweens.add({ targets: this.comboText, scale: 1, duration: 200 });
    }
    const target = this.mobs[0].sprite;
    const tx = target.x - (this.boss ? 140 : 90);
    this.time.delayedCall(450, () => {
      this.clearQuestion();
      this.tweens.add({
        targets: this.player, x: tx, duration: 140, ease: 'Quad.in',
        onComplete: () => {
          this.hitEffect(target);
          this.tweens.add({ targets: this.player, x: PLAYER_X, duration: 260, delay: 120, ease: 'Quad.out' });
          const mob = this.mobs.shift()!;
          if (this.boss) {
            this.drawBossHp();
            if (!this.mobs.length) this.killSprite(mob.sprite, 2);
          } else {
            this.killSprite(mob.sprite, 1);
            mob.tag?.destroy();
            this.layoutMobs();
          }
          this.time.delayedCall(700, () => this.nextQuestion());
        },
      });
    });
  }

  private hitEffect(target: Phaser.GameObjects.Image) {
    const crit = Math.random() < this.stats.crit;
    const dmg = Math.round(this.stats.atk * (1 + this.combo * this.stats.comboBonus) * (crit ? this.stats.critMult : 1) * (0.9 + Math.random() * 0.2));
    const y = target.y - target.displayHeight * 0.6;
    const slash = this.add.image(target.x - 10, y, 'slash').setDepth(21).setScale(0.6).setTint(crit ? 0xffd34a : 0xffffff);
    this.tweens.add({ targets: slash, scale: 1.1, alpha: 0, angle: 30, duration: 260, onComplete: () => slash.destroy() });
    this.sparks.explode(crit ? 26 : 14, target.x, y);
    this.cameras.main.shake(crit ? 160 : 90, crit ? 0.012 : 0.006);
    target.setTintFill(0xffffff);
    this.time.delayedCall(70, () => target.active && target.clearTint());
    const num = text(this, target.x, y - 30, crit ? `暴击 ${dmg}!` : `${dmg}`, crit ? 44 : 34, crit ? '#ffd34a' : '#ffffff', {
      fontFamily: EN_FONT, fontStyle: 'bold', stroke: '#000', strokeThickness: 6,
    }).setOrigin(0.5).setDepth(40);
    this.tweens.add({ targets: num, y: y - 110, alpha: 0, duration: 800, ease: 'Quad.out', onComplete: () => num.destroy() });
  }

  private killSprite(s: Phaser.GameObjects.Image, size: number) {
    this.sparks.explode(20 * size, s.x, s.y - 40);
    this.tweens.killTweensOf(s);
    this.tweens.add({ targets: s, alpha: 0, scaleY: 0.2, y: s.y + 10, duration: 260, onComplete: () => s.destroy() });
  }

  private getHit() {
    this.clearQuestion();
    const mob = this.mobs[0];
    const s = mob.sprite;
    const ox = s.x;
    this.tweens.add({
      targets: s, x: PLAYER_X + 90, duration: 160, yoyo: true, ease: 'Quad.in',
      onYoyo: () => {
        this.hp--;
        this.hearts[this.hp]?.setTexture('heart_empty');
        this.cameras.main.shake(200, 0.01);
        this.cameras.main.flash(150, 255, 40, 40);
        this.player.setTintFill(0xff4040);
        this.time.delayedCall(120, () => this.player.clearTint());
      },
      onComplete: () => {
        s.x = ox;
        if (this.hp <= 0) {
          const t = text(this, 640, 220, '体力耗尽…', 52, '#ff8080', { stroke: '#000', strokeThickness: 8 }).setOrigin(0.5).setDepth(40);
          this.time.delayedCall(1200, () => {
            t.destroy();
            this.finish(false);
          });
          return;
        }
        // 答错的怪退到队尾，过一会儿还会再出现，直到答对为止
        if (!this.boss) {
          this.mobs.push(this.mobs.shift()!);
          this.layoutMobs();
        } else {
          this.mobs.push(this.mobs.shift()!);
        }
        this.time.delayedCall(400, () => this.nextQuestion());
      },
    });
  }

  // ---------------- 题目界面 ----------------

  private clearQuestion() {
    this.qBox?.destroy();
    this.qBox = undefined;
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
    this.keyHandler = undefined;
  }

  private onKey(fn: (e: KeyboardEvent) => void) {
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
    this.keyHandler = fn;
    window.addEventListener('keydown', fn);
  }

  private frame(q: Question) {
    this.clearQuestion();
    const c = this.add.container(0, 0).setDepth(50);
    c.add(panel(this, 20, PANEL_Y, this.scale.width - 40, 270));
    if (q.revenge) c.add(text(this, 44, PANEL_Y + 12, '👻 怨念怪：之前答错过的内容回来了！', 18, '#d9b8ff'));
    const auto = autoSpeak(q);
    if (auto) {
      c.add(button(this, this.scale.width - 90, PANEL_Y + 50, 90, 56, '🔊', () => speak(speakOf(q)), { size: 30 }));
      speak(speakOf(q));
    }
    this.qBox = c;
    return c;
  }

  private showQuestion(q: Question) {
    if (q.kind === 'pick') this.showPick(q);
    else if (q.kind === 'spell') this.showSpell(q);
    else this.showOrder(q);
  }

  private revealText(c: Phaser.GameObjects.Container, msg: string) {
    c.add(text(this, 640, PANEL_Y + 236, `正确答案：${msg}`, 24, '#7dffa5', { fontStyle: 'bold' }).setOrigin(0.5));
  }

  private showPick(q: PickQ) {
    const c = this.frame(q);
    const isEn = q.mode === 'fill' || q.mode === 'listen';
    const title = q.mode === 'listen' ? '🎧 ' + q.prompt : q.prompt;
    c.add(text(this, 640, PANEL_Y + 44, title, q.mode === 'meaning' ? 40 : 34, '#ffffff', {
      fontFamily: q.mode === 'fill' ? EN_FONT : undefined, align: 'center', wordWrap: { width: 1000 },
    }).setOrigin(0.5));
    if (q.sub) c.add(text(this, 640, PANEL_Y + 88, q.sub, 20, COLORS.dim).setOrigin(0.5));

    const btns: Button[] = [];
    q.options.forEach((opt, i) => {
      const x = 340 + (i % 2) * 600;
      const y = PANEL_Y + 136 + Math.floor(i / 2) * 64;
      const b = button(this, x, y, 560, 54, `${i + 1}. ${opt}`, () => choose(i), {
        size: 26, font: isEn && q.mode !== 'listen' ? EN_FONT : undefined,
      });
      btns.push(b);
      c.add(b);
    });
    const choose = (i: number) => {
      if (this.busy) return;
      const ok = i === q.answer;
      btns[q.answer].bg.setFillStyle(0x2f9e5a);
      if (!ok) {
        btns[i].bg.setFillStyle(0xb8323f);
        this.revealText(c, q.reveal);
        speak(speakOf(q));
      }
      btns.forEach((b) => b.bg.disableInteractive());
      this.resolve(q, ok ? { ok: true, clean: true } : { ok: false });
    };
    this.onKey((e) => {
      const n = Number(e.key);
      if (n >= 1 && n <= q.options.length) choose(n - 1);
    });
  }

  private showSpell(q: SpellQ) {
    const c = this.frame(q);
    c.add(text(this, 640, PANEL_Y + 36, `⚡ 拼写搓招：${q.zh}`, 30).setOrigin(0.5));
    const letters = q.word.split('');
    const slotW = 54;
    const sx = 640 - ((letters.length - 1) * slotW) / 2;
    const slots = letters.map((_, i) => {
      c.add(this.add.rectangle(sx + i * slotW, PANEL_Y + 100, 46, 52, 0x000000, 0.4).setStrokeStyle(2, 0x8ec5ff, 0.6));
      const t = text(this, sx + i * slotW, PANEL_Y + 100, '', 36, '#ffe14a', { fontFamily: EN_FONT, fontStyle: 'bold' }).setOrigin(0.5);
      c.add(t);
      return t;
    });
    let pos = 0;
    let mistakes = 0;
    const used = new Set<number>();
    const tileW = 64;
    const tx = 640 - ((q.tiles.length - 1) * tileW) / 2;
    const tiles = q.tiles.map((ch, i) => {
      const b = button(this, tx + i * tileW, PANEL_Y + 180, 56, 56, ch, () => press(i), { size: 30, font: EN_FONT });
      c.add(b);
      return b;
    });
    const hint = text(this, 640, PANEL_Y + 236, '点字母或直接用键盘输入', 18, COLORS.dim).setOrigin(0.5);
    c.add(hint);

    const press = (i: number) => {
      if (this.busy || used.has(i) || pos >= letters.length) return;
      if (q.tiles[i] === letters[pos]) {
        used.add(i);
        tiles[i].setEnabled(false);
        slots[pos].setText(letters[pos]);
        this.tweens.add({ targets: slots[pos], scale: { from: 1.6, to: 1 }, duration: 150 });
        this.sparks.explode(4, this.player.x + 30, this.player.y - 60);
        pos++;
        if (pos === letters.length) {
          const skill = text(this, 640, 200, `${q.word.toUpperCase()}  斩！`, 60, '#9fe3ff', {
            fontFamily: EN_FONT, fontStyle: 'bold italic', stroke: '#0a2a4a', strokeThickness: 8,
          }).setOrigin(0.5).setDepth(45);
          this.tweens.add({ targets: skill, scale: { from: 0.5, to: 1.15 }, alpha: { from: 1, to: 0 }, duration: 1000, onComplete: () => skill.destroy() });
          this.resolve(q, { ok: true, clean: mistakes === 0 });
        }
      } else {
        mistakes++;
        this.tweens.add({ targets: tiles[i], x: tiles[i].x + 6, duration: 40, yoyo: true, repeat: 2 });
        tiles[i].bg.setFillStyle(0xb8323f);
        this.time.delayedCall(250, () => tiles[i].active && tiles[i].bg.setFillStyle(COLORS.btn));
        hint.setText(`拼错了 ${mistakes}/3 次`).setColor('#ff9a9a');
        if (mistakes >= 3) {
          slots.forEach((s, k) => s.setText(letters[k]).setColor(k < pos ? '#ffe14a' : '#7dffa5'));
          hint.destroy();
          this.revealText(c, `${q.word} = ${q.zh}`);
          speak(q.speak);
          this.resolve(q, { ok: false });
        }
      }
    };
    this.onKey((e) => {
      const k = e.key.toLowerCase();
      if (k.length !== 1) return;
      const exact = q.tiles.findIndex((ch, i) => !used.has(i) && ch === k && ch === letters[pos]);
      const any = q.tiles.findIndex((ch, i) => !used.has(i) && ch === k);
      if (exact >= 0) press(exact);
      else if (any >= 0) press(any);
      else if (/^[a-z]$/.test(k) && !this.busy) {
        // 键盘按了不在候选里的字母，也算一次失误
        const fake = q.tiles.findIndex((_, i) => !used.has(i) && q.tiles[i] !== letters[pos]);
        if (fake >= 0) press(fake);
      }
    });
  }

  private showOrder(q: OrderQ) {
    const c = this.frame(q);
    c.add(text(this, 640, PANEL_Y + 36, `🧩 把单词排成句子：${q.zh}`, 26, '#ffffff', { wordWrap: { width: 1000 } }).setOrigin(0.5));
    const placed: number[] = [];
    let line = this.add.container(0, 0);
    c.add(line);
    c.add(this.add.rectangle(640, PANEL_Y + 100, 1100, 60, 0x000000, 0.35).setStrokeStyle(2, 0x8ec5ff, 0.4));

    const chipW = (s: string) => Math.max(70, s.length * 17 + 30);
    const rowX = (words: string[]) => {
      const total = words.reduce((s, w) => s + chipW(w) + 10, -10);
      let x = 640 - total / 2;
      return words.map((w) => {
        const cx = x + chipW(w) / 2;
        x += chipW(w) + 10;
        return cx;
      });
    };
    const poolXs = rowX(q.chips);
    const pool = q.chips.map((w, i) => {
      const b = button(this, poolXs[i], PANEL_Y + 180, chipW(w), 50, w, () => add(i), { size: 24, font: EN_FONT, color: 0x35406e });
      c.add(b);
      return b;
    });

    const redraw = () => {
      line.destroy();
      line = this.add.container(0, 0);
      c.add(line);
      const words = placed.map((i) => q.chips[i]);
      const xs = rowX(words);
      placed.forEach((pi, k) => {
        line.add(button(this, xs[k], PANEL_Y + 100, chipW(q.chips[pi]), 46, q.chips[pi], () => remove(k), { size: 24, font: EN_FONT, color: 0x2f5d9e }));
      });
    };
    const add = (i: number) => {
      if (this.busy || placed.includes(i)) return;
      placed.push(i);
      pool[i].setVisible(false);
      redraw();
      if (placed.length === q.chips.length) {
        const ok = placed.map((k) => q.chips[k]).join(' ') === q.answer.join(' ');
        if (!ok) {
          line.each((b: Phaser.GameObjects.GameObject) => (b as Button).bg.setFillStyle(0xb8323f));
          this.revealText(c, q.answer.join(' '));
          speak(q.speak);
        } else {
          line.each((b: Phaser.GameObjects.GameObject) => (b as Button).bg.setFillStyle(0x2f9e5a));
        }
        this.resolve(q, ok ? { ok: true, clean: true } : { ok: false });
      }
    };
    const remove = (k: number) => {
      if (this.busy) return;
      const [i] = placed.splice(k, 1);
      pool[i].setVisible(true);
      redraw();
    };
    this.onKey((e) => {
      if (e.key === 'Backspace' && placed.length) remove(placed.length - 1);
    });
  }
}

function autoSpeak(q: Question) {
  return q.kind === 'spell' || q.kind === 'order' || (q.kind === 'pick' && q.mode === 'listen');
}

function speakOf(q: Question) {
  if (q.kind === 'pick') return q.speak ?? (q.mode === 'meaning' ? { text: q.options[q.answer] } : { text: q.reveal });
  return q.speak;
}
