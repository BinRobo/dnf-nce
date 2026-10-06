import Phaser from 'phaser';
import { speak } from '../audio/speech';
import { sfx } from '../audio/sound';
import type { OrderQ, PickQ, Question, SpellQ } from '../systems/questions';
import { button, COLORS, EN_FONT, panel, text, type Button } from '../ui/widgets';

/**
 * 题目面板（屏幕下方 ≤ 35%）。答题时没有倒计时、没有粒子，不干扰阅读。
 * 只负责交互与判定，不管战斗演出；通过回调把结果交给战斗场景。
 */
export const PANEL_Y = 470;
const W = 1280;

export interface QuizCallbacks {
  /** correct；clean = 一次就对、没有失误 */
  onAnswer(correct: boolean, clean: boolean): void;
  /** 拼写每输入一个字母（ok=对）；index 为已完成字母数 */
  onLetter?(ok: boolean, done: number, total: number): void;
  /** 返回 true 表示提示可用并已扣除 */
  onHint?(): boolean;
  hintsLeft: number;
  /** Boss“说糊”机制：显示 Pardon? 按钮 */
  muffled?: boolean;
  onPardon?(): void;
}

export class QuizPanel {
  private box?: Phaser.GameObjects.Container;
  private keyHandler?: (e: KeyboardEvent) => void;
  private locked = false;
  hintUsed = false;

  constructor(private scene: Phaser.Scene, private opts: { spellMode: 'tiles' | 'keyboard'; young: boolean }) {}

  get visible() {
    return !!this.box;
  }

  private frame(q: Question, cb: QuizCallbacks) {
    this.clear();
    this.locked = false;
    this.hintUsed = false;
    const c = this.scene.add.container(0, 280).setDepth(70);
    c.add(panel(this.scene, 16, PANEL_Y, W - 32, 720 - PANEL_Y - 12, 0.96));
    if (q.revenge) c.add(text(this.scene, 40, PANEL_Y + 10, '雾精把这个词偷回去了！上次在这里答错过', 16, '#d9b8ff'));
    // 右侧小按钮：重听 / 提示 / Pardon?
    let bx = W - 80;
    const auto = q.kind === 'spell' || q.kind === 'order' || (q.kind === 'pick' && q.mode === 'listen');
    if (cb.muffled) {
      const pb = button(this.scene, bx - 30, PANEL_Y + 40, 150, 52, 'Pardon? 🔊', () => {
        speak(spk(q));
        cb.onPardon?.();
      }, { size: 22, color: 0x6d2bd9, font: EN_FONT });
      c.add(pb);
      this.scene.tweens.add({ targets: pb, scale: 1.08, duration: 500, yoyo: true, repeat: -1 });
      bx -= 180;
      speak(spk(q), 0.5);
    } else if (auto) {
      c.add(button(this.scene, bx, PANEL_Y + 40, 80, 52, '🔊', () => speak(spk(q)), { size: 26 }));
      bx -= 100;
      speak(spk(q));
    }
    if (cb.hintsLeft > 0 && cb.onHint) {
      const hb = button(this.scene, bx, PANEL_Y + 40, 110, 52, `💡 ${cb.hintsLeft}`, () => {
        if (this.hintUsed || this.locked || !cb.onHint!()) return;
        this.hintUsed = true;
        hb.setEnabled(false);
        sfx('ui_click');
        this.applyHint?.();
      }, { size: 20, color: 0x2f7a4d });
      c.add(hb);
    }
    this.box = c;
    this.scene.tweens.add({ targets: c, y: 0, duration: 220, ease: 'Quad.out' });
    return c;
  }

  private applyHint?: () => void;

  show(q: Question, cb: QuizCallbacks) {
    this.applyHint = undefined;
    if (q.kind === 'pick') this.pick(q, cb);
    else if (q.kind === 'spell') this.spell(q, cb);
    else this.order(q, cb);
  }

  hide(): Promise<void> {
    const c = this.box;
    this.removeKeys();
    this.box = undefined;
    if (!c) return Promise.resolve();
    return new Promise((r) => this.scene.tweens.add({ targets: c, y: 280, duration: 180, ease: 'Quad.in', onComplete: () => { c.destroy(); r(); } }));
  }

  clear() {
    this.removeKeys();
    this.box?.destroy();
    this.box = undefined;
  }

  private onKey(fn: (e: KeyboardEvent) => void) {
    this.removeKeys();
    this.keyHandler = fn;
    window.addEventListener('keydown', fn);
  }

  private removeKeys() {
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
    this.keyHandler = undefined;
  }

  // ---------------- 选择题（听音 / 识词 / 填空） ----------------
  private pick(q: PickQ, cb: QuizCallbacks) {
    const s = this.scene;
    const c = this.frame(q, cb);
    const title = q.mode === 'listen' ? `🎧 ${q.prompt}` : q.prompt;
    c.add(text(s, 560, PANEL_Y + 34, title, q.mode === 'meaning' ? 38 : 30, '#ffffff', {
      fontFamily: q.mode === 'fill' ? EN_FONT : undefined, align: 'center', wordWrap: { width: 900 },
    }).setOrigin(0.5));
    if (q.sub) c.add(text(s, 560, PANEL_Y + 74, q.sub, 19, COLORS.dim).setOrigin(0.5));
    const enOpts = q.mode !== 'listen';
    const btns: Button[] = q.options.map((opt, i) => {
      const b = button(s, 330 + (i % 2) * 600, PANEL_Y + 124 + Math.floor(i / 2) * 62, 560, 52, `${i + 1}. ${opt}`, () => choose(i), {
        size: 25, font: enOpts ? EN_FONT : undefined,
      });
      c.add(b);
      return b;
    });
    const choose = (i: number) => {
      if (this.locked || !btns[i].visible) return;
      this.locked = true;
      const ok = i === q.answer;
      btns[q.answer].bg.setFillStyle(0x2f9e5a);
      if (!ok) btns[i].bg.setFillStyle(0xb8323f);
      sfx(ok ? 'ui_correct' : 'ui_wrong', { volume: ok ? 0.5 : 0.35 });
      cb.onAnswer(ok, ok);
    };
    this.applyHint = () => {
      // 去掉两个错误选项
      const wrong = q.options.map((_, i) => i).filter((i) => i !== q.answer);
      for (const i of Phaser.Utils.Array.Shuffle(wrong).slice(0, 2)) btns[i].setVisible(false);
    };
    this.onKey((e) => {
      const n = Number(e.key);
      if (n >= 1 && n <= q.options.length) choose(n - 1);
    });
  }

  // ---------------- 拼写搓招：每个正确字母 = 一段命中 ----------------
  private spell(q: SpellQ, cb: QuizCallbacks) {
    const s = this.scene;
    const c = this.frame(q, cb);
    const keyboard = this.opts.spellMode === 'keyboard';
    c.add(text(s, 560, PANEL_Y + 30, `⚡ 字母连斩：${q.zh}`, 28).setOrigin(0.5));
    const letters = q.word.split('');
    const slotW = 54;
    const sx = 560 - ((letters.length - 1) * slotW) / 2;
    const slots = letters.map((_, i) => {
      c.add(s.add.rectangle(sx + i * slotW, PANEL_Y + 92, 46, 54, 0x000000, 0.45).setStrokeStyle(2, 0x8ec5ff, 0.7));
      const t = text(s, sx + i * slotW, PANEL_Y + 92, '', 38, '#ffe14a', { fontFamily: EN_FONT, fontStyle: 'bold' }).setOrigin(0.5);
      c.add(t);
      return t;
    });
    let pos = 0;
    let mistakes = 0;
    const wrongAt = new Map<number, number>();
    const used = new Set<number>();
    // 字母块：3–4 年级 2 个干扰字母，5–6 年级 3 个（键盘模式不显示）
    const extra = this.opts.young ? 2 : 3;
    const tiles = keyboard ? [] : Phaser.Utils.Array.Shuffle([...letters, ...q.tiles.filter((t) => !letters.includes(t)).slice(0, extra)]);
    const tileW = 62;
    const tx = 560 - ((tiles.length - 1) * tileW) / 2;
    const tileBtns = tiles.map((ch, i) => {
      const b = button(s, tx + i * tileW, PANEL_Y + 172, 54, 54, ch, () => press(ch, i), { size: 30, font: EN_FONT });
      c.add(b);
      return b;
    });
    const hint = text(s, 560, PANEL_Y + (keyboard ? 160 : 222), keyboard ? '用键盘拼出来，越流畅连斩越漂亮！' : '点字母或用键盘输入', 18, COLORS.dim).setOrigin(0.5);
    c.add(hint);

    const fail = () => {
      this.locked = true;
      slots.forEach((t, k) => t.setText(letters[k]).setColor(k < pos ? '#ffe14a' : '#7dffa5'));
      cb.onAnswer(false, false);
    };
    const press = (ch: string, tileIdx = -1) => {
      if (this.locked || pos >= letters.length) return;
      if (ch === letters[pos]) {
        if (tileIdx >= 0) {
          used.add(tileIdx);
          tileBtns[tileIdx].setEnabled(false);
        } else {
          const k = tiles.findIndex((t, i) => t === ch && !used.has(i));
          if (k >= 0) {
            used.add(k);
            tileBtns[k].setEnabled(false);
          }
        }
        slots[pos].setText(letters[pos]).setColor('#ffe14a').setAlpha(1);
        s.tweens.add({ targets: slots[pos], scale: { from: 1.7, to: 1 }, duration: 140 });
        pos++;
        cb.onLetter?.(true, pos, letters.length);
        if (pos === letters.length) {
          this.locked = true;
          cb.onAnswer(true, mistakes === 0 && !this.hintUsed);
        }
      } else {
        mistakes++;
        cb.onLetter?.(false, pos, letters.length);
        if (tileIdx >= 0) {
          const b = tileBtns[tileIdx];
          s.tweens.add({ targets: b, x: b.x + 6, duration: 40, yoyo: true, repeat: 2 });
        }
        const n = (wrongAt.get(pos) ?? 0) + 1;
        wrongAt.set(pos, n);
        // 同一位置错 2 次：显示该字母轮廓
        if (n >= 2) slots[pos].setText(letters[pos]).setColor('#ffffff').setAlpha(0.3);
        hint.setText(`空挥了 ${mistakes}/3 次`).setColor('#ffb3b3');
        if (mistakes >= 3) fail();
      }
    };
    this.applyHint = () => {
      if (pos < letters.length) slots[pos].setText(letters[pos]).setColor('#ffffff').setAlpha(0.35);
    };
    this.onKey((e) => {
      const k = e.key.toLowerCase();
      if (/^[a-z'-]$/.test(k)) press(k);
    });
  }

  // ---------------- 连词成句 ----------------
  private order(q: OrderQ, cb: QuizCallbacks) {
    const s = this.scene;
    const c = this.frame(q, cb);
    c.add(text(s, 560, PANEL_Y + 30, `🧩 把单词排成句子：${q.zh}`, 24, '#ffffff', { wordWrap: { width: 900 } }).setOrigin(0.5));
    c.add(s.add.rectangle(560, PANEL_Y + 96, 1060, 60, 0x000000, 0.35).setStrokeStyle(2, 0x8ec5ff, 0.4));
    const placed: number[] = [];
    let line = s.add.container(0, 0);
    c.add(line);
    let mistakes = 0;
    const chipW = (w: string) => Math.max(70, w.length * 17 + 30);
    const rowX = (words: string[]) => {
      const total = words.reduce((sum, w) => sum + chipW(w) + 10, -10);
      let x = 560 - total / 2;
      return words.map((w) => {
        const cx = x + chipW(w) / 2;
        x += chipW(w) + 10;
        return cx;
      });
    };
    const xs = rowX(q.chips);
    const pool = q.chips.map((w, i) => {
      const b = button(s, xs[i], PANEL_Y + 178, chipW(w), 50, w, () => add(i), { size: 24, font: EN_FONT, color: 0x35406e });
      c.add(b);
      return b;
    });
    const redraw = () => {
      line.destroy();
      line = s.add.container(0, 0);
      c.add(line);
      const words = placed.map((i) => q.chips[i]);
      const px = rowX(words);
      placed.forEach((pi, k) => line.add(button(s, px[k], PANEL_Y + 96, chipW(q.chips[pi]), 46, q.chips[pi], () => remove(k), { size: 24, font: EN_FONT, color: 0x2f5d9e })));
    };
    const add = (i: number) => {
      if (this.locked || placed.includes(i)) return;
      placed.push(i);
      pool[i].setVisible(false);
      redraw();
      sfx('ui_click', { volume: 0.4 });
      if (placed.length === q.chips.length) {
        this.locked = true;
        const ok = placed.map((k) => q.chips[k]).join(' ') === q.answer.join(' ');
        line.each((b: Phaser.GameObjects.GameObject) => (b as Button).bg.setFillStyle(ok ? 0x2f9e5a : 0xb8323f));
        sfx(ok ? 'ui_correct' : 'ui_wrong', { volume: ok ? 0.5 : 0.35 });
        cb.onAnswer(ok, ok && mistakes === 0);
      }
    };
    const remove = (k: number) => {
      if (this.locked) return;
      if (k === 0 && fixedFirst) return;
      const [i] = placed.splice(k, 1);
      pool[i].setVisible(true);
      mistakes++;
      redraw();
    };
    let fixedFirst = false;
    this.applyHint = () => {
      // 固定第一个词
      placed.splice(0, placed.length).forEach((i) => pool[i].setVisible(true));
      const first = q.chips.findIndex((w) => w === q.answer[0]);
      fixedFirst = true;
      add(first);
    };
    this.onKey((e) => {
      if (e.key === 'Backspace' && placed.length) remove(placed.length - 1);
    });
  }

  /** 答错后的讲解卡：正确答案 + 原声 + 中文提示，孩子点“明白了”继续 */
  explain(q: Question): Promise<void> {
    const s = this.scene;
    this.clear();
    const c = s.add.container(0, 0).setDepth(75);
    c.add(panel(s, 16, PANEL_Y, W - 32, 720 - PANEL_Y - 12, 0.97));
    c.add(text(s, 560, PANEL_Y + 34, '没关系，记住它：', 22, '#ffd27a').setOrigin(0.5));
    const answer = q.kind === 'spell' ? `${q.word} = ${q.zh}` : q.kind === 'order' ? q.answer.join(' ') : q.reveal;
    c.add(text(s, 560, PANEL_Y + 92, answer, 34, '#7dffa5', { fontFamily: EN_FONT, fontStyle: 'bold', align: 'center', wordWrap: { width: 1000 } }).setOrigin(0.5));
    const zh = q.kind === 'order' ? q.zh : q.kind === 'pick' && q.sub ? q.sub : '';
    if (zh) c.add(text(s, 560, PANEL_Y + 140, zh, 20, COLORS.dim).setOrigin(0.5));
    c.add(text(s, 560, PANEL_Y + 170, '待会儿它还会换个样子回来哦', 16, COLORS.dim).setOrigin(0.5));
    speak(spk(q));
    this.box = c;
    return new Promise((r) => {
      c.add(button(s, 1080, PANEL_Y + 92, 90, 56, '🔊', () => speak(spk(q)), { size: 28 }));
      c.add(button(s, 560, PANEL_Y + 212, 240, 52, '明白了 ▶', () => {
        this.removeKeys();
        this.box = undefined;
        c.destroy();
        r();
      }, { color: 0x3b62d9, size: 22 }));
      this.onKey((e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          this.removeKeys();
          this.box = undefined;
          c.destroy();
          r();
        }
      });
    });
  }
}

export function spk(q: Question) {
  if (q.kind === 'pick') return q.speak ?? (q.mode === 'meaning' ? { text: q.options[q.answer] } : { text: q.reveal.split(' = ')[0] });
  return q.speak;
}
